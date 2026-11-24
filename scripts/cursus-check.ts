/**
 * Control of the cursus grouping (issue #21): `pnpm cursus:check`.
 *   pnpm cursus:check --snapshot           counts before the migration (.private/rapports/…json)
 *   pnpm cursus:check [--url=http://…]     compares with the snapshot and checks the redirects
 * Database: CURSUS_DATABASE_URL, else DATABASE_URL. Read only.
 *
 * Fails (exit 1) when:
 * - the counts of reviews, team replies, follows, questions, answers, verifications, short links
 *   and scans differ from the snapshot, except the duplicates removed by the grouping (listed);
 * - a former slug redirects to a merged or missing fiche (a chain), or shadows a live fiche;
 * - a merged fiche has no redirect, or still holds numbers, reviews, follows or questions;
 * - a short link aims at a merged fiche;
 * - with --url: a former URL of a published parcours does not answer 301 straight to its URL,
 *   or that URL does not answer 200.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.CURSUS_DATABASE_URL) process.env.DATABASE_URL = process.env.CURSUS_DATABASE_URL;
const { prisma } = await import('../lib/db');

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const dbName = new URL(process.env.DATABASE_URL ?? 'postgresql://x/x').pathname.slice(1);
const dir = join(process.cwd(), '.private', 'rapports');
const snapFile = join(dir, `cursus-snapshot-${dbName}.json`);

async function counts() {
  const [scans] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(sum(count), 0)::int AS n FROM qr_scans_daily`;
  return {
    avis: await prisma.review.count(),
    'réponses des équipes': await prisma.reviewResponse.count(),
    favoris: await prisma.favorite.count(),
    questions: await prisma.question.count(),
    'réponses aux questions': await prisma.answer.count(),
    vérifications: await prisma.programVerification.count(),
    'liens courts': await prisma.qrLink.count(),
    scans: scans!.n,
  };
}
type Counts = Awaited<ReturnType<typeof counts>>;

const problems: string[] = [];
const ok = (m: string) => console.log(`✅ ${m}`);
const ko = (m: string) => {
  problems.push(m);
  console.log(`❌ ${m}`);
};

try {
  const now = await counts();
  if (process.argv.includes('--snapshot')) {
    mkdirSync(dir, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from constants and the database name
    writeFileSync(snapFile, JSON.stringify({ at: new Date().toISOString(), counts: now }, null, 2));
    console.log(`Photo des comptes enregistrée : ${snapFile}`);
    console.table(now);
    process.exit(0);
  }

  // 1. counts, the duplicates removed by the grouping apart
  // After down.sql the journal is gone: nothing removed.
  const [journal] = await prisma.$queryRaw<{ has: boolean }[]>`
    SELECT to_regclass('"CursusJournal"') IS NOT NULL AS has`;
  const has = !!journal?.has;
  const removed = has
    ? await prisma.$queryRaw<{ t: string; n: number }[]>`
        SELECT "tableName" AS t, count(*)::int AS n FROM "CursusJournal"
         WHERE op = 'delete' AND "tableName" IN ('Favorite', 'Review') GROUP BY 1`
    : [];
  const dedup = Object.fromEntries(removed.map((r) => [r.t, r.n])) as Record<string, number>;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from constants and the database name
  if (!existsSync(snapFile))
    ko(`pas de photo des comptes (${snapFile}) : lancer d’abord --snapshot`);
  else {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from constants and the database name
    const before = JSON.parse(readFileSync(snapFile, 'utf8')) as { at: string; counts: Counts };
    const expected: Counts = {
      ...before.counts,
      favoris: before.counts.favoris - (dedup.Favorite ?? 0),
      avis: before.counts.avis - (dedup.Review ?? 0),
    };
    console.log(`Comptes comparés à la photo du ${before.at}`);
    for (const k of Object.keys(now) as (keyof Counts)[]) {
      const line = `${k} : ${before.counts[k]} avant, ${now[k]} maintenant`;
      if (now[k] === expected[k]) ok(line);
      else ko(`${line} (attendu ${expected[k]})`);
    }
    if (dedup.Favorite)
      console.log(
        `   dont ${dedup.Favorite} favori(s) en double fusionné(s) (le plus ancien gardé)`,
      );
    if (dedup.Review) console.log(`   dont ${dedup.Review} avis en double`);
  }

  // 2. redirects: never a chain, never over a live fiche
  const chains = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT r.slug FROM "ProgramSlugRedirect" r LEFT JOIN "Program" p ON p.id = r."programId"
     WHERE p.id IS NULL OR p.status::text = 'MERGED'`;
  if (chains.length)
    ko(
      `${chains.length} redirection(s) vers une fiche absorbée ou absente : ${chains
        .slice(0, 5)
        .map((c) => c.slug)
        .join(', ')}`,
    );
  else ok('aucune redirection en chaîne');
  const shadow = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT r.slug FROM "ProgramSlugRedirect" r JOIN "Program" p ON p.slug = r.slug WHERE p.status::text <> 'MERGED'`;
  if (shadow.length) ko(`${shadow.length} redirection(s) sur l’URL d’une fiche vivante`);
  else ok('aucune redirection sur une fiche vivante');

  // 3. merged fiches: a redirect, nothing left on them
  const merged = await prisma.$queryRaw<
    {
      slug: string;
      redirect: boolean;
      entries: number;
      reviews: number;
      favorites: number;
      questions: number;
    }[]
  >`
    SELECT p.slug, EXISTS (SELECT 1 FROM "ProgramSlugRedirect" r WHERE r.slug = p.slug) AS redirect,
      (SELECT count(*)::int FROM "MonMasterEntry" e WHERE e."programId" = p.id) AS entries,
      (SELECT count(*)::int FROM "Review" x WHERE x."programId" = p.id) AS reviews,
      (SELECT count(*)::int FROM "Favorite" x WHERE x."programId" = p.id) AS favorites,
      (SELECT count(*)::int FROM "Question" x WHERE x."programId" = p.id) AS questions
      FROM "Program" p WHERE p.status::text = 'MERGED'`;
  const bad = merged.filter(
    (m) => !m.redirect || m.entries || m.reviews || m.favorites || m.questions,
  );
  if (bad.length)
    ko(
      `${bad.length} fiche(s) absorbée(s) incomplète(s) : ${bad
        .slice(0, 5)
        .map((b) => b.slug)
        .join(', ')}`,
    );
  else ok(`${merged.length} fiches absorbées, chacune avec sa redirection et sans rien d’attaché`);

  // 4. short links
  const links = await prisma.qrLink.findMany({ select: { slug: true, targetPath: true } });
  const mergedSlugs = new Set(merged.map((m) => m.slug));
  const stale = links.filter((l) => {
    const m =
      /^\/parcours\/([^/?#]+)/.exec(l.targetPath) ?? /[?&]parcours=([^&#]+)/.exec(l.targetPath);
    return m && mergedSlugs.has(decodeURIComponent(m[1]!));
  });
  if (stale.length)
    ko(
      `${stale.length} lien(s) court(s) vers une fiche absorbée : ${stale.map((s) => s.slug).join(', ')}`,
    );
  else ok(`liens courts : aucun ne vise une fiche absorbée (${links.length} au total)`);

  // 5. HTTP: every former URL of a published parcours → 301 to its URL → 200
  const base = arg('url')?.replace(/\/$/, '');
  if (base) {
    const olds = await prisma.$queryRaw<{ old: string; target: string }[]>`
      SELECT r.slug AS old, p.slug AS target FROM "ProgramSlugRedirect" r JOIN "Program" p ON p.id = r."programId"
       WHERE p."isPublished" AND p."inOpenZone" AND p.status::text <> 'MERGED' ORDER BY r.slug`;
    let fails = 0;
    const targets = new Set<string>();
    const queue = [...olds];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let o = queue.shift(); o; o = queue.shift()) {
          const res = await fetch(`${base}/parcours/${encodeURIComponent(o.old)}`, {
            redirect: 'manual',
          });
          const loc = res.headers.get('location') ?? '';
          const path = loc ? new URL(loc, base).pathname : '';
          if (res.status !== 301 || path !== `/parcours/${o.target}`) {
            fails++;
            if (fails <= 10)
              ko(`/parcours/${o.old} → ${res.status} ${path} (attendu 301 /parcours/${o.target})`);
          } else targets.add(o.target);
        }
      }),
    );
    const tq = [...targets];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let t = tq.shift(); t; t = tq.shift()) {
          const res = await fetch(`${base}/parcours/${t}`, { redirect: 'manual' });
          if (res.status !== 200) {
            fails++;
            if (fails <= 10) ko(`/parcours/${t} → ${res.status} (attendu 200)`);
          }
        }
      }),
    );
    if (fails) ko(`${fails} anciennes URL en échec sur ${olds.length}`);
    else
      ok(`${olds.length} anciennes URL publiques → 301 directe → ${targets.size} parcours en 200`);
  } else console.log('ℹ️  sans --url=… : redirections HTTP non vérifiées');
} finally {
  await prisma.$disconnect();
}
console.log(problems.length ? `\n${problems.length} problème(s)` : '\nTout est conforme.');
process.exit(problems.length ? 1 : 0);
