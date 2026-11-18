/**
 * Field priorities by source.
 * The first source that has a value wins; `conflict` tells when two sources disagreeing opens a
 * DataConflict instead of silently keeping the priority value.
 */
import type { SourceKey } from '@/lib/connectors/types';
import { normProgramTitle, normCity, wordDifference } from './normalize';

/** Manual entries always come first (they are locked anyway). */
export const MANUAL = 'manual';
export type PrioritySource = SourceKey | typeof MANUAL | 'insertion-professionnelle-master';

export interface FieldRule {
  order: PrioritySource[];
  /** True when the two values disagree enough to open a conflict. */
  conflict?: (a: unknown, b: unknown) => 'conflict' | 'warning' | false;
}

const differ = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

export const FIELD_PRIORITY: Record<string, FieldRule> = {
  title: {
    order: [MANUAL, 'monmaster-opendata', 'univ-sites', 'onisep-ideo'],
    conflict: (a, b) => {
      const d = wordDifference(normProgramTitle(String(a)), normProgramTitle(String(b)));
      return d === 0 ? false : d <= 2 ? 'warning' : 'conflict'; // one word differs on each side: warning
    },
  },
  mentionName: { order: [MANUAL, 'rncp', 'monmaster-opendata'] },
  rncpCode: { order: [MANUAL, 'rncp', 'monmaster-opendata'] },
  uai: {
    order: [MANUAL, 'esr-etablissements', 'monmaster-opendata'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
  universityName: { order: [MANUAL, 'esr-etablissements', 'monmaster-opendata'] },
  website: { order: [MANUAL, 'esr-etablissements', 'monmaster-opendata'] },
  address: { order: [MANUAL, 'esr-etablissements', 'monmaster-opendata'] },
  city: {
    order: [MANUAL, 'monmaster-opendata', 'esr-etablissements', 'univ-sites'],
    conflict: (a, b) => (normCity(String(a)) !== normCity(String(b)) ? 'conflict' : false),
  },
  campus: { order: [MANUAL, 'monmaster-opendata', 'esr-etablissements', 'univ-sites'] },
  modality: {
    order: [MANUAL, 'monmaster-opendata', 'univ-sites'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
  // Decision 9: SISE does not give the teaching component; Mon Master place label as a fallback.
  component: {
    order: [MANUAL, 'univ-sites', 'monmaster-opendata'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
  capacity: { order: [MANUAL, 'monmaster-opendata'] },
  capacityAnnounced: { order: [MANUAL, 'univ-sites'] },
  admissionStats: { order: ['monmaster-opendata'] },
  semesters: { order: [MANUAL, 'univ-sites'] },
  internships: { order: [MANUAL, 'univ-sites'] },
  thesis: { order: [MANUAL, 'univ-sites'] },
  tuitionFees: { order: [MANUAL, 'univ-sites'] },
  selection: { order: [MANUAL, 'univ-sites'] },
  languages: { order: [MANUAL, 'univ-sites'] },
  // Rubrics of the university pages (lot 3, 14/11/2026); the Carif-Oref catalogue would come last.
  objectives: { order: [MANUAL, 'univ-sites'] },
  skills: { order: [MANUAL, 'univ-sites'] },
  furtherStudies: { order: [MANUAL, 'univ-sites'] },
  admissionCriteria: { order: [MANUAL, 'univ-sites'] },
  expectations: { order: [MANUAL, 'univ-sites'] },
  selectionCriteria: { order: [MANUAL, 'univ-sites'] },
  advisedDegrees: { order: [MANUAL, 'univ-sites'] },
  requirements: { order: [MANUAL, 'univ-sites'] },
  examModes: { order: [MANUAL, 'univ-sites'] },
  description: { order: [MANUAL, 'univ-sites'] },
  insertion: { order: [MANUAL, 'insersup', 'insertion-professionnelle-master'] },
  siseCode: {
    order: [MANUAL, 'sise-diplomes'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
  onisepId: {
    order: [MANUAL, 'onisep-ideo'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
  paysageId: {
    order: [MANUAL, 'esr-etablissements', 'monmaster-opendata'],
    conflict: (a, b) => (differ(a, b) ? 'conflict' : false),
  },
};

/** Rank of a source for a field (lower is stronger); unknown sources come last. */
export function rank(
  field: string,
  source: string | null | undefined,
  rules = FIELD_PRIORITY,
): number {
  const order = rules[field]?.order ?? [MANUAL];
  const i = order.indexOf((source ?? '') as PrioritySource);
  return i < 0 ? order.length : i;
}
