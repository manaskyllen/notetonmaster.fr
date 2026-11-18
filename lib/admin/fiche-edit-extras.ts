import 'server-only';
import { prisma } from '@/lib/db';
import type { EntityType } from '@/lib/db/generated/enums';
import { summarizeAdmission } from '@/lib/queries/catalog';
import { groupOfConflict } from './conflict-groups';
import { OPEN_ISSUE_SQL } from './issues';
import { sourceFamily } from './source-family';
import { formatWhen } from './when';

/**
 * What the edit page shows around the fields (AdminFicheEdit mockup): the points to settle (each
 * a link to its field), the conflicts with their group, the Mon Master figures (read-only) and
 * the provenance table.
 */
export type SectionId = 'id' | 'adm' | 'prog' | 'src';

export interface EditProblem {
  tag: 'Conflit' | 'Manquant' | 'Ancien' | 'Erreur';
  label: string;
  href: string;
  section: SectionId;
}

export interface EditConflict {
  id: string;
  field: string;
  label: string;
  section: SectionId;
  options: { id: string; value: string; source: string; family: string }[];
  /** Group of the conflict (same establishment, field and pair of sources), when ≥ 2 fiches. */
  group: { key: string; others: number; universityName: string } | null;
}

export interface EditProvenance {
  field: string;
  source: string;
  date: string;
  state: 'ok' | 'conflict' | 'old' | 'missing' | 'manual';
}

export interface FicheEditExtras {
  sub: string | null;
  publicHref: string | null;
  problems: EditProblem[];
  conflicts: EditConflict[];
  admission: { label: string; value: string }[] | null;
  admissionSource: string | null;
  oldProgramme: string | null;
  provenance: EditProvenance[];
}

/** Fields of the Admission section (the others are in Identité). */
const ADMISSION_FIELDS = new Set([
  'capacity',
  'applications',
  'offers',
  'lastRankCalled',
  'tuitionFees',
  'selectionProcess',
  'admissionCriteria',
  'expectations',
  'selectionCriteria',
  'examModes',
  'languages',
  'advisedDegrees',
]);

export async function getFicheEditExtras(id: string, type: EntityType): Promise<FicheEditExtras> {
  const [prov, conflicts, issues, program] = await Promise.all([
    prisma.fieldProvenance.findMany({ where: { entityId: id }, orderBy: { position: 'asc' } }),
    prisma.dataConflict.findMany({
      where: { entityId: id, resolvedAt: null, kind: 'VALUE' },
      orderBy: { createdAt: 'asc' },
    }),
    // raw-sql: constant OPEN_ISSUE_SQL; the id is the $1 parameter.
    prisma.$queryRawUnsafe<{ kind: string; detail: string | null }[]>(
      `SELECT kind, detail FROM "DataIssue" WHERE "targetId" = $1 AND ${OPEN_ISSUE_SQL}`,
      id,
    ),
    type === 'PROGRAM'
      ? prisma.program.findUnique({
          where: { id },
          select: {
            slug: true,
            city: true,
            entryLevel: true,
            admissionCriteria: true,
            expectations: true,
            searchIndex: { select: { programId: true } },
            university: { select: { name: true } },
            admissionStats: true,
          },
        })
      : null,
  ]);
  const provOf = new Map(prov.map((p) => [p.field, p]));
  const dated = (d: Date | null | undefined) => (d ? formatWhen(d, new Date(), false) : '—');

  const editConflicts: EditConflict[] = [];
  for (const c of conflicts) {
    const p = provOf.get(c.field);
    const group = await groupOfConflict(c.id);
    const options = (
      c.options as { id: string; label: string; source: string; sourceKey?: string }[]
    ).map((o) => ({
      id: o.id,
      value: o.label,
      family: sourceFamily(o),
      // The value shown until now was read at the last fetch, the other one when the conflict opened.
      source:
        `${o.source} · vu ${o.id === 'current' ? dated(p?.fetchedAt ?? p?.updatedAt) : dated(c.createdAt)}`.replace(
          /vu (\d)/,
          'vu le $1',
        ),
    }));
    editConflicts.push({
      id: c.id,
      field: c.field,
      label: c.title.split(' · ')[0] ?? c.field,
      section: ADMISSION_FIELDS.has(c.field) ? 'adm' : 'id',
      options,
      group:
        group && group.count >= 2 && program
          ? { key: group.key, others: group.count - 1, universityName: program.university.name }
          : null,
    });
  }

  const problems: EditProblem[] = editConflicts.map((c) => ({
    tag: 'Conflit',
    label: c.label,
    href: `#conflit-${c.field}`,
    section: c.section,
  }));
  if (program && !program.admissionCriteria && !program.expectations.length)
    problems.push({
      tag: 'Manquant',
      label: 'Attendus et critères',
      href: '#f-admissionCriteria',
      section: 'adm',
    });
  const old = issues.find((i) => i.kind === 'OLD_PROGRAM');
  if (issues.some((i) => i.kind === 'NO_PROGRAM'))
    problems.push({ tag: 'Manquant', label: 'Programme', href: '#s-prog', section: 'prog' });
  if (old)
    problems.push({
      tag: 'Ancien',
      label: `Programme ${old.detail?.replace(/^Livret /, '') ?? ''}`.trim(),
      href: '#s-prog',
      section: 'prog',
    });
  if (issues.some((i) => i.kind === 'NO_UAI'))
    problems.push({
      tag: 'Manquant',
      label: 'UAI de l’établissement',
      href: type === 'UNIVERSITY' ? '#f-uai' : '#s-src',
      section: type === 'UNIVERSITY' ? 'id' : 'src',
    });
  if (issues.some((i) => i.kind === 'COLLECT_ERROR'))
    problems.push({ tag: 'Erreur', label: 'Collecte du site', href: '#s-src', section: 'src' });

  let admission: FicheEditExtras['admission'] = null;
  let admissionSource: string | null = null;
  if (program) {
    const a = summarizeAdmission(program.admissionStats);
    const nf = new Intl.NumberFormat('fr-FR');
    const n = (v: number | null) => (v == null ? '—' : nf.format(v));
    admission = [
      {
        label: program.entryLevel === 'M2' ? 'Places en M2' : 'Places en M1',
        value: n(a.capacity),
      },
      { label: 'Candidatures', value: n(a.applications) },
      { label: 'Propositions', value: n(a.offers) },
      { label: 'Rang du dernier appelé', value: a.lastRank ?? '—' },
    ];
    const stats = provOf.get('admissionStats') ?? provOf.get('capacity');
    admissionSource = a.session
      ? `Mon Master · données ouvertes ${a.session}${stats?.fetchedAt ? ` · synchro ${formatWhen(stats.fetchedAt)}` : ''} · lecture seule`
      : 'Aucun chiffre Mon Master pour ce parcours';
  }

  const conflictFields = new Set(conflicts.map((c) => c.field));
  const provenance: EditProvenance[] = prov.map((p) => ({
    field: p.label,
    source: conflictFields.has(p.field)
      ? (() => {
          const c = editConflicts.find((x) => x.field === p.field)!;
          return c.options.map((o) => o.source.split(' · ')[0]).join(' ≠ ');
        })()
      : p.source,
    date: p.locked ? dated(p.lockedAt) : dated(p.fetchedAt),
    state: conflictFields.has(p.field)
      ? 'conflict'
      : p.locked
        ? 'manual'
        : p.state === 'CONFLICT'
          ? 'conflict'
          : p.state === 'STALE'
            ? 'old'
            : p.state === 'MISSING' || p.state === 'ERROR'
              ? 'missing'
              : 'ok',
  }));
  if (old && !provenance.some((p) => p.field === 'Programme'))
    provenance.push({
      field: 'Programme',
      source: old.detail ?? 'Livret',
      date: '—',
      state: 'old',
    });

  return {
    sub: program ? `${program.university.name} · ${program.city}` : null,
    publicHref: program?.searchIndex ? `/parcours/${program.slug}` : null,
    problems,
    conflicts: editConflicts,
    admission,
    admissionSource,
    oldProgramme: old ? (old.detail ?? 'Livret ancien') : null,
    provenance,
  };
}
