/**
 * Imports the guides of content/articles/*.md (README.md aside) as drafts:
 *   pnpm articles:import [--dir=content/articles] [--dry-run]
 * - an article is recognised by its slug: created, or updated while it is not online; a guide
 *   already published (or scheduled) is never touched;
 * - every token and block is checked (a token of the README, an establishment of the database, a
 *   block and its settings), and every link /guides/… must lead to a guide of the database or of
 *   the files (a link to a city that is not open is a warning: it blocks the publication only);
 * - a report per article, then the total. Exit 1 when something is unknown or broken.
 * The figures of the guides are recomputed at the end (ArticleFigures).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockError, BLOCK_LIKE_RE, parseBlock } from '../lib/articles/blocks';
import { cityScope, findUniversity } from '../lib/articles/figures';
import { computeFigures, refreshArticleFigures } from '../lib/articles/figures.server';
import {
  slugify,
  THEMES,
  themeBySlug,
  isValidSlug,
  TITLE_MAX,
  META_MIN,
  META_MAX,
} from '../lib/articles/model';
import { internalLinkError } from '../lib/articles/render';
import { isKnownToken, resolveToken, tokensIn } from '../lib/articles/tokens';
import { prisma } from '../lib/db';
import type { ArticleTheme } from '../lib/db/generated/enums';

const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ??
  (process.argv.includes(`--${k}`) ? '' : undefined);
const DIR = arg('dir') || 'content/articles';
const DRY = arg('dry-run') !== undefined;

interface Front {
  titre: string;
  slug: string;
  ville: string;
  meta_description: string;
  mot_cle: string;
  mots_cles_secondaires: string[];
  chapo: string;
  liens_articles: string[];
  theme?: string;
  mots_cles_recherche?: string[];
  signature?: string;
}

/** The YAML header of the files: one `key: value` per line, values written as JSON. */
function parse(file: string): { front: Front; body: string } {
  const raw = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) throw new Error('en-tête YAML manquant');
  const front: Record<string, unknown> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2]!.replace(/\s+#.*$/, '').trim();
    try {
      front[kv[1]!] = JSON.parse(v);
    } catch {
      front[kv[1]!] = v.replace(/^["']|["']$/g, '');
    }
  }
  for (const k of ['titre', 'slug', 'ville', 'meta_description', 'mot_cle', 'chapo'])
    if (typeof front[k] !== 'string' || !(front[k] as string).trim())
      throw new Error(`champ « ${k} » manquant`);
  return { front: front as unknown as Front, body: raw.slice(m[0].length).trim() + '\n' };
}

/** Theme from the header, else from the slug. */
function themeOf(f: Front): ArticleTheme {
  const t = themeBySlug(f.theme);
  if (t) return t.id;
  const s = f.slug;
  if (/selectif/.test(s)) return 'SELECTIVITE';
  if (/alternance/.test(s)) return 'ALTERNANCE';
  if (/europe/.test(s)) return 'EUROPE';
  if (/calendrier/.test(s)) return 'CALENDRIER';
  if (/taux|methode/.test(s)) return 'METHODE';
  return 'GUIDE';
}

interface Report {
  file: string;
  slug: string;
  city: string;
  outcome: 'créé' | 'mis à jour' | 'déjà en ligne, non modifié' | 'refusé';
  tokens: number;
  blocks: number;
  links: number;
  errors: string[];
  warnings: string[];
}

async function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort();
  const parsed = files.map((file) => {
    try {
      return { file, ...parse(join(DIR, file)) };
    } catch (e) {
      return { file, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const [zones, universities, existing] = await Promise.all([
    prisma.launchZone.findMany({
      select: { slug: true, name: true, open: true, programCount: true },
    }),
    prisma.university.findMany({
      select: { slug: true, name: true, shortName: true, keywords: true },
    }),
    prisma.article.findMany({ select: { slug: true } }),
  ]);
  const open = new Set(zones.filter((z) => z.open && z.programCount > 0).map((z) => z.slug));
  // Every establishment as a figures row, for the `etablissement.<x>` tokens (slug, short name,
  // keywords), whatever its city.
  const allUniversities = {
    universities: universities.map((u) => ({
      slug: u.slug,
      name: u.name,
      aliases: [
        ...new Set([u.shortName ?? '', ...u.keywords].map(slugify).filter((x) => x.length > 1)),
      ],
    })),
  };
  const guides = new Set([
    ...existing.map((e) => e.slug),
    ...parsed.flatMap((p) => ('front' in p && p.front ? [p.front.slug] : [])),
  ]);
  const linkCtx = { guides, cities: open };

  const reports: Report[] = [];
  for (const p of parsed) {
    if (!('front' in p) || !p.front) {
      reports.push({
        file: p.file,
        slug: '—',
        city: '—',
        outcome: 'refusé',
        tokens: 0,
        blocks: 0,
        links: 0,
        errors: [(p as { error: string }).error],
        warnings: [],
      });
      continue;
    }
    const { front: f, body } = p;
    const city = f.ville === 'toutes' ? null : f.ville;
    const r: Report = {
      file: p.file,
      slug: f.slug,
      city: city ?? 'toutes',
      outcome: 'créé',
      tokens: 0,
      blocks: 0,
      links: 0,
      errors: [],
      warnings: [],
    };
    reports.push(r);
    if (!isValidSlug(f.slug)) r.errors.push(`slug invalide : ${f.slug}`);
    if (city && !zones.some((z) => z.slug === city))
      r.warnings.push(
        `ville « ${city} » absente de la base : publication impossible tant qu’elle n’est pas ouverte`,
      );
    else if (city && !open.has(city))
      r.warnings.push(
        `ville « ${city} » non ouverte : publication impossible tant qu’elle ne l’est pas`,
      );
    if (f.titre.length > TITLE_MAX)
      r.warnings.push(`titre de ${f.titre.length} caractères (> ${TITLE_MAX})`);
    if (f.meta_description.length < META_MIN || f.meta_description.length > META_MAX)
      r.warnings.push(
        `meta description de ${f.meta_description.length} caractères (${META_MIN}–${META_MAX})`,
      );
    if (f.theme && !themeBySlug(f.theme))
      r.errors.push(`thème inconnu « ${f.theme} » (${THEMES.map((t) => t.slug).join(', ')})`);

    // Tokens: known codes; establishments found in the database.
    const codes = tokensIn(body);
    r.tokens = codes.length;
    for (const c of codes) {
      if (!isKnownToken(c)) r.errors.push(`jeton inconnu {{${c}}}`);
      else if (
        c.startsWith('etablissement.') &&
        !findUniversity(allUniversities as never, c.slice(14))
      )
        r.errors.push(`établissement inconnu {{${c}}}`);
      else if (!city && c.startsWith('ville.'))
        r.errors.push(`{{${c}}} dans un guide « toutes villes »`);
    }
    // Blocks.
    for (const line of body.split('\n')) {
      if (!BLOCK_LIKE_RE.test(line.trim())) continue;
      r.blocks++;
      const err = blockError(parseBlock(line)!, !!city);
      if (err) r.errors.push(`bloc « ${line.trim()} » : ${err}`);
    }
    // Links: /guides/… to a guide, the other internal paths to a page of the site.
    for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1]!;
      if (!href.startsWith('/')) continue;
      r.links++;
      const err = internalLinkError(href, linkCtx);
      // A guide that does not exist is an error; a city not open yet only blocks the publication.
      if (err) (href.startsWith('/guides/') ? r.errors : r.warnings).push(`lien ${href} : ${err}`);
    }
    for (const s of f.liens_articles ?? [])
      if (!guides.has(s)) r.errors.push(`article lié inconnu : ${s}`);

    const before = await prisma.article.findUnique({ where: { slug: f.slug } });
    if (before?.online) {
      r.outcome = 'déjà en ligne, non modifié';
      continue;
    }
    if (r.errors.length) {
      r.outcome = 'refusé';
      continue;
    }
    const data = {
      title: f.titre,
      city,
      theme: themeOf(f),
      lede: f.chapo,
      body,
      metaDescription: f.meta_description,
      keyword: f.mot_cle,
      secondaryKeywords: f.mots_cles_secondaires ?? [],
      searchKeywords: f.mots_cles_recherche ?? [],
      relatedSlugs: f.liens_articles ?? [],
      signature: f.signature ?? null,
    };
    r.outcome = before ? 'mis à jour' : 'créé';
    if (DRY) continue;
    if (before) await prisma.article.update({ where: { id: before.id }, data });
    else await prisma.article.create({ data: { ...data, slug: f.slug, status: 'DRAFT' } });
  }

  if (!DRY) await refreshArticleFigures();

  // Values of the tokens, per city, for the review of the sentences that comment them.
  const byCity = new Map<string, Set<string>>();
  for (const p of parsed)
    if ('front' in p && p.front) {
      const k = p.front.ville;
      const set = byCity.get(k) ?? new Set<string>();
      for (const c of tokensIn(p.body)) set.add(c);
      byCity.set(k, set);
    }

  console.log(`\nImport des guides (${DIR})${DRY ? ' · simulation, rien n’est écrit' : ''}\n`);
  for (const r of reports) {
    const mark = r.errors.length ? '❌' : r.warnings.length ? '⚠️ ' : '✅';
    console.log(
      `${mark} ${r.slug} · ${r.city} · ${r.outcome} · ${r.tokens} jetons, ${r.blocks} blocs, ${r.links} liens internes`,
    );
    for (const e of r.errors) console.log(`     ✗ ${e}`);
    for (const w of r.warnings) console.log(`     ! ${w}`);
  }
  console.log('\nValeur des jetons cités, par ville :');
  for (const [k, codes] of [...byCity.entries()].sort()) {
    const f = await computeFigures(cityScope(k === 'toutes' ? null : k));
    const head =
      k === 'toutes'
        ? 'Toutes les villes'
        : (f.city?.name ?? `${k} (ville non ouverte : pas de valeur)`);
    console.log(`\n  ${head}${f.session ? ` · session ${f.session}` : ''}`);
    for (const c of [...codes].sort()) {
      const v = resolveToken(c, f);
      console.log(`    {{${c}}} = ${v ? v.text : '—'}`);
    }
  }
  const failed = reports.filter((r) => r.errors.length);
  const counts = (o: Report['outcome']) => reports.filter((r) => r.outcome === o).length;
  console.log(
    `\n${reports.length} fichiers : ${counts('créé')} créés, ${counts('mis à jour')} mis à jour, ${counts('déjà en ligne, non modifié')} déjà en ligne, ${failed.length} refusés.`,
  );
  console.log(
    `Jetons : ${reports.reduce((n, r) => n + r.tokens, 0)}, blocs : ${reports.reduce((n, r) => n + r.blocks, 0)}, liens internes : ${reports.reduce((n, r) => n + r.links, 0)} vérifiés.`,
  );
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

await main();
