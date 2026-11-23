/**
 * Dry run of the cursus grouping (issue #21): `pnpm cursus:dry-run`.
 *
 * Reads the catalogue in a READ ONLY transaction (PostgreSQL refuses any write in it) and writes a
 * Markdown report to .private/rapports/cursus-dry-run-YYYY-MM-DD.md (never committed). Nothing is
 * written to the database.
 *
 * Database: CURSUS_DATABASE_URL, else DATABASE_URL. To run it on a restored copy of production:
 *   CURSUS_DATABASE_URL=postgresql://…/notetonmaster_prodcopy pnpm cursus:dry-run
 *
 * Grouping rules: lib/catalog/variants.ts (explicit, allow-list, in doubt no grouping).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { baseTitleKey, detectVariantSuffix, groupKey, placeLabels } from '../lib/catalog/variants';
import { specificPlaces } from '../lib/connectors/monmaster-opendata/normalize';
import { normCode, normText, slugify, splitMonMasterPlaces } from '../lib/data/normalize';
import { PrismaClient } from '../lib/db/generated/client';

const MM_STAT_SOURCE = 'Mon Master · données ouvertes';
const EXAMPLES = 20;
const STRASBOURG = ['2400012P6SQF', '2400012PGW1S', '2400012PISGY'];

const url = process.env.CURSUS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('CURSUS_DATABASE_URL ou DATABASE_URL manquant');
const dbName = new URL(url).pathname.replace(/^\//, '') || '?';

interface Row {
  id: string;
  slug: string;
  title: string;
  status: string;
  isPublished: boolean;
  inOpenZone: boolean;
  entryLevel: string;
  modality: string;
  variantOfId: string | null;
  universityId: string;
  uai: string | null;
  universityName: string;
  mentionId: string;
  mentionName: string;
  rncp: string | null;
  codes: string[] | null;
  inmps: string[] | null;
  liveNumbers: number;
  lieux: string | null;
  workStudy: boolean | null;
  capacity: number | null;
  applications: number | null;
  offers: number | null;
  session: number | null;
  reviews: number;
  publishedReviews: number;
  favorites: number;
  questions: number;
  answers: number;
  responses: number;
  verifications: number;
  slugRedirects: number;
}

interface Fiche extends Row {
  key: string;
  base: string;
  label: string | null;
  accessRate: number | null;
}

async function load(prisma: PrismaClient) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const ro = await tx.$queryRaw<
        { transaction_read_only: string }[]
      >`SHOW transaction_read_only`;
      if (ro[0]?.transaction_read_only !== 'on')
        throw new Error('transaction non en lecture seule');
      const rows = await tx.$queryRaw<Row[]>`WITH last_entry AS (
           SELECT DISTINCT ON (e."programId") e."programId", e.places AS lieux, e."workStudy"
           FROM "MonMasterEntry" e ORDER BY e."programId", e."lastSession" DESC NULLS LAST, e.code
         ), codes AS (
           SELECT "programId", array_agg(code ORDER BY "lastSession" DESC NULLS LAST, code) AS codes
           FROM "MonMasterEntry" GROUP BY 1
         ), last_session AS (
           SELECT "programId", max(session) AS session FROM "AdmissionStat" WHERE source = ${MM_STAT_SOURCE} GROUP BY 1
         ), stats AS (
           SELECT a."programId", l.session, sum(a.capacity)::int AS capacity,
             sum(a.applications)::int AS applications, sum(a.offers)::int AS offers
           FROM "AdmissionStat" a JOIN last_session l ON l."programId" = a."programId" AND l.session = a.session
           WHERE a.source = ${MM_STAT_SOURCE} GROUP BY 1, 2
         )
         SELECT p.id, p.slug, p.title, p.status::text, p."isPublished", p."inOpenZone",
           p."entryLevel"::text, p.modality::text, p."variantOfId",
           p."universityId", u.uai, u.name AS "universityName",
           p."mentionId", m.name AS "mentionName", m."rncpCode" AS rncp,
           c.codes, le.lieux,
           (SELECT array_agg(DISTINCT e.inmp) FILTER (WHERE e.inmp IS NOT NULL) FROM "MonMasterEntry" e WHERE e."programId" = p.id) AS inmps,
           (SELECT count(*)::int FROM "MonMasterEntry" e WHERE e."programId" = p.id
              AND e."lastSession" = (SELECT max(x."lastSession") FROM "MonMasterEntry" x WHERE x."programId" = p.id)) AS "liveNumbers", le."workStudy",
           s.capacity, s.applications, s.offers, s.session,
           (SELECT count(*)::int FROM "Review" r WHERE r."programId" = p.id) AS reviews,
           (SELECT count(*)::int FROM "Review" r WHERE r."programId" = p.id AND r.status = 'PUBLISHED') AS "publishedReviews",
           (SELECT count(*)::int FROM "Favorite" f WHERE f."programId" = p.id) AS favorites,
           (SELECT count(*)::int FROM "Question" q WHERE q."programId" = p.id) AS questions,
           (SELECT count(*)::int FROM "Answer" a JOIN "Question" q ON q.id = a."questionId" WHERE q."programId" = p.id) AS answers,
           (SELECT count(*)::int FROM "ReviewResponse" rr JOIN "Review" r ON r.id = rr."reviewId" WHERE r."programId" = p.id) AS responses,
           (SELECT count(*)::int FROM "ProgramVerification" v WHERE v."programId" = p.id) AS verifications,
           (SELECT count(*)::int FROM "ProgramSlugRedirect" sr WHERE sr."programId" = p.id) AS "slugRedirects"
         FROM "Program" p
         JOIN "University" u ON u.id = p."universityId"
         JOIN "Mention" m ON m.id = p."mentionId"
         LEFT JOIN last_entry le ON le."programId" = p.id
         LEFT JOIN codes c ON c."programId" = p.id
         LEFT JOIN stats s ON s."programId" = p.id`;
      const qr = await tx.$queryRaw<
        { slug: string; targetPath: string; archived: boolean; scans: number }[]
      >`SELECT q.slug, q.target_path AS "targetPath", q.archived_at IS NOT NULL AS archived,
           COALESCE((SELECT sum(count)::int FROM qr_scans_daily d WHERE d.link_id = q.id), 0) AS scans
         FROM qr_links q`;
      // Same author on two numbers of one group: Review is unique on (programId, authorEmailHash).
      const authors = await tx.$queryRaw<
        { programId: string; h: string }[]
      >`SELECT "programId", "authorEmailHash" AS h FROM "Review" WHERE "authorEmailHash" IS NOT NULL`;
      const favs = await tx.$queryRaw<
        { programId: string; s: string }[]
      >`SELECT "programId", "studentId" AS s FROM "Favorite"`;
      return { rows, qr, authors, favs };
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)} %` : '—');
const fmt = (n: number | null | undefined) => (n == null ? 'n.c.' : String(n));
const rate = (f: Pick<Fiche, 'accessRate'>) =>
  f.accessRate == null ? 'n.c.' : `${Math.round(f.accessRate)} %`;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const sum = (xs: Fiche[], k: keyof Row) => xs.reduce((a, f) => a + Number(f[k] ?? 0), 0);

function tally<K>(items: K[]) {
  const m = new Map<K, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Tail of a title that looks like a variant suffix but is not on the allow-list. */
function unrecognisedTail(title: string): string | null {
  if (detectVariantSuffix(title).suffix) return null;
  const paren = /\(([^()]*)\)\s*$/.exec(title);
  if (paren) {
    const words = normText(paren[1]).split(' ').filter(Boolean);
    return words.length && words.length <= 4
      ? `(${normText(paren[1])})`
      : '(… longue parenthèse …)';
  }
  const dash = /\S\s*[-–—]\s*([^-–—]+)$/.exec(title);
  if (!dash) return null;
  const words = normText(dash[1]).split(' ').filter(Boolean);
  if (!words.length) return null;
  return `- ${words.slice(0, words[0]!.length <= 3 && words[1] ? 2 : 1).join(' ')} …`;
}

/** Title cut at its last dash (or before its last parenthesis): what a new rule would group on. */
function cutAtTail(title: string): string {
  const paren = /^(.*\S)\s*\([^()]*\)\s*$/.exec(title);
  if (paren) return paren[1]!;
  const dash = /^(.*\S)\s*[-–—]\s*[^-–—]+$/.exec(title);
  return dash ? dash[1]! : title;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: url, max: 1, statement_timeout: 300_000 });
  const prisma = new PrismaClient({ adapter });
  const t0 = Date.now();
  const { rows, qr, authors, favs } = await load(prisma).finally(() => prisma.$disconnect());

  const fiches: Fiche[] = rows.map((r) => {
    const d = detectVariantSuffix(r.title);
    return {
      ...r,
      key: groupKey({
        uai: r.uai ?? `id:${r.universityId}`,
        mention: r.rncp ?? `id:${r.mentionId}`,
        title: r.title,
      }),
      base: d.base,
      label: d.label,
      accessRate: r.applications && r.offers != null ? (100 * r.offers) / r.applications : null,
    };
  });
  const active = fiches.filter((f) => f.status === 'ACTIVE');
  const byKey = new Map<string, Fiche[]>();
  for (const f of active) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  const groups = [...byKey.values()]
    .filter((g) => g.length > 1)
    .map((g) =>
      g.sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1) || a.slug.localeCompare(b.slug)),
    );

  // Labels: the suffix when there is one; numbers without a suffix are told apart by their places.
  const unlabelled: Fiche[][] = [];
  for (const g of groups) {
    const bare = g.filter((f) => !f.label);
    if (bare.length === 1) bare[0]!.label = 'Cursus principal';
    else if (bare.length > 1) {
      const labels = placeLabels(
        bare.map((f) => ({
          id: f.id,
          workStudy: !!f.workStudy,
          places: specificPlaces({
            places: splitMonMasterPlaces(f.lieux),
            etaName: f.universityName,
          }),
        })),
      );
      for (const f of bare) f.label = labels.get(f.id) ?? null;
      if (bare.some((f) => !f.label)) unlabelled.push(g);
    }
  }
  const labelText = (f: Fiche) => f.label ?? '⚠ indéterminé';

  /** What tells the cursus of a group apart (the first that applies). */
  const classOf = (g: Fiche[]) =>
    g.some((f) => detectVariantSuffix(f.title).suffix)
      ? 'suffixe du titre'
      : unlabelled.includes(g)
        ? 'rien (titre, lieux et rythme identiques)'
        : g.some((f) => f.label === 'En alternance') &&
            !g.some((f) => f.label && !['En alternance', 'Cursus principal'].includes(f.label))
          ? 'rythme seul (alternance)'
          : 'lieu d’enseignement';
  /** Mon Master parcours code (inmp): one shared by all, several, or missing. */
  const inmpOf = (g: Fiche[]) => {
    if (g.some((f) => !f.inmps?.length)) return 'inmp manquant';
    const all = new Set(g.flatMap((f) => f.inmps!));
    return g.every((f) => f.inmps!.some((i) => g.every((o) => o.inmps!.includes(i))))
      ? 'même inmp'
      : all.size > 1
        ? 'inmp différents'
        : 'même inmp';
  };

  // URL of each parcours: the base title slug if free (or held by one of its numbers), else the slug
  // of the number with the most places.
  const slugOwner = new Map(fiches.map((f) => [f.slug, f.id]));
  const target = new Map<Fiche[], { slug: string; how: string }>();
  for (const g of groups) {
    const base = slugify(`${g[0]!.base} ${g[0]!.universityName}`);
    const owner = slugOwner.get(base);
    target.set(
      g,
      !owner || g.some((f) => f.id === owner)
        ? {
            slug: base,
            how: owner
              ? 'titre de base + établissement, déjà l’URL d’un cursus'
              : 'titre de base + établissement',
          }
        : { slug: g[0]!.slug, how: 'cursus le plus grand (titre de base déjà pris)' },
    );
  }
  const keeperOf = (g: Fiche[]) => g.find((f) => f.slug === target.get(g)!.slug) ?? g[0]!;
  const grouped = groups.flat();
  const movers = groups.flatMap((g) => g.filter((f) => f !== keeperOf(g)));
  const redirects = groups.flatMap((g) => g.filter((f) => f.slug !== target.get(g)!.slug));

  // Collisions on unique keys when the numbers of one group become one parcours.
  const groupOf = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((f) => groupOf.set(f.id, i)));
  const dup = (pairs: { programId: string; v: string }[]) => {
    const seen = new Map<string, Set<string>>();
    let n = 0;
    for (const p of pairs) {
      const gi = groupOf.get(p.programId);
      if (gi === undefined) continue;
      const k = `${gi}|${p.v}`;
      const s = seen.get(k) ?? new Set<string>();
      if (s.size && !s.has(p.programId)) n++;
      s.add(p.programId);
      seen.set(k, s);
    }
    return n;
  };
  const reviewCollisions = dup(authors.map((a) => ({ programId: a.programId, v: a.h })));
  const favoriteCollisions = dup(favs.map((f) => ({ programId: f.programId, v: f.s })));

  // Short links whose target is the fiche (or the review form) of a grouped number.
  const groupedSlugs = new Map(grouped.map((f) => [f.slug, f]));
  const qrHits = qr.filter((q) => {
    const m =
      /^\/parcours\/([^/?#]+)/.exec(q.targetPath) ?? /[?&]parcours=([^&#]+)/.exec(q.targetPath);
    return m && groupedSlugs.has(decodeURIComponent(m[1]!));
  });

  // ── ambiguous cases ──
  const byUniBase = new Map<string, Fiche[]>();
  const byMentionBase = new Map<string, Fiche[]>();
  for (const f of active) {
    const b = baseTitleKey(f.title);
    const ku = `${f.uai ?? f.universityId}|${b}`;
    byUniBase.set(ku, [...(byUniBase.get(ku) ?? []), f]);
    const km = `${normCode(f.rncp ?? f.mentionId)}|${b}`;
    byMentionBase.set(km, [...(byMentionBase.get(km) ?? []), f]);
  }
  const otherMention = [...byUniBase.values()].filter(
    (g) => new Set(g.map((f) => f.rncp ?? f.mentionId)).size > 1,
  );
  const otherUni = [...byMentionBase.values()]
    .filter((g) => new Set(g.map((f) => f.uai ?? f.universityId)).size > 1)
    .sort((a, b) => b.length - a.length);
  const mixedLevel = groups.filter((g) => new Set(g.map((f) => f.entryLevel)).size > 1);

  const tails = new Map<string, Fiche[]>();
  for (const f of active) {
    const t = unrecognisedTail(f.title);
    if (t) tails.set(t, [...(tails.get(t) ?? []), f]);
  }
  /** Groups a rule cutting this tail would form (same UAI, mention and cut title). */
  const wouldGroup = (list: Fiche[]) => {
    const m = new Map<string, number>();
    for (const f of list) {
      const k = groupKey({
        uai: f.uai ?? f.universityId,
        mention: f.rncp ?? f.mentionId,
        title: cutAtTail(f.title),
      });
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    // a cut title joins any other active fiche with that key (its own base title)
    let n = 0;
    for (const [k, c] of m) if (c + (byKey.get(k)?.length ?? 0) > 1) n++;
    return n;
  };
  const topTails = [...tails.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 50);
  const longParen = active.filter((f) => /\([^()]{40,}\)\s*$/.test(f.title));

  // ── examples: Strasbourg first, then the largest groups, then by places ──
  const strasbourg = groups.find((g) =>
    g.some((f) => f.codes?.some((c) => STRASBOURG.includes(c))),
  );
  const examples = [
    ...(strasbourg ? [strasbourg] : []),
    ...[...groups]
      .filter((g) => g !== strasbourg)
      .sort(
        (a, b) =>
          b.length - a.length ||
          sum(b, 'capacity') - sum(a, 'capacity') ||
          a[0]!.slug.localeCompare(b[0]!.slug),
      ),
  ];
  // diversity: at most 5 examples per suffix kind of the first number
  const picked: Fiche[][] = [];
  const perKind = new Map<string, number>();
  for (const g of examples) {
    const k = detectVariantSuffix(g[0]!.title).suffix?.kind ?? 'lieu';
    if ((perKind.get(k) ?? 0) >= 5 && g !== strasbourg) continue;
    perKind.set(k, (perKind.get(k) ?? 0) + 1);
    picked.push(g);
    if (picked.length === EXAMPLES) break;
  }

  // ── report ──
  const sizes = tally(groups.map((g) => (g.length >= 4 ? '4 et plus' : String(g.length))));
  const labels = tally(grouped.map(labelText));
  const multiReview = groups.filter((g) => g.filter((f) => f.reviews > 0).length > 1);
  const L: string[] = [];
  const day = new Date().toISOString().slice(0, 10);
  L.push(`# Cursus d'un même parcours : rapport à blanc (#21)`, '');
  L.push(
    `Base : \`${dbName}\` · ${day} · lecture seule (transaction READ ONLY) · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    '',
    `Périmètre : fiches \`Program\` au statut ACTIVE (${active.length} sur ${fiches.length} ; les autres statuts ne sont jamais regroupés). Clé : UAI + mention (code RNCP, sinon identifiant de la mention) + titre de base normalisé. Règles : \`lib/catalog/variants.ts\`.`,
    '',
  );

  L.push('## 1. Chiffres', '');
  L.push('| | |', '|---|---|');
  L.push(`| Fiches (ACTIVE) | ${active.length} |`);
  L.push(
    `| dont publiées et en zone ouverte (visibles) | ${active.filter((f) => f.isPublished && f.inOpenZone).length} |`,
  );
  L.push(`| Groupes de 2 cursus ou plus | ${groups.length} |`);
  L.push(
    `| dont visibles (au moins un cursus visible) | ${groups.filter((g) => g.some((f) => f.isPublished && f.inOpenZone)).length} |`,
  );
  L.push(`| Fiches concernées | ${grouped.length} (${pct(grouped.length, active.length)}) |`);
  L.push(`| Parcours après regroupement | ${active.length - grouped.length + groups.length} |`);
  L.push(
    `| Groupes formés par un suffixe | ${groups.filter((g) => g.some((f) => detectVariantSuffix(f.title).suffix)).length} |`,
  );
  L.push(
    `| Groupes formés par un titre identique (sans suffixe) | ${groups.filter((g) => !g.some((f) => detectVariantSuffix(f.title).suffix)).length} |`,
  );
  L.push('');
  L.push('Ce qui distingue les cursus, et accord avec le code parcours Mon Master (`inmp`) :', '');
  const classes = tally(groups.map((g) => `${classOf(g)}|${inmpOf(g)}`));
  L.push('| Distingués par | inmp | Groupes | Fiches |', '|---|---|---|---|');
  for (const [k, v] of classes.sort((a, b) => a[0].localeCompare(b[0]))) {
    const [c, i] = k.split('|');
    L.push(
      `| ${c} | ${i} | ${v} | ${groups.filter((g) => `${classOf(g)}|${inmpOf(g)}` === k).flat().length} |`,
    );
  }
  L.push('');
  L.push(
    `Fiches qui ont déjà plusieurs numéros Mon Master dans leur dernière session : ${active.filter((f) => f.liveNumbers > 1).length} (les fusions déjà décidées portent surtout sur des numéros de sessions différentes : réaccréditations).`,
    '',
  );
  L.push('Répartition par taille de groupe :', '', '| Taille | Groupes |', '|---|---|');
  for (const [k, v] of sizes.sort((a, b) => a[0].localeCompare(b[0]))) L.push(`| ${k} | ${v} |`);
  L.push('');

  L.push('## 2. Libellés de cursus', '');
  L.push(
    'Le libellé vient du suffixe du titre. Sans suffixe (titres identiques), il vient du lieu d’enseignement propre au cursus (communes de `lieux` que les autres cursus n’ont pas), sinon du rythme (alternance). « ⚠ indéterminé » : rien ne distingue les cursus.',
    '',
  );
  L.push('| Libellé | Occurrences |', '|---|---|');
  for (const [k, v] of labels.slice(0, 80)) L.push(`| ${esc(k)} | ${v} |`);
  if (labels.length > 80) L.push(`| … ${labels.length - 80} autres libellés | |`);
  L.push('');

  L.push(`## 3. ${picked.length} exemples de groupes`, '');
  for (const g of picked) {
    const t = target.get(g)!;
    L.push(`### ${esc(g[0]!.universityName)} · ${esc(g[0]!.base)}`, '');
    L.push(
      `Mention : ${esc(g[0]!.mentionName)} (${g[0]!.rncp ?? 'sans RNCP'}) · URL du parcours : \`/parcours/${t.slug}\` (${t.how})`,
      '',
    );
    L.push(
      '| Code Mon Master | Libellé | Capacité | Candidatures | Taux d’accès | Avis | URL actuelle |',
      '|---|---|---|---|---|---|---|',
    );
    for (const f of g)
      L.push(
        `| ${(f.codes ?? ['—']).join(', ')} | ${esc(labelText(f))} | ${fmt(f.capacity)} | ${fmt(f.applications)} | ${rate(f)} | ${f.reviews} | \`${f.slug}\` |`,
      );
    L.push('');
  }

  L.push('## 4. Cas ambigus', '');
  L.push(
    `### 4.1 Même titre de base dans le même établissement, mention différente (${otherMention.length})`,
    '',
  );
  L.push(
    'Non regroupés. À regarder : mention mal rattachée, ou deux parcours homonymes dans deux mentions.',
    '',
  );
  L.push('| Établissement | Titre de base | Mentions | Fiches |', '|---|---|---|---|');
  for (const g of otherMention.slice(0, 40))
    L.push(
      `| ${esc(g[0]!.universityName)} | ${esc(detectVariantSuffix(g[0]!.title).base)} | ${esc([...new Set(g.map((f) => `${f.mentionName} (${f.rncp ?? '—'})`))].join(' ; '))} | ${g.length} |`,
    );
  if (otherMention.length > 40) L.push(`| … ${otherMention.length - 40} autres | | | |`);
  L.push('');
  L.push(
    `### 4.2 Même titre de base et même mention, établissement différent (${otherUni.length})`,
    '',
  );
  L.push(
    'Non regroupés (normal : un même intitulé national dans plusieurs universités). Les 30 plus fréquents :',
    '',
  );
  L.push('| Titre de base | Mention | Établissements |', '|---|---|---|');
  for (const g of otherUni.slice(0, 30))
    L.push(
      `| ${esc(detectVariantSuffix(g[0]!.title).base)} | ${esc(g[0]!.mentionName)} | ${new Set(g.map((f) => f.universityId)).size} |`,
    );
  L.push('');
  L.push(`### 4.3 Tirets et parenthèses non reconnus : 50 motifs les plus fréquents`, '');
  L.push(
    'Fin de titre après le dernier tiret (premier mot) ou contenu de la dernière parenthèse. « Groupes possibles » : groupes qui se formeraient si l’on coupait ce motif (même UAI, même mention, même titre coupé). Ce sont les candidats pour compléter les règles.',
    '',
  );
  L.push('| Motif | Titres | Groupes possibles | Exemples |', '|---|---|---|---|');
  for (const [k, list] of topTails)
    L.push(
      `| \`${esc(k)}\` | ${list.length} | ${wouldGroup(list)} | ${list
        .slice(0, 2)
        .map((f) => esc(f.title))
        .join(' ; ')} |`,
    );
  L.push('');
  L.push(`### 4.4 Groupes dont les cursus n’ont pas de libellé (${unlabelled.length})`, '');
  L.push(
    'Même titre, mêmes lieux, même rythme : rien ne les distingue. À regarder à la main (doublon de numéro, ou cursus réellement différents).',
    '',
  );
  for (const g of unlabelled.slice(0, 30))
    L.push(
      `- ${esc(g[0]!.universityName)} · ${esc(g[0]!.base)} · ${g.map((f) => (f.codes ?? []).join('/')).join(', ')}`,
    );
  if (unlabelled.length > 30) L.push(`- … ${unlabelled.length - 30} autres`);
  L.push('');
  const diffInmp = groups.filter((g) => inmpOf(g) === 'inmp différents');
  L.push(
    `### 4.5 Groupes dont les cursus ont des codes parcours Mon Master (inmp) différents (${diffInmp.length})`,
    '',
  );
  L.push('Mon Master les tient pour des parcours différents : le regroupement est douteux.', '');
  for (const g of diffInmp.slice(0, 30))
    L.push(
      `- ${esc(g[0]!.universityName)} · ${esc(g[0]!.base)} · ${g.map((f) => `${labelText(f)} (${(f.inmps ?? []).join('/')})`).join(', ')}`,
    );
  L.push('');
  L.push(`### 4.6 Groupes qui mêlent entrée en M1 et entrée en M2 (${mixedLevel.length})`, '');
  for (const g of mixedLevel.slice(0, 20))
    L.push(
      `- ${esc(g[0]!.universityName)} · ${esc(g[0]!.base)} · ${g.map((f) => `${labelText(f)} (${f.entryLevel})`).join(', ')}`,
    );
  L.push('');

  L.push('## 5. Impact', '');
  L.push(
    'Le parcours garde la fiche dont il prend l’URL (titre de base, sinon le cursus le plus grand) ; ce qui pointe vers les autres cursus du groupe « change de fiche ».',
    '',
  );
  L.push('| | Sur des fiches regroupées | Qui changeront de fiche |', '|---|---|---|');
  for (const [k, label] of [
    ['reviews', 'Avis (tous statuts)'],
    ['publishedReviews', 'dont avis publiés'],
    ['responses', 'Réponses des équipes aux avis'],
    ['favorites', 'Favoris (suivis)'],
    ['questions', 'Questions'],
    ['answers', 'Réponses aux questions'],
    ['verifications', 'Vérifications d’études'],
    ['slugRedirects', 'Anciennes redirections de slug (à repointer)'],
  ] as const)
    L.push(`| ${label} | ${sum(grouped, k)} | ${sum(movers, k)} |`);
  L.push('');
  L.push(
    `- **Collisions d’unicité** à traiter dans la migration : ${reviewCollisions} avis d’un même auteur sur deux cursus d’un même groupe (\`Review\` est unique sur programId + auteur), ${favoriteCollisions} favoris en double (unique sur étudiant + programId).`,
  );
  L.push(
    `- **Liens courts \`/q/{code}\`** visant la fiche (ou le formulaire d’avis) d’un cursus regroupé : ${qrHits.length} sur ${qr.length}${qrHits.length ? ` (${qrHits.map((q) => `\`${q.slug}\` → \`${q.targetPath}\`, ${q.scans} scans${q.archived ? ', archivé' : ''}`).join(' ; ')})` : ''}.`,
  );
  L.push(`- **Groupes avec des avis sur plusieurs cursus** : ${multiReview.length}.`);
  for (const g of multiReview.slice(0, 20))
    L.push(
      `  - ${esc(g[0]!.universityName)} · ${esc(g[0]!.base)} : ${g.map((f) => `${labelText(f)} ${f.reviews}`).join(', ')}`,
    );
  L.push(
    `- **Anciennes URL à rediriger (301)** : ${redirects.length} (+ ${sum(grouped, 'slugRedirects')} anciennes redirections à repointer vers le parcours).`,
  );
  L.push(
    `- **Liens « même parcours, autre modalité » existants** (\`Program.variantOfId\`) dans un groupe : ${grouped.filter((f) => f.variantOfId && groupOf.get(f.variantOfId) === groupOf.get(f.id)).length}.`,
  );
  L.push('');

  L.push('## 6. Titre long', '');
  L.push(
    [
      'Le titre affiché vient de la colonne `parcours` des données ouvertes Mon Master (`fr-esr-mon_master`), nettoyée par `displayTitle` (codes internes « (PR1234) », préfixe « M1 ») puis `cleanTitle` (guillemets droits → « »), dans `lib/connectors/monmaster-opendata/normalize.ts`. Il est publié dans `Program.title` et dans `MonMasterEntry.label`.',
      '',
      'Le suffixe « - cursus Kehl » **n’existe pas dans les données ouvertes** : les trois numéros de Strasbourg y ont exactement le même `parcours`, et ne diffèrent que par la colonne `lieux` (Kehl, Passau en plus) et leurs chiffres. Le suffixe n’apparaît que sur le site candidat monmaster.gouv.fr, que nous ne lisons pas (robots.txt `Disallow: /`, connecteur `monmaster-fiches` toujours en SKIP). D’où la règle de libellé par le lieu (§ 2).',
      '',
      `Les titres avec une longue parenthèse finale (40 caractères ou plus, comme « (tronc commun menant vers les M2 : …) ») : ${longParen.length}. Aucune règle ne les coupe : le titre de base reste long. Pour avoir « Projets de coopération et intelligence collective », il faudrait une règle de plus (parenthèse finale commençant par « tronc commun », « menant vers »… envoyée dans la description) ; à décider.`,
    ].join('\n'),
    '',
  );
  L.push('Titre de base qui serait affiché pour les exemples :', '');
  L.push('| Établissement | Titre de base |', '|---|---|');
  for (const g of picked) L.push(`| ${esc(g[0]!.universityName)} | ${esc(g[0]!.base)} |`);
  L.push('');

  const dir = join(process.cwd(), '.private', 'rapports');
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `cursus-dry-run-${day}${dbName === 'notetonmaster' ? '' : `-${dbName}`}.md`,
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from constants and the date
  writeFileSync(file, L.join('\n'));
  console.log(
    `${groups.length} groupes, ${grouped.length} fiches sur ${active.length}, ${redirects.length} URL à rediriger · rapport : ${file}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
