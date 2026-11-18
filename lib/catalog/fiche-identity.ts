import { prisma } from '@/lib/db';

/**
 * « Fiche d'identité » at the bottom of a fiche parcours: the sources line is
 * computed from the provenance of the data the fiche shows (program, its mention, its
 * establishment), never typed in.
 */

/** Fields shown by the fiche, by entity (identity, tabs Programme and Admission). */
export const SHOWN_FIELDS = {
  PROGRAM: [
    'title',
    'city',
    'campus',
    'component',
    'modality',
    'mention',
    'monMasterEntries',
    'capacity',
    'applications',
    'offers',
    'lastRankCalled',
    'semesters',
    'objectives',
    'skills',
    'internships',
    'furtherStudies',
    'admissionCriteria',
    'expectations',
    'selectionCriteria',
    'examModes',
    'languages',
    'advisedDegrees',
    'requirements',
    'selectionProcess',
  ],
  MENTION: ['mentionName', 'certification'],
  UNIVERSITY: ['universityName', 'shortName', 'uai'],
} as const;

/** Name of a source in the sentence, in the order it comes. */
const SOURCE_LABEL: Record<string, string> = {
  'monmaster-opendata': 'Mon Master (données ouvertes du ministère)',
  'monmaster-fiches': 'Mon Master',
  rncp: 'RNCP',
  'univ-sites': 'site de l’université',
  'esr-etablissements': 'annuaire de l’enseignement supérieur',
  manual: 'saisie de l’équipe',
};
const ORDER = Object.keys(SOURCE_LABEL);

/** « A », « A et B », « A, B et C ». */
export function frenchList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;
}

export interface ProvenanceRow {
  sourceKey: string | null;
  fetchedAt: Date | null;
  updatedAt: Date;
}

/**
 * « Sources : Mon Master (données ouvertes du ministère), RNCP et site de l'université » and
 * the latest update, from the provenance rows. Mon Master's two connectors read as one source.
 */
export function identitySources(rows: ProvenanceRow[]): {
  sources: string;
  updatedAt: Date | null;
} {
  const keys = new Set(rows.map((r) => r.sourceKey ?? 'manual'));
  if (keys.has('monmaster-opendata')) keys.delete('monmaster-fiches');
  const labels = [...keys]
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    .map((k) => SOURCE_LABEL[k] ?? k);
  const dates = rows.map((r) => r.fetchedAt ?? r.updatedAt).filter(Boolean);
  const updatedAt = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  return { sources: frenchList(labels), updatedAt };
}

/** Provenance of what the fiche shows, for the sources line of its identity block. */
export async function ficheSources(p: { id: string; mentionId: string; universityId: string }) {
  const rows = await prisma.fieldProvenance.findMany({
    where: {
      state: { in: ['OK', 'STALE'] },
      OR: [
        { entityType: 'PROGRAM', entityId: p.id, field: { in: [...SHOWN_FIELDS.PROGRAM] } },
        { entityType: 'MENTION', entityId: p.mentionId, field: { in: [...SHOWN_FIELDS.MENTION] } },
        {
          entityType: 'UNIVERSITY',
          entityId: p.universityId,
          field: { in: [...SHOWN_FIELDS.UNIVERSITY] },
        },
      ],
    },
    select: { sourceKey: true, fetchedAt: true, updatedAt: true },
  });
  return identitySources(rows);
}
