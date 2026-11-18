/**
 * Récupère quelques pages de parcours réelles et les réduit en extraits d'étude, en local
 * (data/recon/univ-sites/<gabarit>/<nom>.html, hors git) : contenu principal seul, sans script, style,
 * image, navigation ni formulaire ; blocs de contact retirés, mails, téléphones et noms filtrés
 * (lib/data/pii.ts). Client poli du projet (robots.txt, 2 s par hôte, notre User-Agent).
 *
 * Usage (dans le worker) : tsx scripts/recon/fixtures-programmes.ts <liste.tsv> [--local]
 * --local : rejoue seulement les filtres sur les extraits déjà écrits, sans requête.
 * liste.tsv : gabarit, nom, URL (une page par ligne).
 * Ces extraits restent des contenus des universités : ils ne sont jamais versionnés. Les tests
 * utilisent des pages fictives au même gabarit (fixtures/live/univ-sites/).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PoliteHttpClient, MemoryHostStore, crawlerUserAgent, MB } from '@/lib/data/http';
import { scrubPii } from '@/lib/data/pii';
import {
  inlineText,
  isEl,
  parseHtml,
  query,
  queryAll,
  removeAll,
  textOf,
  toHtml,
  type El,
} from '@/lib/connectors/univ-sites/html';

const [listFile] = process.argv.slice(2);
if (!listFile) throw new Error('usage : fixtures-programmes.ts <liste.tsv>');
const rows = readFileSync(listFile, 'utf8')
  .trim()
  .split('\n')
  .map((l) => l.split('\t'));
const domains = [
  ...new Set(rows.map((r) => new URL(r[2]!).hostname.split('.').slice(-2).join('.'))),
];
const client = new PoliteHttpClient({
  userAgent: crawlerUserAgent(),
  allowedDomains: domains,
  store: new MemoryHostStore(),
  maxRetries: 1,
});

const DROP =
  'script, style, noscript, template, svg, img, picture, video, audio, iframe, object, canvas, form, input, select, nav, header, footer, link, meta, aside[role=complementary], [class*=person], [class*=contact], [class*=temoignage], [class*=testimon], [class*=author], [itemtype*=Person], .modal';
const MAIN = [
  'main',
  '[role=main]',
  '#main-content',
  '#main',
  '#content',
  '.main-content',
  'article',
  'body',
];
const CONTACT =
  /(contacts?\b|responsables?\b|[ée]quipe p[ée]dagogique|secr[ée]tariat|^scolarit[ée]|nous contacter|^direction|coordinat|^enseignants?|intervenants?|ils en parlent|t[ée]moignages?|portraits?)/i;
const KEEP_ATTRS = new Set([
  'class',
  'id',
  'role',
  'aria-controls',
  'aria-labelledby',
  'aria-expanded',
  'href',
  'colspan',
  'rowspan',
  'hidden',
  'open',
  'data-tab',
  'data-target',
  'data-bs-target',
  'itemtype',
  'itemprop',
]);
const HEADING = /^h[1-6]$/;

function clean(el: El) {
  for (const k of Object.keys(el.attrs)) if (!KEEP_ATTRS.has(k)) delete el.attrs[k];
  if (el.attrs.href && /^(mailto|tel|javascript):/i.test(el.attrs.href)) delete el.attrs.href;
  if (el.attrs.href) el.attrs.href = el.attrs.href.replace(/\?.*$/, '');
  el.children = el.children.map((c) => {
    if (isEl(c)) {
      clean(c);
      return c;
    }
    const t = scrubPii(c).text;
    const pad = (re: RegExp) => (re.test(c) ? ' ' : '');
    return t ? pad(/^\s/) + t + pad(/\s$/) : pad(/\s/);
  });
}

/** Removes a contact heading and what follows it until the next heading of the same or higher level. */
function dropContactBlocks(root: El) {
  for (const h of queryAll(root, 'h2, h3, h4, h5, summary, [role=tab], button')) {
    if (!CONTACT.test(textOf(h))) continue;
    const parent = h.parent;
    if (!parent) continue;
    if (h.tag === 'summary' && parent.tag === 'details') {
      parent.children = [];
      continue;
    }
    const panelId = h.attrs['aria-controls'];
    if (panelId) for (const p of queryAll(root, `#${panelId}`)) p.children = [];
    const level = HEADING.test(h.tag) ? Number(h.tag[1]) : 9;
    const i = parent.children.indexOf(h);
    let j = i + 1;
    for (; j < parent.children.length; j++) {
      const c = parent.children[j]!;
      if (isEl(c) && HEADING.test(c.tag) && Number(c.tag[1]) <= level) break;
    }
    parent.children.splice(i, j - i);
  }
}

/**
 * Personal data split across several nodes (« <strong>Responsable :</strong> Prénom NOM », a mail
 * address cut by tags): removes the smallest element whose whole text still contains some.
 */
function scrubTree(el: El): number {
  let removed = 0;
  for (const c of [...el.children]) if (isEl(c)) removed += scrubTree(c);
  for (const c of [...el.children]) {
    if (!isEl(c)) continue;
    const t = inlineText(c);
    if (t.length <= 1500 && scrubPii(t).removed > 0) {
      el.children.splice(el.children.indexOf(c), 1);
      removed++;
    }
  }
  return removed;
}

const local = process.argv[3] === '--local';

(async () => {
  if (local) {
    // re-runs the filters on the extracts already written, without any request
    for (const [kind, name] of rows) {
      const file = join('data/recon/univ-sites', kind!, `${name}.html`);
      const src = readFileSync(file, 'utf8');
      const header = src.slice(0, src.indexOf('-->') + 4);
      const doc = parseHtml(src.slice(header.length));
      removeAll(doc, DROP);
      dropContactBlocks(doc);
      const n = scrubTree(doc);
      clean(doc);
      writeFileSync(file, header + toHtml(doc).replace(/\n\s*\n+/g, '\n') + '\n');
      console.log('OK', file, 'éléments retirés :', n);
    }
    return;
  }
  for (const [kind, name, url] of rows) {
    const r = await client.get(url!, { accept: ['html'], maxBytes: 5 * MB });
    if (r.kind !== 'response' || r.status !== 200 || !r.body) {
      console.log('X', url, r.kind === 'response' ? r.status : 'reason' in r ? r.reason : r.kind);
      continue;
    }
    const doc = parseHtml(r.body.toString('utf8'));
    const main = MAIN.map((s) => query(doc, s)).find(Boolean) ?? doc;
    removeAll(main, DROP);
    dropContactBlocks(main);
    scrubTree(main);
    clean(main);
    const html = toHtml(main).replace(/\n\s*\n+/g, '\n');
    const file = join('data/recon/univ-sites', kind!, `${name}.html`);
    mkdirSync(dirname(file), { recursive: true });
    const header = `<!-- ${url} · récupéré le ${new Date().toISOString().slice(0, 10)} · extrait réduit (contenu principal), contacts et données personnelles retirés -->\n`;
    writeFileSync(file, header + html + '\n');
    console.log('OK', file, html.length);
  }
})();
