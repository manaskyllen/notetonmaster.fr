import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Homonyms and near-homonyms of a fiche, so that its title and description never repeat
 * another fiche's (pnpm seo:check fails on a duplicate):
 * - homonyms: the same displayed title at the same establishment (a work-study twin, another
 *   site, the same offer listed twice by Mon Master until the team merges it in
 *   « Rapprochements »), or at another establishment of the same city (co-accredited parcours).
 *   Each gets the first fact that is its own among them: establishment, modality, entry level,
 *   campus, then the Mon Master number (`qualifier`);
 * - near-homonyms: titles that start with the same word at the same establishment or in the same
 *   city (« Études arabes – … » / « Études russes – … »). The words only this fiche has
 *   (`keepWords`) survive when its title must be cut.
 * Pure parts tested in tests/unit/seo-titles.test.ts.
 */

export interface HomonymRow {
  programId: string;
  university?: string | null;
  modality: string;
  entryLevel: string;
  campus: string | null;
  mmCode: string | null;
}

const MODALITY: Record<string, string> = {
  WORK_STUDY: 'alternance',
  REMOTE: 'à distance',
  HYBRID: 'hybride',
  ONSITE: 'présentiel',
};

/** The qualifier of `self` among `rows` (all homonyms, self included). */
export function pickQualifier(self: HomonymRow, rows: HomonymRow[]): string | null {
  const others = rows.filter((r) => r.programId !== self.programId);
  if (!others.length) return self.modality === 'WORK_STUDY' ? 'alternance' : null;
  const facts: [keyof HomonymRow, (r: HomonymRow) => string | null][] = [
    ['university', (r) => r.university ?? null],
    ['modality', (r) => MODALITY[r.modality] ?? null],
    ['entryLevel', (r) => (r.entryLevel === 'M2' ? 'entrée en M2' : 'entrée en M1')],
    ['campus', (r) => r.campus],
    ['mmCode', (r) => (r.mmCode ? `Mon Master ${r.mmCode}` : null)],
  ];
  for (const [key, label] of facts) {
    const mine = self[key];
    if (mine && others.every((o) => o[key] !== mine))
      // on site among work-study twins: the twins say « alternance », this one needs nothing
      return key === 'modality' && mine === 'ONSITE' ? null : label(self);
  }
  return self.mmCode ? `Mon Master ${self.mmCode}` : null;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/**
 * The words of `title` that the fewest `rivals` have (accents and case ignored): « arabes » in
 * « Études arabes – Relations internationales » next to « Études russes – … », even when another
 * establishment of the city also has an « Études arabes ». None when every word is everywhere.
 */
export function distinctWords(title: string, rivals: string[]): string[] {
  const sets = rivals.map((r) => new Set(words(r)));
  const mine = [...new Set(words(title))];
  const count = (w: string) => sets.filter((x) => x.has(w)).length;
  const least = Math.min(...mine.map(count));
  return least < rivals.length ? mine.filter((w) => count(w) === least) : [];
}

/** Qualifier and words to keep of a published parcours (one indexed query). */
export async function parcoursHomonyms(
  programId: string,
): Promise<{ qualifier: string | null; keepWords: string[] }> {
  const rows = await prisma.$queryRaw<(HomonymRow & { title: string; same: boolean })[]>`
    SELECT i."programId", i.title, i."universityShort" AS university,
           p.modality::text AS modality, p."entryLevel"::text AS "entryLevel",
           nullif(concat_ws(', ', nullif(i."campusName", ''), i."cityName"), '') AS campus,
           (SELECT min(e.code) FROM "MonMasterEntry" e WHERE e."programId" = p.id) AS "mmCode",
           i.title = me.title AS same
      FROM "ProgramSearchIndex" me
      JOIN "ProgramSearchIndex" i
        ON (i."universityId" = me."universityId" OR i."cityName" = me."cityName")
       AND i."isPublicSector" AND split_part(i.title, ' ', 1) = split_part(me.title, ' ', 1)
      JOIN "Program" p ON p.id = i."programId"
     WHERE me."programId" = ${programId}`;
  const self = rows.find((r) => r.programId === programId);
  if (!self) return { qualifier: null, keepWords: [] };
  const homonyms = rows.filter((r) => r.same);
  const near = rows.filter((r) => !r.same).map((r) => r.title);
  return {
    qualifier: pickQualifier(self, homonyms),
    keepWords: near.length ? distinctWords(self.title, near) : [],
  };
}
