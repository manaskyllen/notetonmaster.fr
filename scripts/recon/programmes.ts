/* eslint-disable @typescript-eslint/no-explicit-any -- script de reconnaissance ponctuel, JSON non typé */
/**
 * Read-only reconnaissance of program sources for the public establishments.
 * Uses the project's PoliteHttpClient (robots.txt, 1 request / 2 s / host, our User-Agent).
 * Writes nothing to the database. Usage (dans le worker) : tsx scripts/recon/programmes.ts <etabs.tsv> <out.json>
 * etabs.tsv : id, nom, site, siteDomains, type, nombre de parcours (export SQL des établissements publics).
 * Résultats bruts : jamais versionnés.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PoliteHttpClient, MemoryHostStore, crawlerUserAgent, MB } from '@/lib/data/http';
import { isAllowed } from '@/lib/data/robots';
import { lookup } from 'node:dns/promises';

const [inFile, outFile] = process.argv.slice(2) as [string, string];
if (!inFile || !outFile) throw new Error('usage : programmes.ts <etabs.tsv> <out.json>');
const rows = readFileSync(inFile, 'utf8')
  .trim()
  .split('\n')
  .map((l) => l.split('\t'));

const TWO_LABEL = /\.(gouv|asso|ac|co)\.\w+$/;
const regDomain = (h: string) => {
  const p = h
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.');
  return TWO_LABEL.test(h) ? p.slice(-3).join('.') : p.slice(-2).join('.');
};

const store = new MemoryHostStore();
const allowed = new Set<string>();
for (const r of rows) {
  if (r[2]) allowed.add(regDomain(new URL(r[2]).hostname));
  for (const d of (r[3] ?? '').split(',').filter(Boolean)) allowed.add(d);
}
const client = new PoliteHttpClient({
  userAgent: crawlerUserAgent(),
  allowedDomains: [...allowed],
  deniedHosts: [/(^|[.-])(test|preprod|recette|staging|dev|qualif|intra|cas|ent)[.-]/i, /testksup/],
  store,
  maxRetries: 1,
});

type Got = {
  ok: boolean;
  status?: number;
  text?: string;
  skip?: string;
  error?: string;
  ctype?: string | null;
};
let nreq = 0;
async function get(url: string, accept: any[], maxBytes = 3 * MB): Promise<Got> {
  try {
    nreq++;
    const r = await client.get(url, { accept, maxBytes, timeoutMs: 30_000 });
    if (r.kind === 'skip') return { ok: false, skip: r.reason };
    if (r.kind !== 'response') return { ok: false, error: r.kind };
    const text = r.body?.toString('utf8') ?? '';
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text, ctype: r.contentType };
  } catch (e: any) {
    return {
      ok: false,
      error: String(e?.message ?? e).slice(0, 160),
      status: e?.status ?? undefined,
    };
  }
}

function cms(html: string): string[] {
  const s: string[] = [];
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (gen) s.push(`generator:${gen}`);
  if (/\/_plugins\/|\/_resources\/|ametys/i.test(html)) s.push('Ametys');
  if (/k-?sup|jsbsoft|kportal|\/jsp\/|\/servlet\/com\./i.test(html)) s.push('K-Sup');
  if (/drupal|\/sites\/default\/files|data-drupal/i.test(html)) s.push('Drupal');
  if (/wp-content|wp-json|wp-includes/i.test(html)) s.push('WordPress');
  if (/typo3/i.test(html)) s.push('TYPO3');
  if (/jahia/i.test(html)) s.push('Jahia');
  if (/liferay/i.test(html)) s.push('Liferay');
  if (/joomla/i.test(html)) s.push('Joomla');
  if (/__NEXT_DATA__|_next\/static/.test(html)) s.push('Next.js');
  if (/__NUXT__|_nuxt\//.test(html)) s.push('Nuxt');
  return [...new Set(s)];
}

function links(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      out.push(new URL(m[1]!.replace(/&amp;/g, '&'), base).toString());
    } catch {}
  }
  return [...new Set(out)];
}

const FIELD_RE: Record<string, RegExp> = {
  intitule: /programName|^title$|^name$|intitule/i,
  parcours: /subProgram|parcours|specialization|option/i,
  ue: /^course$|courseName|courseID|^ue$|teachingUnit/i,
  ects: /credits|ects/i,
  objectifs: /objective|learningObjectives|programDescription|objectif/i,
  competences: /skill|competen/i,
  admission: /admission|prerequisite|prerequis|studentPlaces|access/i,
  debouches: /career|profession|job|debouch|metier|insertion/i,
  langues: /language|langue|lang$/i,
};
const fieldsFromNames = (names: Iterable<string>) => {
  const n = [...names];
  return Object.entries(FIELD_RE)
    .filter(([, re]) => n.some((x) => re.test(x)))
    .map(([k]) => k);
};
const HTML_FIELDS: Record<string, RegExp> = {
  ects: /\bECTS\b/i,
  objectifs: /objectifs?/i,
  competences: /comp[ée]tences/i,
  admission: /admission|conditions d.acc[èe]s|pr[ée]requis/i,
  debouches: /d[ée]bouch[ée]s|insertion professionnelle|m[ée]tiers/i,
  langues: /langues? d.enseignement|enseign[ée] en (anglais|fran)/i,
  ue: /unit[ée]s? d.enseignement|\bUE\b/,
};

async function oai(host: string) {
  const base = `https://${host}/_odf/OAI`;
  const id = await get(`${base}?verb=Identify`, ['xml', 'html', 'text']);
  const res: any = { host, identify: id.ok && /<Identify/i.test(id.text ?? '') };
  if (!res.identify) {
    res.why = id.skip ?? id.error ?? `HTTP ${id.status}${id.ok ? ' (pas de réponse OAI)' : ''}`;
    return res;
  }
  res.repositoryName = /<repositoryName>([^<]*)/.exec(id.text!)?.[1];
  const lmf = await get(`${base}?verb=ListMetadataFormats`, ['xml', 'text']);
  res.formats = [...(lmf.text ?? '').matchAll(/<metadataPrefix>([^<]+)/g)].map((m) => m[1]);
  const prefix: string = res.formats.includes('cdm')
    ? 'cdm'
    : (res.formats.find((f: string) => f !== 'oai_dc') ?? res.formats[0] ?? 'cdm');
  res.prefix = prefix;
  const lr = await get(
    `${base}?verb=ListRecords&metadataPrefix=${prefix}`,
    ['xml', 'text'],
    15 * MB,
  );
  if (!lr.ok) {
    res.listRecords = lr.skip ?? lr.error ?? `HTTP ${lr.status}`;
    return res;
  }
  const recs = (lr.text ?? '').split(/<record[\s>]/).slice(1, 4);
  res.records = recs.length;
  res.completeListSize = /completeListSize="(\d+)"/.exec(lr.text ?? '')?.[1];
  const names = new Set<string>();
  for (const r of recs)
    for (const m of r.matchAll(/<(?:[\w-]+:)?([A-Za-z][\w-]*)[\s>\/]/g)) names.add(m[1]!);
  res.elements = [...names];
  res.fields = fieldsFromNames(names);
  res.sampleTitles = recs
    .map((r) =>
      /<(?:\w+:)?(?:programName|title)[^>]*>(?:<[^>]+>)*([^<]{3,120})/.exec(r)?.[1]?.trim(),
    )
    .filter(Boolean);
  return res;
}

async function sitemapMasters(urls: string[]) {
  const found = new Set<string>();
  const seen: string[] = [];
  const queue = [...urls];
  let budget = 5;
  while (queue.length && budget-- > 0) {
    const u = queue.shift()!;
    if (/\.gz$/.test(u)) continue;
    const r = await get(u, ['xml', 'text'], 20 * MB);
    seen.push(`${u} → ${r.status ?? r.skip ?? r.error}`);
    if (!r.ok) continue;
    const locs = [...(r.text ?? '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&'),
    );
    if (/<sitemapindex/i.test(r.text ?? '')) {
      const pri = locs.filter((l) => /formation|program|odf|offre|cursus|diplom|master/i.test(l));
      queue.unshift(...pri.slice(0, 3));
      if (!pri.length) queue.push(...locs.slice(0, 3));
    } else {
      for (const l of locs) if (/master/i.test(l) && !/\.pdf($|\?)/i.test(l)) found.add(l);
    }
  }
  return { seen, masters: [...found] };
}

const NOT_PROGRAM =
  /(actualit|news|agenda|[ée]v[ée]nement|event|soutenance|recherche|search|inscri|candidat|international|erasmus|mobilit|portes-ouvertes|appel|marche|offres-d-emploi|recrutement|laboratoire|these|doctorat|\?)/i;
const IS_PROGRAM =
  /(\/(formations?|education|odf|programmes?|diplomes?|catalogue|offre[-\w]*)\/.*master)|(\/masters?(-degree)?\/[^/]+)|(master-[\w-]+-parcours)|(\/(mention|parcours)-)/i;
function pickThree(urls: string[]) {
  const prog = urls.filter((u) => !NOT_PROGRAM.test(u) && IS_PROGRAM.test(u));
  const fr = prog.filter((u) => !/\/en\//.test(u));
  const l = fr.length ? fr : prog;
  if (!l.length) return [];
  if (l.length <= 3) return l;
  return [
    l[Math.floor(l.length * 0.2)],
    l[Math.floor(l.length * 0.5)],
    l[Math.floor(l.length * 0.8)],
  ];
}

function structured(html: string) {
  const types = new Set<string>();
  const keys = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1] ?? '');
      const walk = (o: any, depth = 0) => {
        if (!o || typeof o !== 'object' || depth > 4) return;
        if (Array.isArray(o)) return o.forEach((x) => walk(x, depth));
        if (o['@type']) [].concat(o['@type']).forEach((t: string) => types.add(t));
        if (o['@type'] && /Course|Program|Educational/i.test(String(o['@type'])))
          Object.keys(o).forEach((k) => keys.add(k));
        for (const v of Object.values(o)) walk(v, depth + 1);
      };
      walk(j);
    } catch {
      types.add('(JSON-LD illisible)');
    }
  }
  const micro = new Set(
    [...html.matchAll(/itemtype=["']https?:\/\/schema\.org\/(\w+)/gi)].map((m) => m[1]),
  );
  const props = new Set([...html.matchAll(/itemprop=["']([\w\s]+)["']/gi)].map((m) => m[1]));
  return {
    jsonld: [...types],
    jsonldKeys: [...keys],
    microdata: [...micro],
    itemprops: [...props].slice(0, 30),
  };
}

async function recon(r: string[]) {
  const [id = '', name = '', website = '', siteDomains = '', , nprog = '0'] = r;
  const out: any = {
    id,
    name,
    website,
    parcours: Number(nprog),
    lienFiche: 'absent (aucun lien de fiche dans nos données) : site principal',
  };
  if (!website) return { ...out, error: 'pas de site' };
  const site = new URL(website);
  const dom = regDomain(site.hostname);
  out.domain = dom;
  // robots of the main host
  const robots = await client.robotsFor(site);
  const st = await store.get(site.host);
  const star = robots.groups.find((g) => g.agents.includes('*'));
  const ours = robots.groups.find((g) =>
    g.agents.some((a) => a.toLowerCase() === 'notetonmasterbot'),
  );
  out.robots = {
    status: st?.robotsStatus,
    mode: robots.mode,
    rootAllowed: isAllowed(robots, client.userAgent, '/').allowed,
    disallowStar: star?.rules
      .filter((x) => !x.allow)
      .map((x) => x.pattern)
      .slice(0, 12),
    ourGroup: !!ours,
    crawlDelay: star?.crawlDelay ?? ours?.crawlDelay,
    sitemaps: robots.sitemaps,
  };
  // home page
  const home = await get(site.toString(), ['html']);
  out.home = { status: home.status, skip: home.skip, error: home.error };
  const hl = home.text ? links(home.text, site.toString()) : [];
  out.cmsHome = home.text ? cms(home.text) : [];
  const subdomains = new Set<string>();
  for (const l of hl) {
    const h = new URL(l).hostname;
    if (h === dom || h.endsWith('.' + dom)) subdomains.add(h);
  }
  for (const d of siteDomains.split(',').filter(Boolean)) subdomains.add(d);
  out.subdomains = [...subdomains];
  const formLinks = hl.filter((l) => {
    const h = new URL(l).hostname;
    return (
      (h === dom || h.endsWith('.' + dom)) &&
      /formation|offre|catalogue|odf|programme|master|etudes|cursus/i.test(l) &&
      !/\.pdf/i.test(l)
    );
  });
  out.formationLinks = formLinks.slice(0, 8);
  for (const g of [
    'formations',
    'formation',
    'odf',
    'offre-formation',
    'offre-de-formation',
    'catalogue-formation',
  ]) {
    const h = `${g}.${dom}`;
    if (subdomains.has(h)) continue;
    try {
      await lookup(h);
      subdomains.add(h);
      (out.dnsGuess ??= []).push(h);
    } catch {}
  }
  const fHosts = [...subdomains].filter((h) =>
    /formation|offre|odf|catalogue|programme|cursus|etudes|fc\.|alternance/i.test(
      h.split('.')[0] ?? '',
    ),
  );
  for (const l of formLinks) fHosts.push(new URL(l).hostname);
  const candidates = [...new Set([site.hostname, ...fHosts])].slice(0, 3);
  out.oaiHosts = candidates;
  // formation entry page (CMS of the catalogue)
  let entry: Got | null = null;
  const score = (l: string) => {
    const u = new URL(l);
    let sc = 0;
    if (/formation|offre|odf|catalogue/.test(u.hostname.split('.')[0] ?? '')) sc += 5;
    if (
      /offre-de-formation|offre-formation|catalogue|trouver|rechercher-une-formation|toutes-les-formations|nos-formations|formations\/?$/i.test(
        u.pathname,
      )
    )
      sc += 4;
    if (/appel|marche|emploi|recrut|actualit/i.test(u.pathname)) sc -= 10;
    if (/\/formations?\/?$|\/formations?\/(fr|masters?)\/?$/i.test(u.pathname)) sc += 3;
    if (/master/i.test(u.pathname)) sc += 2;
    if (
      /inscri|candidat|droits|exoner|lycee|alternance|apprentissage|continue|international/i.test(
        u.pathname,
      )
    )
      sc -= 3;
    return sc;
  };
  for (const g of fHosts) formLinks.push(`https://${g}/`);
  const ranked = [...new Set(formLinks)].sort((a, b) => score(b) - score(a));
  const entryUrl = ranked[0] ?? null;
  let masterLinks: string[] = [];
  const inDom = (l: string) => {
    try {
      return allowed.has(regDomain(new URL(l).hostname));
    } catch {
      return false;
    }
  };
  if (entryUrl) {
    entry = await get(entryUrl, ['html']);
    out.entry = {
      url: entryUrl,
      status: entry.status,
      skip: entry.skip,
      error: entry.error,
      cms: entry.text ? cms(entry.text) : [],
    };
    if (entry.text) {
      const el = links(entry.text, entryUrl).filter(inDom);
      masterLinks = el.filter(
        (l) => /master/i.test(l) && !/\.pdf/i.test(l) && !NOT_PROGRAM.test(l),
      );
      if (masterLinks.length < 3) {
        const hop = el
          .filter(
            (l) =>
              /master|diplome|catalogue|offre|recherche|type.*diplome|niveau/i.test(l) &&
              l.replace(/^http:/, 'https:') !== entryUrl.replace(/^http:/, 'https:') &&
              !NOT_PROGRAM.test(l) &&
              !/\.pdf/i.test(l),
          )
          .sort((a, b) => score(b) - score(a))[0];
        if (hop) {
          const h2 = await get(hop, ['html']);
          out.entry.hop = { url: hop, status: h2.status, skip: h2.skip };
          if (h2.text) {
            masterLinks.push(
              ...links(h2.text, hop).filter(
                (l) => inDom(l) && /master/i.test(l) && !/\.pdf/i.test(l),
              ),
            );
            out.entry.hop.cms = cms(h2.text);
          }
        }
      }
      masterLinks = [...new Set(masterLinks)].filter((l) => l !== entryUrl);
    }
  }
  // OAI-PMH
  out.oai = [];
  for (const h of candidates) out.oai.push(await oai(h));
  // sitemap
  const smUrls = robots.sitemaps.length
    ? robots.sitemaps.filter((u) => u.includes(dom))
    : [`${site.origin}/sitemap.xml`];
  const formHost = candidates.find((h) => h !== site.hostname);
  if (formHost) {
    const fr = await client.robotsFor(new URL(`https://${formHost}/`));
    smUrls.push(...(fr.sitemaps.length ? fr.sitemaps : [`https://${formHost}/sitemap.xml`]));
    out.formHostRobots = {
      host: formHost,
      mode: fr.mode,
      sitemaps: fr.sitemaps,
      disallowStar: fr.groups
        .find((g) => g.agents.includes('*'))
        ?.rules.filter((x) => !x.allow)
        .map((x) => x.pattern)
        .slice(0, 12),
    };
  }
  const sm = await sitemapMasters([...new Set(smUrls)].slice(0, 4));
  out.sitemap = {
    seen: sm.seen,
    masterUrls: sm.masters.length,
    programUrls: sm.masters.filter((u) => !NOT_PROGRAM.test(u) && IS_PROGRAM.test(u)).length,
  };
  let pages = pickThree(sm.masters);
  if (!pages.length && masterLinks.length) {
    pages = pickThree(masterLinks);
    if (!pages.length)
      pages = masterLinks
        .filter((l) => new URL(l).pathname.split('/').filter(Boolean).length >= 2)
        .slice(0, 3);
    out.pagesFrom = 'page formation (pas de master dans le sitemap)';
  } else if (pages.length) out.pagesFrom = 'sitemap';
  out.pages = [];
  const pdfs = new Set<string>();
  for (const p of pages) {
    const g = await get(p!, ['html']);
    const pr: any = { url: p, status: g.status, skip: g.skip, error: g.error };
    if (g.text) {
      pr.cms = cms(g.text);
      Object.assign(pr, structured(g.text));
      const txt = g.text
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
      pr.htmlFields = Object.entries(HTML_FIELDS)
        .filter(([, re]) => re.test(txt))
        .map(([k]) => k);
      for (const l of links(g.text, p!)) if (/\.pdf($|\?)/i.test(l)) pdfs.add(l);
    }
    out.pages.push(pr);
  }
  for (const t of [home.text, entry?.text])
    if (t) for (const l of links(t, site.toString())) if (/\.pdf($|\?)/i.test(l)) pdfs.add(l);
  const pl = [...pdfs];
  out.pdf = {
    catalogOdf: pl.filter((l) => /_plugins\/odf\/.*\.pdf|catalog\.pdf/i.test(l)).slice(0, 3),
    livrets: pl
      .filter((l) =>
        /livret|brochure|plaquette|programme|maquette|syllabus|guide|catalogue|fiche/i.test(l),
      )
      .slice(0, 5),
    total: pl.length,
  };
  return out;
}

async function main() {
  const results: any[] = [];
  const queue = [...rows];
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      for (;;) {
        const r = queue.shift();
        if (!r) return;
        try {
          results.push(await recon(r));
        } catch (e: any) {
          results.push({
            id: r[0],
            name: r[1],
            website: r[2],
            parcours: Number(r[5]),
            error: String(e?.stack ?? e).slice(0, 300),
          });
        }
        console.error(
          `[${results.length}/${rows.length}] ${r[1]} (${Math.round((Date.now() - t0) / 1000)} s, ${nreq} req)`,
        );
        writeFileSync(outFile, JSON.stringify(results, null, 1));
      }
    }),
  );
  writeFileSync(outFile, JSON.stringify(results, null, 1));
}
main();
