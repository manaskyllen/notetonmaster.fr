import 'server-only';
import { prisma } from '@/lib/db';
import type { CourseCategory, EntityType, MilestoneKind } from '@/lib/db/generated/enums';

export type FieldType = 'text' | 'area' | 'select' | 'number';

export interface EditField {
  key: string;
  label: string;
  type: FieldType;
  value: string;
  options?: { value: string; label: string }[];
  source: string;
  state: 'OK' | 'STALE' | 'CONFLICT' | 'MISSING' | 'ERROR';
  locked: boolean;
  readOnly?: string;
  wide?: boolean;
}

export interface EditSection {
  /** Anchor of the section (sommaire): id (Identité), adm (Admission). */
  id: 'id' | 'adm';
  title: string;
  fields: EditField[];
}

export interface FicheEditData {
  type: EntityType;
  id: string;
  name: string;
  kind: string;
  ident: string;
  isPublished: boolean;
  sections: EditSection[];
  /** Programme by year (programs only). */
  programme?: ProgrammeEdit;
}

export interface ProgrammeEdit {
  mentionName: string;
  source: string;
  locked: boolean;
  semesters: {
    label: string;
    title: string;
    ects: number;
    courses: {
      label: string;
      ects: number | null;
      category: CourseCategory;
      categoryLocked: boolean;
    }[];
    milestones: { kind: MilestoneKind; title: string; detail: string }[];
  }[];
}

/** Closed list of exam modes (decision 11). */
export const EXAM_MODES = ['Dossier', 'Entretien', 'Épreuve écrite'] as const;

const MODALITIES = [
  { value: 'ONSITE', label: 'Présentiel' },
  { value: 'WORK_STUDY', label: 'Alternance' },
  { value: 'HYBRID', label: 'Hybride' },
  { value: 'REMOTE', label: 'À distance' },
];

/** Builds the editable view of a fiche (program, mention or university) with provenance. */
export async function getFicheForEdit(id: string): Promise<FicheEditData | null> {
  const prov = await prisma.fieldProvenance.findMany({ where: { entityId: id } });
  const p = (key: string, fallbackSource = 'Saisi à la main') => {
    const r = prov.find((x) => x.field === key);
    return {
      source: r?.locked ? 'Verrouillé · valeur saisie à la main' : (r?.source ?? fallbackSource),
      state: r?.state ?? 'OK',
      locked: r?.locked ?? false,
    };
  };

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      university: true,
      component: true,
      monMasterEntries: true,
      admissionStats: true,
      semesters: {
        orderBy: { position: 'asc' },
        include: {
          courses: { orderBy: { order: 'asc' } },
          milestones: { orderBy: { order: 'asc' } },
        },
      },
      mention: true,
    },
  });
  if (program) {
    const mentions = await prisma.mention.findMany({ select: { id: true, name: true } });
    return {
      type: 'PROGRAM',
      id,
      name: program.title,
      kind: 'Parcours',
      ident: [
        program.monMasterEntries.length
          ? `MM ${program.monMasterEntries.map((e) => e.code).join(' + ')}`
          : 'MM —',
        program.mention.rncpCode,
        program.university.uai ? `UAI ${program.university.uai}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      isPublished: program.isPublished,
      sections: [
        {
          id: 'id',
          title: 'Identité',
          fields: [
            {
              key: 'title',
              label: 'Intitulé du parcours',
              type: 'text',
              value: program.title,
              ...p('title'),
            },
            {
              key: 'mention',
              label: 'Mention',
              type: 'select',
              value: program.mentionId,
              options: mentions.map((m) => ({ value: m.id, label: m.name })),
              ...p('mention'),
            },
            {
              key: 'component',
              label: 'Composante',
              type: 'text',
              value: program.component?.name ?? '',
              ...p('component'),
            },
            {
              key: 'campus',
              label: 'Lieu',
              type: 'text',
              value: program.campus ?? '',
              ...p('campus'),
            },
            { key: 'city', label: 'Ville', type: 'text', value: program.city, ...p('campus') },
            {
              key: 'modality',
              label: 'Modalité',
              type: 'select',
              value: program.modality,
              options: MODALITIES,
              ...p('modality'),
            },
          ],
        },
        {
          // Mon Master figures (capacity, applications, offers, last rank) are shown read-only
          // above the section (FicheEditExtras.admission): they come from the open data.
          id: 'adm',
          title: 'Admission',
          fields: [
            {
              key: 'tuitionFees',
              label: 'Frais d’inscription',
              type: 'text',
              value: program.tuitionFees ?? '',
              ...p('tuitionFees'),
            },
            {
              key: 'selectionProcess',
              label: 'Sélection',
              type: 'text',
              value: program.selectionProcess ?? '',
              ...p('selectionProcess'),
            },
            {
              key: 'admissionCriteria',
              label: 'Attendus et critères d’examen',
              type: 'area',
              value: program.admissionCriteria ?? '',
              ...p('admissionCriteria'),
              wide: true,
            },
          ],
        },
        {
          // Decision 11: entered by hand from a public page (Mon Master forbids collection),
          // locked by default, shown in the public « Admission » tab.
          id: 'adm',
          title: 'Admission · saisie manuelle',
          fields: [
            ...(
              [
                ['expectations', 'Attendus (un par ligne)', program.expectations],
                [
                  'selectionCriteria',
                  'Critères d’examen (un par ligne)',
                  program.selectionCriteria,
                ],
                [
                  'examModes',
                  `Modalités d’examen (${EXAM_MODES.join(', ')} ; une par ligne)`,
                  program.examModes,
                ],
                ['languages', 'Langues demandées (une par ligne)', program.languages],
                ['advisedDegrees', 'Diplômes conseillés (un par ligne)', program.advisedDegrees],
              ] as const
            ).map(([key, label, list]) => ({
              key,
              label,
              type: 'area' as const,
              value: list.join('\n'),
              ...p(key, 'Saisie manuelle'),
              wide: true,
            })),
            {
              key: 'admissionSourceUrl',
              label: 'Page consultée (URL)',
              type: 'text' as const,
              value: program.admissionSourceUrl ?? '',
              ...p('admissionSourceUrl', 'Saisie manuelle'),
              wide: true,
            },
          ],
        },
      ],
      programme: {
        mentionName: program.mention.name,
        source: p('semesters').source,
        locked: p('semesters').locked,
        semesters: program.semesters.map((s) => ({
          label: s.label,
          title: s.title ?? '',
          ects: s.ects,
          courses: s.courses.map((c) => ({
            label: c.label,
            ects: c.ects,
            category: c.category,
            categoryLocked: c.categoryLocked,
          })),
          milestones: s.milestones.map((m) => ({
            kind: m.kind,
            title: m.title,
            detail: m.detail ?? '',
          })),
        })),
      },
    };
  }

  const mention = await prisma.mention.findUnique({ where: { id } });
  if (mention)
    return {
      type: 'MENTION',
      id,
      name: mention.name,
      kind: 'Mention',
      ident: mention.rncpCode ?? '',
      isPublished: mention.isPublished,
      sections: [
        {
          id: 'id',
          title: 'Identité',
          fields: [
            {
              key: 'name',
              label: 'Nom de la mention',
              type: 'text',
              value: mention.name,
              ...p('name'),
            },
            {
              key: 'rncpCode',
              label: 'Certification RNCP',
              type: 'text',
              value: mention.rncpCode ?? '',
              ...p('certification'),
            },
            {
              key: 'shortLabel',
              label: 'Nom court (thématique « Cœur du master »)',
              type: 'text',
              value: mention.shortLabel ?? '',
              ...p('shortLabel', 'Saisie manuelle'),
            },
            {
              key: 'description',
              label: 'Description',
              type: 'area',
              value: mention.description ?? '',
              ...p('description'),
              wide: true,
            },
          ],
        },
      ],
    };

  const uni = await prisma.university.findUnique({ where: { id } });
  if (uni) {
    const others = await prisma.university.findMany({
      where: { id: { not: id } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      type: 'UNIVERSITY',
      id,
      name: uni.name,
      kind: 'Université',
      ident: uni.uai ? `UAI ${uni.uai}` : 'UAI à compléter',
      isPublished: uni.isPublished,
      sections: [
        {
          id: 'id',
          title: 'Identité',
          fields: [
            { key: 'name', label: 'Nom', type: 'text', value: uni.name, ...p('name') },
            { key: 'uai', label: 'UAI', type: 'text', value: uni.uai ?? '', ...p('uai') },
            {
              key: 'parentId',
              label: 'Établissement parent (établissement-composante)',
              type: 'select',
              value: uni.parentId ?? '',
              options: [
                { value: '', label: 'Aucun' },
                ...others.map((o) => ({ value: o.id, label: o.name })),
              ],
              ...p('parentId'),
            },
            {
              key: 'website',
              label: 'Site',
              type: 'text',
              value: uni.website ?? '',
              ...p('website'),
            },
            {
              key: 'cities',
              label: 'Villes (séparées par des virgules)',
              type: 'text',
              value: uni.cities.join(', '),
              ...p('cities'),
            },
            {
              key: 'emailDomains',
              label: 'Domaines mail universitaires',
              type: 'text',
              value: uni.emailDomains.join(', '),
              ...p('emailDomains'),
            },
            {
              key: 'mailDomains',
              label: 'Domaines mail officiels du personnel (droit de réponse)',
              type: 'text',
              value: uni.mailDomains.join(', '),
              ...p('mailDomains'),
            },
          ],
        },
      ],
    };
  }
  return null;
}
