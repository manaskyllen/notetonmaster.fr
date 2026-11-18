import 'server-only';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/db/generated/client';
import { sourceFamilyLabel, sourceFamilySql } from './source-family';

/**
 * Open value conflicts of the parcours, grouped by establishment + field + pair of sources: one
 * choice (a SourceRule) settles a whole group. A conflict alone in its group (fewer than 2 fiches)
 * is settled in its fiche.
 */
export interface ConflictGroup {
  /** `universityId|field|sourceA|sourceB` (sources sorted). */
  key: string;
  universityId: string;
  universityName: string;
  field: string;
  fieldLabel: string;
  sources: [{ key: string; label: string }, { key: string; label: string }];
  count: number;
  example: { programId: string; title: string; a: string; b: string };
}

export interface ConflictItem {
  conflictId: string;
  programId: string;
  title: string;
  /** Value of the first source of the group, of the second. */
  a: string;
  b: string;
  /** Option id of each source in this conflict (for the arbitration). */
  optionA: string;
  optionB: string;
}

const FAM0 = sourceFamilySql(`c.options->0`);
const FAM1 = sourceFamilySql(`c.options->1`);

/** Rows of the open program conflicts with their families, sorted pair (a < b). */
const BASE = Prisma.raw(`
  SELECT c.id, c."entityId", c.field, split_part(c.title, ' · ', 1) AS flabel, p."universityId" AS uni, p.title AS ptitle,
         CASE WHEN ${FAM0} <= ${FAM1} THEN ${FAM0} ELSE ${FAM1} END AS fa,
         CASE WHEN ${FAM0} <= ${FAM1} THEN ${FAM1} ELSE ${FAM0} END AS fb,
         CASE WHEN ${FAM0} <= ${FAM1} THEN c.options->0 ELSE c.options->1 END AS oa,
         CASE WHEN ${FAM0} <= ${FAM1} THEN c.options->1 ELSE c.options->0 END AS ob
    FROM "DataConflict" c JOIN "Program" p ON p.id = c."entityId"
   WHERE c."resolvedAt" IS NULL AND c.kind = 'VALUE' AND c."entityType" = 'PROGRAM'`);

export function parseGroupKey(key: string) {
  const [universityId, field, a, b] = key.split('|');
  if (!universityId || !field || !a || !b) return null;
  return { universityId, field, a, b };
}

/** Groups of at least `min` fiches, the biggest first; `isolated` = conflicts left alone. */
export async function conflictGroups(min = 2) {
  const rows = await prisma.$queryRaw<
    {
      uni: string;
      uname: string;
      field: string;
      flabel: string;
      fa: string;
      fb: string;
      n: number;
      ex_id: string;
      ex_title: string;
      ex_a: string;
      ex_b: string;
    }[]
  >`
    WITH k AS (${BASE})
    SELECT k.uni, min(u.name) AS uname, k.field, min(k.flabel) AS flabel, k.fa, k.fb, count(*)::int AS n,
           (array_agg(k."entityId" ORDER BY k.ptitle))[1] AS ex_id,
           (array_agg(k.ptitle ORDER BY k.ptitle))[1] AS ex_title,
           (array_agg(k.oa->>'label' ORDER BY k.ptitle))[1] AS ex_a,
           (array_agg(k.ob->>'label' ORDER BY k.ptitle))[1] AS ex_b
      FROM k JOIN "University" u ON u.id = k.uni
     GROUP BY k.uni, k.field, k.fa, k.fb
     ORDER BY count(*) DESC, min(u.name), k.field`;
  const groups: ConflictGroup[] = [];
  let isolated = 0;
  for (const r of rows) {
    if (r.n < min) {
      isolated += r.n;
      continue;
    }
    groups.push({
      key: [r.uni, r.field, r.fa, r.fb].join('|'),
      universityId: r.uni,
      universityName: r.uname,
      field: r.field,
      fieldLabel: r.flabel,
      sources: [
        { key: r.fa, label: sourceFamilyLabel(r.fa) },
        { key: r.fb, label: sourceFamilyLabel(r.fb) },
      ],
      count: r.n,
      example: { programId: r.ex_id, title: r.ex_title, a: r.ex_a, b: r.ex_b },
    });
  }
  return { groups, isolated };
}

/** The conflicts of one group (« Voir les n fiches », arbitration of the group). */
export async function conflictGroupItems(key: string): Promise<ConflictItem[]> {
  const g = parseGroupKey(key);
  if (!g) return [];
  const rows = await prisma.$queryRaw<
    {
      id: string;
      entityId: string;
      ptitle: string;
      oa: { id: string; label: string };
      ob: { id: string; label: string };
    }[]
  >`
    WITH k AS (${BASE})
    SELECT id, "entityId", ptitle, oa, ob FROM k
     WHERE uni = ${g.universityId} AND field = ${g.field} AND fa = ${g.a} AND fb = ${g.b}
     ORDER BY ptitle, id`;
  return rows.map((r) => ({
    conflictId: r.id,
    programId: r.entityId,
    title: r.ptitle,
    a: r.oa.label,
    b: r.ob.label,
    optionA: r.oa.id,
    optionB: r.ob.id,
  }));
}

/** Group of one conflict (fiche editor: « Appliquer ce choix aux n autres fiches »). */
export async function groupOfConflict(conflictId: string) {
  const [row] = await prisma.$queryRaw<{ uni: string; field: string; fa: string; fb: string }[]>`
    WITH k AS (${BASE}) SELECT uni, field, fa, fb FROM k WHERE id = ${conflictId}`;
  if (!row) return null;
  const key = [row.uni, row.field, row.fa, row.fb].join('|');
  const [{ n } = { n: 0 }] = await prisma.$queryRaw<{ n: number }[]>`
    WITH k AS (${BASE}) SELECT count(*)::int AS n FROM k
     WHERE uni = ${row.uni} AND field = ${row.field} AND fa = ${row.fa} AND fb = ${row.fb}`;
  return { key, count: n, sources: [row.fa, row.fb] as const };
}
