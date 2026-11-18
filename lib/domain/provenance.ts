/** Field updates from connectors never overwrite a field locked by a human. */
export interface ProvenanceRecord {
  field: string;
  value: unknown;
  source: string;
  state: 'OK' | 'STALE' | 'CONFLICT' | 'MISSING' | 'ERROR';
  locked: boolean;
}

export interface IncomingField {
  field: string;
  value: unknown;
  source: string;
  state?: ProvenanceRecord['state'];
}

export type FieldDecision =
  | { action: 'skip-locked'; field: string }
  | { action: 'unchanged'; field: string }
  | {
      action: 'create' | 'update';
      field: string;
      next: Omit<ProvenanceRecord, 'locked'> & { locked: false };
    }
  | { action: 'conflict'; field: string; current: unknown; incoming: unknown };

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decides what a sync does with one incoming field.
 * - locked fields are never touched;
 * - a value from the same source replaces the old one;
 * - a different value from another source, on a field that is OK, becomes a conflict.
 */
export function decideFieldUpdate(
  current: ProvenanceRecord | undefined,
  incoming: IncomingField,
): FieldDecision {
  if (current?.locked) return { action: 'skip-locked', field: incoming.field };
  const nextState = incoming.state ?? 'OK';
  if (!current)
    return {
      action: 'create',
      field: incoming.field,
      next: {
        field: incoming.field,
        value: incoming.value,
        source: incoming.source,
        state: nextState,
        locked: false,
      },
    };
  if (
    same(current.value, incoming.value) &&
    current.source === incoming.source &&
    current.state === nextState
  )
    return { action: 'unchanged', field: incoming.field };
  if (
    current.source !== incoming.source &&
    current.value != null &&
    incoming.value != null &&
    !same(current.value, incoming.value) &&
    current.state === 'OK'
  )
    return {
      action: 'conflict',
      field: incoming.field,
      current: current.value,
      incoming: incoming.value,
    };
  return {
    action: 'update',
    field: incoming.field,
    next: {
      field: incoming.field,
      value: incoming.value,
      source: incoming.source,
      state: nextState,
      locked: false,
    },
  };
}

export const FIELD_STATE_LABEL: Record<ProvenanceRecord['state'], string> = {
  OK: 'À jour',
  STALE: 'Ancien',
  CONFLICT: 'Conflit',
  MISSING: 'Manquant',
  ERROR: 'Erreur',
};
