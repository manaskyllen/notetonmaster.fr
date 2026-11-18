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
  const numbered = await prisma.program.findMany({
    where: {},
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
  // A slug given back to a program must not redirect away from it.
  await prisma.$executeRaw`DELETE FROM "ProgramSlugRedirect" r USING "Program" p WHERE p.slug = r.slug`;
  return n;
}
