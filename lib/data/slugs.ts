import { prisma } from '../db';

/**
 * Homonym programs used to be told apart by a number (`…-2`, `…-11`). They are now told apart by
 * their city, then their establishment, then their department (`meef-professorat-des-ecoles-lyon`);
 * the former slug answers 301 (ProgramSlugRedirect, read by the program page). Run after each
 * publication; does nothing when no numbered slug is left.
 */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function renameHomonymSlugs(): Promise<number> {
  // A merged fiche (cursus of a parcours, issue #21) keeps its slug: it answers 301.
  const numbered = await prisma.program.findMany({
    where: { status: { not: 'MERGED' } },
    select: {
      id: true,
      slug: true,
      city: true,
      modality: true,
      entryLevel: true,
      searchIndex: { select: { cityName: true, departmentCode: true, universityShort: true } },
      university: { select: { slug: true, shortName: true, name: true } },
    },
  });
  const taken = new Set(numbered.map((p) => p.slug));
  const targets = numbered.filter((p) => /-\d+$/.test(p.slug));
  let n = 0;
  for (const p of targets) {
    const base = p.slug.replace(/-\d+$/, '');
    const city = slug(p.searchIndex?.cityName ?? p.city);
    const uni = slug(
      p.university.shortName ?? p.searchIndex?.universityShort ?? p.university.name,
    ).slice(0, 30);
    const dep = (p.searchIndex?.departmentCode ?? '').toLowerCase();
    const tries = [
      `${base}-${city}`,
      `${base}-${uni}`,
      `${base}-${uni}-${city}`,
      ...(dep ? [`${base}-${uni}-${city}-${dep}`] : []),
      // Same place: the work-study twin, the M2 entry.
      ...(p.modality === 'WORK_STUDY' ? [`${base}-alternance`, `${base}-${city}-alternance`] : []),
      ...(p.entryLevel === 'M2' ? [`${base}-m2`, `${base}-${city}-m2`] : []),
    ].filter((s) => s !== base && !s.endsWith('-'));
    const next = tries.find((t) => !taken.has(t) && !/-\d+$/.test(t));
    if (!next) continue;
    taken.delete(p.slug);
    taken.add(next);
    await prisma.$transaction([
      prisma.programSlugRedirect.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, programId: p.id },
        update: { programId: p.id },
      }),
      prisma.program.update({ where: { id: p.id }, data: { slug: next } }),
      prisma.programSearchIndex.updateMany({ where: { programId: p.id }, data: { slug: next } }),
    ]);
    n++;
  }
  // A slug given back to a program must not redirect away from it (a merged fiche's own slug does).
  await prisma.$executeRaw`DELETE FROM "ProgramSlugRedirect" r USING "Program" p
    WHERE p.slug = r.slug AND p.status <> 'MERGED'`;
  return n;
}

/**
 * Current slug of a parcours from any of its URLs: its own, a former one (renamed homonym), or
 * the slug of a cursus merged into it (issue #21). Null when unknown. Used where a slug comes from
 * a link shared or printed before (review form `?parcours=`, comparator).
 */
export async function currentProgramSlug(slug: string): Promise<string | null> {
  const p = await prisma.program.findUnique({ where: { slug }, select: { status: true } });
  if (p && p.status !== 'MERGED') return slug;
  const r = await prisma.programSlugRedirect.findUnique({ where: { slug } });
  if (!r) return null;
  const t = await prisma.program.findUnique({
    where: { id: r.programId },
    select: { slug: true, status: true },
  });
  return t && t.status !== 'MERGED' ? t.slug : null;
}
