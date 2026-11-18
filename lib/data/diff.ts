/**
 * Plans and difference report.
 * The merge step writes one RecordPlan per staged record; the report aggregates them and the
 * publish step replays them. Pure module.
 */

export type FieldOutcome = 'create' | 'update' | 'unchanged' | 'locked' | 'conflict';
export type RecordAction =
  'create' | 'update' | 'unchanged' | 'proposal' | 'merge-proposal' | 'ignored' | 'rejected';

export interface FieldChange {
  /** CERTIFICATION changes are reported only (the Certification table mirrors the RNCP, no provenance). */
  entityType: 'PROGRAM' | 'MENTION' | 'UNIVERSITY' | 'CERTIFICATION';
  /** Null when the entity is created by this record. */
  entityId: string | null;
  field: string;
  label: string;
  from: unknown;
  to: unknown;
  source: string;
  sourceUrl?: string | null;
  state?: 'OK' | 'STALE' | 'CONFLICT' | 'MISSING' | 'ERROR';
  evidence?: string | null;
  outcome: FieldOutcome;
}

export interface RecordPlan {
  action: RecordAction;
  target: { type: string; id: string | null; label: string };
  changes: FieldChange[];
  /** Connector-specific operations replayed by publish (links, stats rows, identifiers…). */
  ops?: Record<string, unknown>;
  note?: string;
}

export interface DiffReport {
  generatedAt: string;
  records: number;
  byAction: Record<RecordAction, number>;
  byTarget: Record<string, Record<RecordAction, number>>;
  fields: { changed: number; locked: number; conflicts: number };
  /** Share of records that would be created or modified (0 … 1). */
  changeRatio: number;
  samples: { recordKey: string; action: RecordAction; target: string; changes: string[] }[];
  alerts: { code: string; title: string; count: number }[];
  nothingNew?: boolean;
}

const ACTIONS: RecordAction[] = [
  'create',
  'update',
  'unchanged',
  'proposal',
  'merge-proposal',
  'ignored',
  'rejected',
];
const zero = () => Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<RecordAction, number>;

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** True when a change really changes the displayed value (a provenance move is not a change). */
export function changesValue(c: FieldChange): boolean {
  return c.outcome === 'create'
    ? c.to != null && c.to !== ''
    : c.outcome === 'update' && !sameValue(c.from, c.to);
}

/** Action of a record from its field changes: update only when a displayed value changes. */
export function planAction(changes: FieldChange[]): 'update' | 'unchanged' {
  return changes.some((c) => changesValue(c) || c.outcome === 'conflict') ? 'update' : 'unchanged';
}

export function fmt(v: unknown): string {
  if (v == null || v === '') return '∅';
  if (Array.isArray(v)) return v.map(fmt).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function buildDiff(
  plans: { recordKey: string; plan: RecordPlan | null }[],
  alerts: DiffReport['alerts'] = [],
  sampleSize = 200,
): DiffReport {
  const byAction = zero();
  const byTarget: DiffReport['byTarget'] = {};
  const fields = { changed: 0, locked: 0, conflicts: 0 };
  const samples: DiffReport['samples'] = [];
  for (const { recordKey, plan } of plans) {
    if (!plan) continue;
    byAction[plan.action]++;
    (byTarget[plan.target.type] ??= zero())[plan.action]++;
    for (const c of plan.changes) {
      if (changesValue(c)) fields.changed++;
      else if (c.outcome === 'locked') fields.locked++;
      else if (c.outcome === 'conflict') fields.conflicts++;
    }
    if (plan.action !== 'unchanged' && plan.action !== 'ignored' && samples.length < sampleSize)
      samples.push({
        recordKey,
        action: plan.action,
        target: plan.target.label,
        changes: plan.changes
          .filter((c) => c.outcome !== 'unchanged' && (c.outcome !== 'update' || changesValue(c)))
          .slice(0, 12)
          .map(
            (c) =>
              `${c.label} : ${fmt(c.from)} → ${fmt(c.to)}${c.outcome === 'update' || c.outcome === 'create' ? '' : ` (${c.outcome === 'locked' ? 'verrouillé' : 'conflit'})`}`,
          ),
      });
  }
  const records = plans.filter((p) => p.plan).length;
  return {
    generatedAt: new Date().toISOString(),
    records,
    byAction,
    byTarget,
    fields,
    changeRatio: records ? (byAction.create + byAction.update) / records : 0,
    samples,
    alerts,
  };
}

/** One CSV line per field change (and one per record without field change). `;` separated, UTF-8 BOM. */
export function diffCsv(rows: { recordKey: string; plan: RecordPlan | null }[]): string {
  const esc = (v: unknown) => {
    const s = fmt(v).replace(/∅/g, '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = ['﻿enregistrement;action;cible;type;champ;avant;après;résultat;source'];
  for (const { recordKey, plan } of rows) {
    if (!plan) continue;
    const head = [recordKey, plan.action, plan.target.label, plan.target.type];
    const changes = plan.changes.filter((c) => c.outcome !== 'unchanged');
    if (!changes.length && plan.action === 'unchanged') continue;
    if (!changes.length) out.push([...head, '', '', '', plan.note ?? '', ''].map(esc).join(';'));
    for (const c of changes)
      out.push([...head, c.label, c.from, c.to, c.outcome, c.source].map(esc).join(';'));
  }
  return out.join('\r\n');
}
