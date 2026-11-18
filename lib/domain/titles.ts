/**
 * Display names of the catalogue. Pure functions, shared by the index build
 * (lib/catalog/program-index.ts, which mirrors them in SQL) and the pages.
 */

/**
 * « Droit des affaires : M2 Droit des affaires approfondi » → the speciality is the title, the
 * parent parcours is shown small above it, and the programme starts in M2. The source title
 * stays in the provenance and in the search. Case is never changed.
 */
export function splitParcoursTitle(title: string): {
  title: string;
  parent: string | null;
  entersInM2: boolean;
} {
  const m = /^(.+?) : M2 (.+)$/u.exec(title.trim());
  if (!m) return { title, parent: null, entersInM2: false };
  return { title: m[2]!, parent: m[1]!, entersInM2: true };
}

/** SQL twin of splitParcoursTitle (PostgreSQL regular expressions, same pattern). */
export const SQL_PARCOURS_SPLIT = '^(.+?) : M2 (.+)$';

/** Above this length a chip shows the annuaire's short name (« UVSQ »), the full name in title. */
const SHORT_MAX = 42;

/**
 * Name of an establishment on chips, cards and filters: the usage name of the annuaire when it
 * fits (« Université de Bordeaux », not « UBx »), else its short name (« UVSQ »).
 */
export function establishmentShort(u: { name: string; shortName?: string | null }): string {
  if (u.name.length <= SHORT_MAX || !u.shortName) return u.name;
  return u.shortName;
}
