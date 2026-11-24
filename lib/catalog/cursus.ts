/**
 * Cursus of one parcours (issue #21), the database side of lib/catalog/variants.ts.
 *
 * A parcours is a Program; its cursus are its Mon Master numbers of the latest session
 * (MonMasterEntry). Grouping fiches = keeping one Program per group and merging the others into
 * it: their numbers (with their admission figures), reviews, favourites, questions, verifications,
 * identifiers and former slugs go to the parcours; the merged fiche is kept with the status MERGED
 * and `mergedIntoId`, and its URL answers 301 (ProgramSlugRedirect).
 *
 * Every write is journaled (CursusJournal), so that `revertAll` (pnpm cursus:migrate --down) and a
 * split from the admin undo it exactly. The same engine runs for the migration, after every Mon
 * Master sync, and for the admin actions. Manual corrections (CursusOverride: split, attach,
 * label) are applied after the rules and never overwritten.
 *
 * No 'server-only' guard: the worker and the scripts call it.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db/generated/client';
import { specificPlaces } from '@/lib/connectors/monmaster-opendata/normalize';
import { slugify, splitMonMasterPlaces } from '@/lib/data/normalize';
import {
  detectVariantSuffix,
  labelCursus,
  planGroups,
  splitSubtitle,
  type PlanFiche,
} from './variants';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** Run of the journal: every write of one grouping, sync or admin action. */
export interface JournalRun {
  runId: string;
}

/** Tables the journal may touch, with their key columns: every identifier below is a constant. */
const TABLES = {
  Program: ['id'],
  MonMasterEntry: ['id'],
  AdmissionStat: ['id'],
  Review: ['id'],
  Favorite: ['id'],
  Question: ['id'],
  ProgramVerification: ['id'],
  Identifier: ['id'],
  FieldProvenance: ['id'],
  ProgramSlugRedirect: ['slug'],
  qr_links: ['id'],
} as const;
type Table = keyof typeof TABLES;

const q = (id: string) => `"${id.replace(/"/g, '')}"`;
const keyJson = (t: Table, alias = '') =>
  `jsonb_build_object(${TABLES[t].map((k) => `'${k}', ${alias}${q(k)}`).join(', ')})`;

/** Checks a table and a column against the constant lists above: never a value in the SQL. */
function ident(table: Table, column?: string): void {
  if (!(table in TABLES)) throw new Error(`table inattendue : ${table}`);
  if (column !== undefined && !COLUMNS[table].has(column))
    throw new Error(`colonne inattendue : ${table}.${column}`);
}
const CASTS = new Set(['text', 'boolean', '"ProgramStatus"']);

/** SQL of moveColumn: identifiers checked, `where` a constant of this module, values $n. */
function moveSql(table: Table, column: string, where: string, cast: string): string {
  ident(table, column);
  if (!CASTS.has(cast)) throw new Error(`type inattendu : ${cast}`);
  const keys = TABLES[table];
  return [
    `WITH sel AS (SELECT ${keys.map(q).join(', ')}, ${q(column)} AS old FROM ${q(table)} WHERE ${where} FOR UPDATE),`,
    `upd AS (UPDATE ${q(table)} t SET ${q(column)} = $1::${cast} FROM sel`,
    `WHERE ${keys.map((k) => `t.${q(k)} = sel.${q(k)}`).join(' AND ')} RETURNING sel.*)`,
    'INSERT INTO "CursusJournal" ("runId", "programId", op, "tableName", "rowKey", "column", "oldValue")',
    `SELECT $2, $3, 'update', '${table}', ${keyJson(table, 'upd.')}, '${column}', to_jsonb(upd.old) FROM upd`,
  ].join('\n');
}

/** SQL of deleteRows: identifiers checked, `where` a constant of this module, values $n. */
function deleteSql(table: Table, where: string): string {
  ident(table);
  return [
    `WITH del AS (DELETE FROM ${q(table)} t WHERE ${where} RETURNING t.*)`,
    'INSERT INTO "CursusJournal" ("runId", "programId", op, "tableName", "rowKey", "row")',
    `SELECT $1, $2, 'delete', '${table}', ${keyJson(table, 'del.')}, to_jsonb(del.*) FROM del`,
  ].join('\n');
}

/**
 * Moves `column` to `to` on the rows of `table` matching `where` (a constant of this module, its
 * values from $4), journaling the old value of each row under the fiche `about`.
 */
async function moveColumn(
  db: Db,
  run: JournalRun,
  about: string | null,
  table: Table,
  column: string,
  to: unknown,
  where: string,
  params: unknown[],
  cast = 'text',
): Promise<number> {
  // raw-sql: built by moveSql from checked identifiers and constant clauses; values are $n.
  return db.$executeRawUnsafe(moveSql(table, column, where, cast), to, run.runId, about, ...params);
}

/** Deletes the rows of `table` matching `where` (values from $3), journaling each whole row. */
async function deleteRows(
  db: Db,
  run: JournalRun,
  about: string | null,
  table: Table,
  where: string,
  params: unknown[],
): Promise<number> {
  // raw-sql: built by deleteSql from checked identifiers and constant clauses; values are $n.
  return db.$executeRawUnsafe(deleteSql(table, where), run.runId, about, ...params);
}

/** Journals the insertion of a row (its key), done just before by the caller. */
async function journalInsert(
  db: Db,
  run: JournalRun,
  about: string | null,
  table: Table,
  key: Record<string, string>,
) {
  await db.cursusJournal.create({
    data: {
      runId: run.runId,
      programId: about,
      op: 'insert',
      tableName: table,
      rowKey: key,
    },
  });
}

/** The parcours a fiche ends in (follows MERGED fiches). */
export async function finalProgramId(db: Db, id: string): Promise<string> {
  let cur = id;
  for (let i = 0; i < 10; i++) {
    const p = await db.program.findUnique({
      where: { id: cur },
      select: { status: true, mergedIntoId: true },
    });
    if (!p || p.status !== 'MERGED' || !p.mergedIntoId) return cur;
    cur = p.mergedIntoId;
  }
  return cur;
}

/** Same student following both: the oldest follow is kept. Same author reviewing both: refused. */
export class CursusCollision extends Error {}

/**
 * Merges fiche `fromId` into parcours `toId` (one transaction, journaled under `fromId`). The
 * redirect of its slug is written here; its short links by mergeGroup.
 */
export async function mergeInto(tx: Tx, run: JournalRun, fromId: string, toId: string) {
  if (fromId === toId) return;
  const from = await tx.program.findUniqueOrThrow({
    where: { id: fromId },
    select: { slug: true, status: true },
  });
  if (from.status === 'MERGED') return;
  const clash = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Review" a JOIN "Review" b ON a."authorEmailHash" = b."authorEmailHash"
     WHERE a."programId" = ${fromId} AND b."programId" = ${toId} AND a."authorEmailHash" IS NOT NULL`;
  if (clash[0]!.n > 0)
    throw new CursusCollision(`${clash[0]!.n} avis d’un même auteur sur les deux fiches`);

  // Favourites: the most recent of a student's two follows goes (whole row journaled).
  await deleteRows(
    tx,
    run,
    fromId,
    'Favorite',
    `t.id IN (SELECT CASE WHEN a."createdAt" <= b."createdAt" THEN b.id ELSE a.id END
                FROM "Favorite" a JOIN "Favorite" b ON a."studentId" = b."studentId"
               WHERE a."programId" = $3 AND b."programId" = $4)`,
    [fromId, toId],
  );
  // Identifiers already on the parcours (same kind and value): the fiche's copy goes.
  await deleteRows(
    tx,
    run,
    fromId,
    'Identifier',
    `t."entityType" = 'PROGRAM' AND t."entityId" = $3 AND EXISTS (SELECT 1 FROM "Identifier" o
       WHERE o."entityType" = 'PROGRAM' AND o."entityId" = $4 AND o.kind = t.kind AND o.value = t.value)`,
    [fromId, toId],
  );
  // Numbers: they remember the fiche they came from (the way back of a split).
  await moveColumn(
    tx,
    run,
    fromId,
    'MonMasterEntry',
    'homeProgramId',
    fromId,
    `"programId" = $4 AND "homeProgramId" IS NULL`,
    [fromId],
  );
  for (const table of [
    'MonMasterEntry',
    'AdmissionStat',
    'Review',
    'Favorite',
    'Question',
    'ProgramVerification',
  ] as const)
    await moveColumn(tx, run, fromId, table, 'programId', toId, `"programId" = $4`, [fromId]);
  await moveColumn(
    tx,
    run,
    fromId,
    'Identifier',
    'entityId',
    toId,
    `"entityType" = 'PROGRAM' AND "entityId" = $4`,
    [fromId],
  );
  // Provenance of the fields the parcours does not have yet (its own fields stay its own).
  await moveColumn(
    tx,
    run,
    fromId,
    'FieldProvenance',
    'entityId',
    toId,
    `"entityType" = 'PROGRAM' AND "entityId" = $4 AND field NOT IN
       (SELECT field FROM "FieldProvenance" WHERE "entityType" = 'PROGRAM' AND "entityId" = $5)`,
    [fromId, toId],
  );
  // Former slugs of the fiche, and fiches merged into it earlier: straight to the parcours.
  await moveColumn(tx, run, fromId, 'ProgramSlugRedirect', 'programId', toId, `"programId" = $4`, [
    fromId,
  ]);
  await moveColumn(tx, run, fromId, 'Program', 'mergedIntoId', toId, `"mergedIntoId" = $4`, [
    fromId,
  ]);
  // Its own URL: 301 to the parcours.
  const existing = await tx.programSlugRedirect.findUnique({ where: { slug: from.slug } });
  if (existing)
    await moveColumn(tx, run, fromId, 'ProgramSlugRedirect', 'programId', toId, `slug = $4`, [
      from.slug,
    ]);
  else {
    await tx.programSlugRedirect.create({ data: { slug: from.slug, programId: toId } });
    await journalInsert(tx, run, fromId, 'ProgramSlugRedirect', { slug: from.slug });
  }
  await moveColumn(
    tx,
    run,
    fromId,
    'Program',
    'status',
    'MERGED',
    `id = $4`,
    [fromId],
    '"ProgramStatus"',
  );
  await moveColumn(tx, run, fromId, 'Program', 'mergedIntoId', toId, `id = $4`, [fromId]);
  await moveColumn(
    tx,
    run,
    fromId,
    'Program',
    'isPublished',
    false,
    `id = $4`,
    [fromId],
    'boolean',
  );
}

/** `/parcours/<old>` or `?parcours=<old>` (review form) → the new slug; anything else unchanged. */
export function retarget(path: string, oldSlug: string, newSlug: string): string {
  const u = new URL(path, 'http://x');
  let changed = false;
  if (u.pathname === `/parcours/${oldSlug}`) {
    u.pathname = `/parcours/${newSlug}`;
    changed = true;
  }
  if (u.searchParams.get('parcours') === oldSlug) {
    u.searchParams.set('parcours', newSlug);
    changed = true;
  }
  return changed ? u.pathname + u.search + u.hash : path;
}

/** Short links aimed at `oldSlug` (fiche or review form): the parcours slug instead. */
async function repointShortLinks(
  tx: Tx,
  run: JournalRun,
  about: string | null,
  oldSlug: string,
  newSlug: string,
) {
  if (oldSlug === newSlug) return;
  const links = await tx.qrLink.findMany({ select: { id: true, targetPath: true } });
  for (const l of links) {
    const target = retarget(l.targetPath, oldSlug, newSlug);
    if (target === l.targetPath) continue;
    await moveColumn(tx, run, about, 'qr_links', 'target_path', target, `id = $4`, [l.id]);
  }
}

/** URL a parcours wants: the short base title and the establishment, in the current slug format. */
export function parcoursSlug(baseTitle: string, universityName: string): string {
  return slugify(`${splitSubtitle(baseTitle).title} ${universityName}`);
}

export interface GroupInput {
  keeperId: string;
  memberIds: string[];
}

/**
 * One group in one transaction: the parcours takes the base title and, when free, the URL of the
 * short base title and the establishment (its former URL answers 301); the other fiches are merged
 * into it; their short links follow.
 */
export async function mergeGroup(run: JournalRun, g: GroupInput) {
  return prisma.$transaction(
    async (tx) => {
      const members = await tx.program.findMany({
        where: { id: { in: g.memberIds } },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          university: { select: { name: true } },
        },
      });
      const keeper = members.find((m) => m.id === g.keeperId)!;
      const base = detectVariantSuffix(keeper.title).base;
      const wanted = parcoursSlug(base, keeper.university.name);
      let slug = keeper.slug;
      if (wanted !== keeper.slug) {
        const [taken, redirect] = await Promise.all([
          tx.program.findUnique({ where: { slug: wanted }, select: { id: true } }),
          tx.programSlugRedirect.findUnique({ where: { slug: wanted } }),
        ]);
        const free = !taken && (!redirect || g.memberIds.includes(redirect.programId));
        if (free) {
          if (redirect)
            await deleteRows(tx, run, null, 'ProgramSlugRedirect', `t.slug = $3`, [wanted]);
          await moveColumn(tx, run, null, 'Program', 'slug', wanted, `id = $4`, [keeper.id]);
          await tx.programSlugRedirect.create({
            data: { slug: keeper.slug, programId: keeper.id },
          });
          await journalInsert(tx, run, null, 'ProgramSlugRedirect', { slug: keeper.slug });
          slug = wanted;
        }
      }
      // The parcours shows the base title (the suffix names a cursus, not the parcours).
      if (base !== keeper.title)
        await moveColumn(tx, run, null, 'Program', 'title', base, `id = $4`, [keeper.id]);
      for (const m of members) if (m.id !== keeper.id) await mergeInto(tx, run, m.id, keeper.id);
      for (const m of members)
        await repointShortLinks(tx, run, m.id === keeper.id ? null : m.id, m.slug, slug);
      return slug;
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

// ───────────────────────────── planning ─────────────────────────────

interface FicheRow {
  id: string;
  slug: string;
  title: string;
  uai: string | null;
  universityId: string;
  universityName: string;
  rncp: string | null;
  mentionId: string;
  inmps: string[] | null;
  places: number | null;
  absorbed: number;
}

/** Programs that may be grouped: ACTIVE, not MERGED, with their codes and latest places. */
async function loadFiches(): Promise<FicheRow[]> {
  return prisma.$queryRaw<FicheRow[]>`
    WITH last AS (
      SELECT "programId", max(session) AS session FROM "AdmissionStat"
       WHERE "monMasterEntryId" IS NOT NULL GROUP BY 1
    )
    SELECT p.id, p.slug, p.title, u.uai, p."universityId", u.name AS "universityName",
           m."rncpCode" AS rncp, p."mentionId",
           (SELECT array_agg(DISTINCT e.inmp) FILTER (WHERE e.inmp IS NOT NULL)
              FROM "MonMasterEntry" e WHERE e."programId" = p.id) AS inmps,
           (SELECT sum(s.capacity)::int FROM "AdmissionStat" s JOIN last l
               ON l."programId" = s."programId" AND l.session = s.session
             WHERE s."programId" = p.id AND s."monMasterEntryId" IS NOT NULL) AS places,
           (SELECT count(*)::int FROM "MonMasterEntry" e
             WHERE e."programId" = p.id AND e."homeProgramId" IS NOT NULL AND e."homeProgramId" <> p.id) AS absorbed
      FROM "Program" p
      JOIN "University" u ON u.id = p."universityId"
      JOIN "Mention" m ON m.id = p."mentionId"
     WHERE p.status = 'ACTIVE'`;
}

export interface Plan {
  groups: (GroupInput & { bySuffix: boolean; attached: boolean })[];
}

/**
 * Groups to form now: the rules (planGroups) on every ACTIVE fiche, except the fiches of a number
 * split by hand; plus the fiches attached by hand to a parcours. Fiches already merged are not
 * ACTIVE any more: a group already formed only grows with new fiches.
 */
export async function planCursus(): Promise<Plan> {
  const [fiches, overrides, entries] = await Promise.all([
    loadFiches(),
    prisma.cursusOverride.findMany(),
    prisma.monMasterEntry.findMany({ select: { code: true, programId: true } }),
  ]);
  const programOfCode = new Map(entries.map((e) => [e.code, e.programId]));
  const splitPrograms = new Set(
    overrides
      .filter((o) => o.split)
      .map((o) => programOfCode.get(o.code))
      .filter(Boolean) as string[],
  );
  const byId = new Map(fiches.map((f) => [f.id, f]));
  const plan: PlanFiche[] = fiches
    .filter((f) => !splitPrograms.has(f.id))
    .map((f) => ({
      id: f.id,
      title: f.title,
      uai: f.uai ?? `id:${f.universityId}`,
      mention: f.rncp ?? `id:${f.mentionId}`,
      inmps: f.inmps ?? [],
      places: f.places,
      slug: f.slug,
      isParcours: f.absorbed > 0,
    }));
  const rules = planGroups(plan, (f) =>
    parcoursSlug(detectVariantSuffix(f.title).base, byId.get(f.id)!.universityName),
  );

  // Union of the rule groups and the attachments by hand.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const union = (a: string, b: string) => {
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const keeperOf = new Map<string, string>();
  const suffixOf = new Map<string, boolean>();
  for (const g of rules) {
    for (const m of g.memberIds) union(g.memberIds[0]!, m);
    for (const m of g.memberIds) keeperOf.set(m, g.keeperId);
    suffixOf.set(g.keeperId, g.bySuffix);
  }
  const attachTargets = new Set<string>();
  for (const o of overrides) {
    if (!o.attachToId || o.split) continue;
    const from = programOfCode.get(o.code);
    if (!from || !byId.has(from)) continue;
    const to = await finalProgramId(prisma, o.attachToId);
    if (!byId.has(to) || from === to) continue;
    union(from, to);
    attachTargets.add(to);
  }
  const comps = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    comps.set(r, [...(comps.get(r) ?? []), id]);
  }
  const groups: Plan['groups'] = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    const keeper =
      members.find((m) => attachTargets.has(m)) ??
      members.find((m) => byId.get(m)!.absorbed > 0) ??
      keeperOf.get(members[0]!) ??
      [...members].sort((a, b) => (byId.get(b)!.places ?? -1) - (byId.get(a)!.places ?? -1))[0]!;
    groups.push({
      keeperId: keeper,
      memberIds: members,
      bySuffix: members.some((m) => suffixOf.get(keeperOf.get(m) ?? '') ?? false),
      attached: members.some((m) => attachTargets.has(m)),
    });
  }
  return { groups };
}

export interface ApplyResult {
  groups: number;
  merged: number;
  skipped: { keeperId: string; reason: string }[];
}

/**
 * Forms every group of the plan (one transaction each; a group with a collision is left as it is
 * and listed), then recomputes the labels. Idempotent: run after every Mon Master sync.
 */
export async function applyCursusGrouping(
  run: JournalRun,
  log: (m: string) => Promise<unknown> | void = () => {},
): Promise<ApplyResult> {
  const { groups } = await planCursus();
  const res: ApplyResult = { groups: 0, merged: 0, skipped: [] };
  for (const g of groups) {
    try {
      await mergeGroup(run, g);
      res.groups++;
      res.merged += g.memberIds.length - 1;
    } catch (e) {
      if (!(e instanceof CursusCollision)) throw e;
      res.skipped.push({ keeperId: g.keeperId, reason: e.message });
      await log(`cursus : groupe de ${g.keeperId} laissé tel quel (${e.message})`);
    }
  }
  await recomputeCursusLabels();
  return res;
}

// ───────────────────────────── labels ─────────────────────────────

/**
 * Labels of the cursus (numbers of the latest session) of every parcours, or of the given ones:
 * the rules of labelCursus, then the label typed in the admin. A parcours with one cursus has none.
 */
export async function recomputeCursusLabels(programIds?: string[]): Promise<number> {
  const rows = await prisma.monMasterEntry.findMany({
    where: {
      program: { status: { not: 'MERGED' } },
      ...(programIds ? { programId: { in: programIds } } : {}),
    },
    select: {
      id: true,
      code: true,
      label: true,
      places: true,
      workStudy: true,
      lastSession: true,
      programId: true,
      homeProgramId: true,
      cursusLabel: true,
      program: { select: { title: true, university: { select: { name: true } } } },
    },
  });
  const overrides = new Map(
    (await prisma.cursusOverride.findMany({ where: { label: { not: null } } })).map((o) => [
      o.code,
      o.label,
    ]),
  );
  const homes = new Map(
    (
      await prisma.program.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.homeProgramId ?? r.programId))] } },
        select: { id: true, city: true },
      })
    ).map((p) => [p.id, p.city]),
  );
  const byProgram = new Map<string, typeof rows>();
  for (const r of rows) byProgram.set(r.programId, [...(byProgram.get(r.programId) ?? []), r]);
  const updates: { id: string; label: string | null }[] = [];
  for (const list of byProgram.values()) {
    const latest = Math.max(...list.map((r) => r.lastSession ?? 0));
    const live = list.filter((r) => (r.lastSession ?? 0) === latest);
    const computed = labelCursus(
      live.map((r) => ({
        id: r.code,
        title: r.label ?? r.program.title,
        workStudy: !!r.workStudy,
        places: specificPlaces({
          places: splitMonMasterPlaces(r.places),
          etaName: r.program.university.name,
        }),
        hint: homes.get(r.homeProgramId ?? r.programId) ?? null,
      })),
    );
    for (const r of list) {
      const isLive = live.includes(r);
      const label =
        !isLive || live.length < 2 ? null : (overrides.get(r.code) ?? computed.get(r.code) ?? null);
      if (label !== r.cursusLabel) updates.push({ id: r.id, label });
    }
  }
  for (let i = 0; i < updates.length; i += 1000)
    await prisma.$executeRaw`
      UPDATE "MonMasterEntry" e SET "cursusLabel" = v.label
        FROM jsonb_to_recordset(${JSON.stringify(updates.slice(i, i + 1000))}::jsonb) AS v(id text, label text)
       WHERE e.id = v.id`;
  return updates.length;
}

// ───────────────────────────── undo ─────────────────────────────

interface JournalRow {
  id: bigint;
  op: string;
  tableName: string;
  rowKey: Record<string, unknown>;
  column: string | null;
  oldValue: unknown;
  row: Record<string, unknown> | null;
}

const COLUMNS: Record<Table, ReadonlySet<string>> = {
  Program: new Set(['slug', 'title', 'status', 'mergedIntoId', 'isPublished']),
  MonMasterEntry: new Set(['programId', 'homeProgramId']),
  AdmissionStat: new Set(['programId']),
  Review: new Set(['programId']),
  Favorite: new Set(['programId']),
  Question: new Set(['programId']),
  ProgramVerification: new Set(['programId']),
  Identifier: new Set(['entityId']),
  FieldProvenance: new Set(['entityId']),
  ProgramSlugRedirect: new Set(['programId']),
  qr_links: new Set(['target_path']),
};

/** Undoes journal rows, newest first, by batches of the same operation (exact way back). */
/** SQL undoing a batch of one journal operation, rows as $1 (jsonb array). */
function undoSql(op: string, table: Table, column: string | null): string {
  ident(table, op === 'update' ? (column ?? '') : undefined);
  const match = TABLES[table].map((k) => `t.${q(k)} = v.${q(k)}`).join(' AND ');
  const rows = `jsonb_populate_recordset(NULL::${q(table)}, $1::jsonb)`;
  if (op === 'update')
    return `UPDATE ${q(table)} t SET ${q(column!)} = v.${q(column!)} FROM ${rows} v WHERE ${match}`;
  if (op === 'insert') return `DELETE FROM ${q(table)} t USING ${rows} v WHERE ${match}`;
  if (op === 'delete') return `INSERT INTO ${q(table)} SELECT * FROM ${rows}`;
  throw new Error(`opération inattendue : ${op}`);
}

async function undoRows(tx: Tx, rows: JournalRow[]) {
  let i = 0;
  while (i < rows.length) {
    const r0 = rows[i]!;
    let j = i;
    while (
      j < rows.length &&
      rows[j]!.op === r0.op &&
      rows[j]!.tableName === r0.tableName &&
      rows[j]!.column === r0.column &&
      j - i < 1000
    )
      j++;
    const batch = rows.slice(i, j);
    const table = r0.tableName as Table;
    let values: unknown[] = batch.map((r) => (r0.op === 'delete' ? r.row : r.rowKey));
    if (r0.op === 'update') {
      const col = r0.column!;
      // A row moved twice in one batch: only its oldest value counts (rows are newest first).
      const seen = new Set<string>();
      values = [...batch]
        .reverse()
        .filter((r) => {
          const k = JSON.stringify(r.rowKey);
          return seen.has(k) ? false : (seen.add(k), true);
        })
        .map((r) => ({ ...r.rowKey, [col]: r.oldValue }));
    }
    // raw-sql: built by undoSql from identifiers checked against the constant lists; rows are $1.
    await tx.$executeRawUnsafe(undoSql(r0.op, table, r0.column), JSON.stringify(values));
    i = j;
  }
}

async function journal(where: Prisma.CursusJournalWhereInput): Promise<JournalRow[]> {
  return (await prisma.cursusJournal.findMany({
    where,
    orderBy: { id: 'desc' },
  })) as unknown as JournalRow[];
}

/**
 * Undoes every grouping (migration, syncs, admin), newest first, then forgets the labels: the
 * catalogue is back to its state before `pnpm cursus:migrate`. The run « schema » (the former
 * Program.variantOfId, put back by down.sql) is left.
 */
export async function revertAll(): Promise<number> {
  const rows = await journal({ runId: { not: 'schema' } });
  await prisma.$transaction(
    async (tx) => {
      await undoRows(tx, rows);
      await tx.cursusJournal.deleteMany({ where: { runId: { not: 'schema' } } });
      await tx.monMasterEntry.updateMany({
        where: { cursusLabel: { not: null } },
        data: { cursusLabel: null },
      });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  return rows.length;
}

/** Undoes one run of the journal (one migration, one sync, one admin action). */
export async function revertRun(runId: string): Promise<number> {
  const rows = await journal({ runId });
  await prisma.$transaction(
    async (tx) => {
      await undoRows(tx, rows);
      await tx.cursusJournal.deleteMany({ where: { runId } });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  return rows.length;
}

// ───────────────────────────── admin ─────────────────────────────

export interface CursusActionResult {
  ok: boolean;
  error?: string;
  /** Parcours to refresh (index, ratings, cache). */
  touched: string[];
}

/**
 * « Séparer »: the number goes back to the fiche it came from, with its URL, and that fiche with
 * every number it brought is never grouped again. The rows its merge moved go back with it (its
 * reviews and follows of the time); what was written since stays on the parcours.
 */
export async function splitCursus(
  code: string,
  adminId: string | null,
): Promise<CursusActionResult> {
  const e = await prisma.monMasterEntry.findUnique({
    where: { code },
    select: { programId: true, homeProgramId: true },
  });
  if (!e) return { ok: false, error: 'Numéro Mon Master inconnu.', touched: [] };
  const home = e.homeProgramId;
  if (!home || home === e.programId)
    return {
      ok: false,
      error: 'C’est le cursus d’origine de ce parcours : sépare plutôt les autres cursus.',
      touched: [],
    };
  const rows = await journal({ programId: home, runId: { not: 'schema' } });
  const codes = await prisma.$transaction(
    async (tx) => {
      await undoRows(tx, rows);
      await tx.cursusJournal.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      // Numbers it brought that the journal did not move (none in practice): back home too.
      await tx.monMasterEntry.updateMany({
        where: { homeProgramId: home, programId: e.programId },
        data: { programId: home },
      });
      const own = await tx.monMasterEntry.findMany({
        where: { programId: home },
        select: { code: true },
      });
      for (const o of own)
        await tx.cursusOverride.upsert({
          where: { code: o.code },
          create: { code: o.code, split: true, updatedById: adminId },
          update: { split: true, attachToId: null, updatedById: adminId },
        });
      return own.map((o) => o.code);
    },
    { timeout: 120_000 },
  );
  await recomputeCursusLabels([e.programId, home]);
  return { ok: codes.length > 0, touched: [e.programId, home] };
}

/** « Rattacher »: the fiche joins the parcours (its URL answers 301), and stays there. */
export async function attachFiche(
  fromId: string,
  targetId: string,
  adminId: string | null,
): Promise<CursusActionResult> {
  const to = await finalProgramId(prisma, targetId);
  const from = await prisma.program.findUnique({
    where: { id: fromId },
    select: { status: true, monMasterEntries: { select: { code: true } } },
  });
  if (!from || from.status === 'MERGED')
    return { ok: false, error: 'Fiche déjà rattachée.', touched: [] };
  if (to === fromId)
    return { ok: false, error: 'Une fiche ne peut pas être rattachée à elle-même.', touched: [] };
  const run = { runId: `admin:${randomUUID()}` };
  try {
    await prisma.$transaction(async (tx) => mergeInto(tx, run, fromId, to), { timeout: 120_000 });
  } catch (err) {
    if (err instanceof CursusCollision) return { ok: false, error: err.message, touched: [] };
    throw err;
  }
  const slug = (
    await prisma.program.findUniqueOrThrow({ where: { id: to }, select: { slug: true } })
  ).slug;
  const fromSlug = (
    await prisma.program.findUniqueOrThrow({ where: { id: fromId }, select: { slug: true } })
  ).slug;
  await prisma.$transaction(async (tx) => repointShortLinks(tx, run, fromId, fromSlug, slug));
  for (const c of from.monMasterEntries)
    await prisma.cursusOverride.upsert({
      where: { code: c.code },
      create: { code: c.code, attachToId: to, updatedById: adminId },
      update: { attachToId: to, split: false, updatedById: adminId },
    });
  await recomputeCursusLabels([to]);
  return { ok: true, touched: [to, fromId] };
}

/** Label and « Mène vers : » typed in the admin: kept at every sync. Empty = back to the rules. */
export async function setCursusLabel(
  code: string,
  label: string | null,
  leadsTo: string | null,
  adminId: string | null,
): Promise<CursusActionResult> {
  const e = await prisma.monMasterEntry.findUnique({
    where: { code },
    select: { programId: true },
  });
  if (!e) return { ok: false, error: 'Numéro Mon Master inconnu.', touched: [] };
  await prisma.cursusOverride.upsert({
    where: { code },
    create: { code, label: label || null, leadsTo: leadsTo || null, updatedById: adminId },
    update: { label: label || null, leadsTo: leadsTo || null, updatedById: adminId },
  });
  await recomputeCursusLabels([e.programId]);
  return { ok: true, touched: [e.programId] };
}
