/**
 * Field-by-field merge:
 * - a locked field is never overwritten (the provenance shows what the source says);
 * - a stronger source replaces a weaker one; a weaker source fills an empty field;
 * - two sources disagreeing on a field with a conflict rule open a DataConflict, the priority
 *   value stays displayed (state CONFLICT) until the arbitration, which locks the field.
 */
import { prisma } from '@/lib/db';
import type { EntityType, FieldProvenance, Prisma } from '@/lib/db/generated/client';
import type { FieldChange, FieldOutcome } from './diff';
import { FIELD_PRIORITY, rank, type FieldRule } from './priorities';
import { sourceFamily } from '@/lib/admin/source-family';

export interface CurrentField {
  value: unknown;
  sourceKey: string | null;
  source: string;
  state: string;
  locked: boolean;
}

export interface IncomingValue {
  value: unknown;
  sourceKey: string;
  source: string; // human label: "Mon Master · données ouvertes, session 2025"
  sourceUrl?: string | null;
  state?: FieldChange['state'];
  evidence?: string | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

export interface FieldDecision {
  outcome: FieldOutcome;
  /** Value that will be displayed after the merge. */
  value: unknown;
  warning?: string;
}

/** Pure decision for one field (unit-tested). */
export function decideMerge(
  field: string,
  current: CurrentField | null | undefined,
  incoming: IncomingValue,
  rules: Record<string, FieldRule> = FIELD_PRIORITY,
  /** Source family a SourceRule prefers for this field of this establishment (« Toujours : … »). */
  preferred?: string | null,
): FieldDecision {
  if (current?.locked) return { outcome: 'locked', value: current.value };
  if (!current) return { outcome: 'create', value: incoming.value };
  if (empty(current.value) && current.sourceKey !== incoming.sourceKey)
    return empty(incoming.value)
      ? { outcome: 'unchanged', value: current.value }
      : { outcome: 'update', value: incoming.value }; // stronger source empty: take the next one
  if (current.sourceKey === incoming.sourceKey) {
    const sameState =
      (current.state ?? 'OK') === (incoming.state ?? 'OK') || current.state === 'CONFLICT';
    return same(current.value, incoming.value) && sameState
      ? { outcome: 'unchanged', value: current.value }
      : { outcome: 'update', value: incoming.value };
  }
  if (empty(incoming.value)) return { outcome: 'unchanged', value: current.value }; // weaker or empty: keep
  const verdict = same(current.value, incoming.value)
    ? false
    : (rules[field]?.conflict?.(current.value, incoming.value) ?? false);
  const incomingStronger =
    rank(field, incoming.sourceKey, rules) < rank(field, current.sourceKey, rules);
  if (verdict === 'conflict') {
    // A rule chosen in the admin settles it the same way every time: no new conflict.
    if (preferred && preferred === incoming.sourceKey)
      return { outcome: 'update', value: incoming.value };
    if (preferred && preferred === sourceFamily(current))
      return { outcome: 'unchanged', value: current.value };
    return {
      outcome: current.state === 'CONFLICT' ? 'unchanged' : 'conflict',
      value: incomingStronger ? incoming.value : current.value,
    };
  }
  if (incomingStronger)
    return same(current.value, incoming.value)
      ? { outcome: 'update', value: incoming.value } // same value, provenance moves to the stronger source
      : {
          outcome: 'update',
          value: incoming.value,
          warning: verdict === 'warning' ? 'intitulés proches' : undefined,
        };
  return {
    outcome: 'unchanged',
    value: current.value,
    warning: verdict === 'warning' ? 'intitulés proches' : undefined,
  };
}

// ───────────────────────────── source rules ─────────────────────────────

let rulesCache: { at: number; rules: Map<string, string> } | null = null;

/** SourceRules by `universityId|field` (small table, re-read every 30 s). */
export async function loadSourceRules(): Promise<Map<string, string>> {
  if (rulesCache && Date.now() - rulesCache.at < 30_000) return rulesCache.rules;
  const rows = await prisma.sourceRule.findMany({
    select: { universityId: true, field: true, sourceKey: true },
  });
  rulesCache = {
    at: Date.now(),
    rules: new Map(rows.map((r) => [`${r.universityId}|${r.field}`, r.sourceKey])),
  };
  return rulesCache.rules;
}

export function forgetSourceRules() {
  rulesCache = null;
}

/** Establishment of each entity (programs: theirs; establishments: themselves). */
async function universitiesOf(entityType: string, ids: string[]): Promise<Map<string, string>> {
  if (entityType === 'UNIVERSITY') return new Map(ids.map((id) => [id, id]));
  if (entityType !== 'PROGRAM') return new Map();
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 5000)
    for (const p of await prisma.program.findMany({
      where: { id: { in: ids.slice(i, i + 5000) } },
      select: { id: true, universityId: true },
    }))
      out.set(p.id, p.universityId);
  return out;
}

async function preferredFor(
  entityType: string,
  entityId: string,
  field: string,
): Promise<string | null> {
  const rules = await loadSourceRules();
  if (!rules.size) return null;
  const uni = (await universitiesOf(entityType, [entityId])).get(entityId);
  return uni ? (rules.get(`${uni}|${field}`) ?? null) : null;
}

export type ProvenanceIndex = Map<string, FieldProvenance>;
const pkey = (entityId: string, field: string) => `${entityId}\u0000${field}`;

/** Loads the provenance of many entities at once (merge runs on thousands of records). */
export async function loadProvenance(
  entityType: EntityType,
  ids: string[],
): Promise<ProvenanceIndex> {
  const out: ProvenanceIndex = new Map();
  for (let i = 0; i < ids.length; i += 5000) {
    const rows = await prisma.fieldProvenance.findMany({
      where: { entityType, entityId: { in: ids.slice(i, i + 5000) } },
    });
    for (const r of rows) out.set(pkey(r.entityId, r.field), r);
  }
  return out;
}

export function currentOf(
  index: ProvenanceIndex,
  entityId: string | null,
  field: string,
): CurrentField | null {
  if (!entityId) return null;
  const r = index.get(pkey(entityId, field));
  return r
    ? { value: r.value, sourceKey: r.sourceKey, source: r.source, state: r.state, locked: r.locked }
    : null;
}

/** Builds a FieldChange for the plan. */
export function planField(
  index: ProvenanceIndex,
  entityType: FieldChange['entityType'],
  entityId: string | null,
  field: string,
  label: string,
  incoming: IncomingValue,
): FieldChange {
  const cur = currentOf(index, entityId, field);
  const d = decideMerge(field, cur, incoming);
  return {
    entityType,
    entityId,
    field,
    label,
    from: cur?.value ?? null,
    to: d.outcome === 'locked' ? incoming.value : d.value,
    source: incoming.source,
    sourceUrl: incoming.sourceUrl ?? null,
    state: incoming.state ?? 'OK',
    evidence: incoming.evidence ?? null,
    outcome: d.outcome,
    ...(d.warning ? { warning: d.warning } : {}),
  } as FieldChange;
}

export interface PublishCounters {
  created: number;
  updated: number;
  unchanged: number;
  skippedLocked: number;
  conflicts: number;
}

/**
 * Applies one planned field change at publish time. The lock and the provenance are read again:
 * a field locked between the preview and the application is never overwritten.
 * Returns the value to write in the entity column (also when unchanged, so the column matches the
 * displayed value), or `undefined` for a locked field (its column is left alone).
 */
export async function applyFieldChange(
  change: FieldChange,
  entityId: string,
  sourceKey: string,
  counters: PublishCounters,
  conflictTitle?: string,
): Promise<unknown> {
  const row = await prisma.fieldProvenance.findUnique({
    where: {
      entityType_entityId_field: {
        entityType: change.entityType as EntityType,
        entityId,
        field: change.field,
      },
    },
  });
  const cur: CurrentField | null = row
    ? {
        value: row.value,
        sourceKey: row.sourceKey,
        source: row.source,
        state: row.state,
        locked: row.locked,
      }
    : null;
  const incoming: IncomingValue = {
    value: change.to,
    sourceKey,
    source: change.source,
    sourceUrl: change.sourceUrl,
    state: change.state,
    evidence: change.evidence,
  };
  const d = decideMerge(
    change.field,
    cur,
    incoming,
    FIELD_PRIORITY,
    await preferredFor(change.entityType, entityId, change.field),
  );
  const now = new Date();
  if (d.outcome === 'locked') {
    counters.skippedLocked++;
    return undefined;
  }
  if (d.outcome === 'unchanged') {
    counters.unchanged++;
    if (row && row.sourceKey === sourceKey)
      await prisma.fieldProvenance.update({ where: { id: row.id }, data: { fetchedAt: now } });
    return d.value; // the column is kept consistent with the displayed value
  }
  if (d.outcome === 'conflict') {
    counters.conflicts++;
    const key = `${entityId}:${change.field}`;
    await prisma.dataConflict.upsert({
      where: { key },
      create: {
        key,
        kind: 'VALUE',
        entityType: change.entityType as EntityType,
        entityId,
        field: change.field,
        title: conflictTitle ?? `${change.label}`,
        detail: `${row!.source} et ${change.source} ne donnent pas la même valeur.`,
        options: [
          {
            id: 'current',
            label: String(row!.value),
            value: row!.value,
            source: row!.source,
            sourceKey: row!.sourceKey,
          },
          {
            id: 'incoming',
            label: String(change.to),
            value: change.to,
            source: change.source,
            sourceKey,
          },
        ] as never,
      },
      update: {},
    });
    await prisma.fieldProvenance.update({
      where: { id: row!.id },
      data: { state: 'CONFLICT', value: d.value as never, previousValue: row!.value as never },
    });
    return d.value;
  }
  const data = {
    label: change.label,
    value: d.value as never,
    source: change.source,
    sourceKey,
    sourceUrl: change.sourceUrl ?? null,
    evidence: change.evidence ? change.evidence.slice(0, 300) : null,
    state: change.state ?? 'OK',
    fetchedAt: now,
  };
  if (!row) {
    counters.created++;
    await prisma.fieldProvenance.create({
      data: { entityType: change.entityType as EntityType, entityId, field: change.field, ...data },
    });
  } else {
    counters.updated++;
    await prisma.fieldProvenance.update({
      where: { id: row.id },
      data: { ...data, previousValue: same(row.value, d.value) ? undefined : (row.value as never) },
    });
  }
  return d.value;
}

// ───────────────────────────── bulk publication ─────────────────────────────

export interface BulkChange {
  change: FieldChange;
  entityId: string;
  conflictTitle?: string;
}

export const WRITE_BATCH = 1000;

/** Splits an array in chunks. */
export function chunks<T>(list: T[], size = WRITE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Publishes many field changes at once (decision F): the provenance is read
 * in bulk, every change is decided in memory with the same rules as `applyFieldChange` (a field
 * locked since the simulation is never overwritten), then rows are written by batches of 1 000 in
 * short transactions. Returns the value to write in each entity column (`undefined`: locked).
 */
export async function applyFieldChangesBulk(
  items: BulkChange[],
  sourceKey: string,
  counters: PublishCounters,
  onBatch?: (done: number, total: number) => Promise<void>,
): Promise<Map<string, Map<string, unknown>>> {
  const values = new Map<string, Map<string, unknown>>();
  const byType = new Map<string, string[]>();
  for (const it of items)
    byType.set(it.change.entityType, [...(byType.get(it.change.entityType) ?? []), it.entityId]);
  const rows = new Map<string, FieldProvenance>();
  for (const [type, ids] of byType)
    for (const part of chunks([...new Set(ids)], 5000))
      for (const r of await prisma.fieldProvenance.findMany({
        where: { entityType: type as EntityType, entityId: { in: part } },
      }))
        rows.set(`${r.entityType}|${r.entityId}|${r.field}`, r);

  const creates: Prisma.FieldProvenanceCreateManyInput[] = [];
  const updates: Record<string, unknown>[] = [];
  const touch: string[] = [];
  const conflicts: Prisma.DataConflictCreateManyInput[] = [];
  const now = new Date();
  const sourceRules = await loadSourceRules();
  const uniOf = new Map<string, string>();
  if (sourceRules.size)
    for (const [type, ids] of byType)
      for (const [k, v] of await universitiesOf(type, [...new Set(ids)])) uniOf.set(k, v);
  for (const { change, entityId, conflictTitle } of items) {
    const row = rows.get(`${change.entityType}|${entityId}|${change.field}`);
    const cur: CurrentField | null = row
      ? {
          value: row.value,
          sourceKey: row.sourceKey,
          source: row.source,
          state: row.state,
          locked: row.locked,
        }
      : null;
    const uni = uniOf.get(entityId);
    const d = decideMerge(
      change.field,
      cur,
      {
        value: change.to,
        sourceKey,
        source: change.source,
        sourceUrl: change.sourceUrl,
        state: change.state,
        evidence: change.evidence,
      },
      FIELD_PRIORITY,
      uni ? sourceRules.get(`${uni}|${change.field}`) : null,
    );
    const set = (v: unknown) => {
      const m = values.get(entityId) ?? new Map<string, unknown>();
      m.set(change.field, v);
      values.set(entityId, m);
    };
    if (d.outcome === 'locked') {
      counters.skippedLocked++;
      continue;
    }
    if (d.outcome === 'unchanged') {
      counters.unchanged++;
      if (row && row.sourceKey === sourceKey) touch.push(row.id);
      set(d.value);
      continue;
    }
    if (d.outcome === 'conflict') {
      counters.conflicts++;
      conflicts.push({
        key: `${entityId}:${change.field}`,
        kind: 'VALUE',
        entityType: change.entityType as EntityType,
        entityId,
        field: change.field,
        title: conflictTitle ?? change.label,
        detail: `${row!.source} et ${change.source} ne donnent pas la même valeur.`,
        options: [
          {
            id: 'current',
            label: String(row!.value),
            value: row!.value,
            source: row!.source,
            sourceKey: row!.sourceKey,
          },
          {
            id: 'incoming',
            label: String(change.to),
            value: change.to,
            source: change.source,
            sourceKey,
          },
        ] as never,
      });
      updates.push({
        id: row!.id,
        value: d.value,
        previousValue: row!.value,
        state: 'CONFLICT',
        source: row!.source,
        sourceKey: row!.sourceKey,
        sourceUrl: row!.sourceUrl,
        evidence: row!.evidence,
        label: row!.label,
      });
      set(d.value);
      continue;
    }
    const data = {
      label: change.label,
      value: d.value as never,
      source: change.source,
      sourceKey,
      sourceUrl: change.sourceUrl ?? null,
      evidence: change.evidence ? change.evidence.slice(0, 300) : null,
      state: change.state ?? 'OK',
    };
    if (!row) {
      counters.created++;
      creates.push({
        entityType: change.entityType as EntityType,
        entityId,
        field: change.field,
        fetchedAt: now,
        ...data,
      });
    } else {
      counters.updated++;
      updates.push({
        id: row.id,
        ...data,
        previousValue:
          JSON.stringify(row.value ?? null) === JSON.stringify(d.value ?? null)
            ? row.previousValue
            : row.value,
      });
    }
    set(d.value);
  }

  let done = 0;
  const total = creates.length + updates.length + touch.length + conflicts.length;
  for (const part of chunks(creates)) {
    await prisma.fieldProvenance.createMany({ data: part, skipDuplicates: true });
    done += part.length;
    await onBatch?.(done, total);
  }
  for (const part of chunks(updates)) {
    // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
    await prisma.$executeRawUnsafe(
      `UPDATE "FieldProvenance" AS f SET "value" = v."value", "previousValue" = v."previousValue", "state" = v."state"::"FieldState",
         "source" = v."source", "sourceKey" = v."sourceKey", "sourceUrl" = v."sourceUrl", "evidence" = v."evidence", "label" = v."label",
         "fetchedAt" = now(), "updatedAt" = now()
       FROM jsonb_to_recordset($1::jsonb) AS v(id text, "value" jsonb, "previousValue" jsonb, "state" text, "source" text, "sourceKey" text, "sourceUrl" text, "evidence" text, "label" text)
       WHERE f.id = v.id`,
      JSON.stringify(part),
    );
    done += part.length;
    await onBatch?.(done, total);
  }
  for (const part of chunks(touch, 5000)) {
    await prisma.fieldProvenance.updateMany({
      where: { id: { in: part } },
      data: { fetchedAt: now },
    });
    done += part.length;
  }
  for (const part of chunks(conflicts)) {
    await prisma.dataConflict.createMany({ data: part, skipDuplicates: true });
    done += part.length;
  }
  return values;
}
