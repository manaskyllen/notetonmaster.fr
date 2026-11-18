import 'server-only';
import { prisma } from '@/lib/db';
import type { DataIssueKind, EntityType, IssueSeverity } from '@/lib/db/generated/enums';
import { ISSUE_LABEL, ISSUE_ORDER, OPEN_ISSUE_SQL } from './issues';
import type { Publication } from './fiche-query';
import { formatWhen } from './when';

/** Side panel of a fiche (Fiches): what is to handle, then the fields to review. */
export interface DrawerIssue {
  id: string;
  kind: DataIssueKind;
  severity: IssueSeverity;
  label: string;
  text: string;
  cta: string;
  href: string;
}

export interface DrawerField {
  label: string;
  value: string;
  source: string;
  /** ok · warn (conflict, old) · bad (missing, error) · locked. */
  tone: 'ok' | 'warn' | 'bad' | 'locked';
  review: boolean;
}

export interface FicheDrawerData {
  id: string;
  type: EntityType;
  name: string;
  sub: string;
  ident: string;
  publication: Publication;
  publicHref: string | null;
  editHref: string;
  issues: DrawerIssue[];
  fields: DrawerField[];
  history: { text: string; href: string } | null;
  /** Establishment whose public/private sector is unknown (to check by hand). */
  sectorToCheck: boolean;
}

const show = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return (
    { ONSITE: 'Présentiel', WORK_STUDY: 'Alternance', HYBRID: 'Hybride', REMOTE: 'À distance' }[
      String(v)
    ] ?? String(v)
  );
};

/** Fields tied to a problem: shown first in the panel. */
const ISSUE_FIELDS: Partial<Record<DataIssueKind, string[]>> = {
  NO_PROGRAM: ['semesters', 'programme'],
  OLD_PROGRAM: ['semesters', 'programme'],
  NO_UAI: ['uai'],
};

function issueText(
  kind: DataIssueKind,
  detail: string | null,
  field: string,
  fieldLabel: string | undefined,
  ctx: { id: string; universityId: string | null; universityName: string | null },
): Pick<DrawerIssue, 'text' | 'cta' | 'href'> {
  switch (kind) {
    case 'CONFLICT':
      return {
        text: `${fieldLabel ?? field} : ${detail ?? 'deux sources'} ne donnent pas la même valeur. Choisis la bonne une fois : la règle peut s’appliquer à toutes les fiches concernées.`,
        cta: 'Arbitrer',
        href: `/admin/fiches/${ctx.id}#conflit-${field}`,
      };
    case 'COLLECT_ERROR':
      return {
        text: `La dernière collecte sur le site de l’établissement a échoué${detail ? ` (${detail})` : ''}.`,
        cta: 'Voir la collecte',
        href: '/admin/recuperation?onglet=journal&source=univ-sites',
      };
    case 'NO_PROGRAM':
      return {
        text: 'Aucun programme trouvé sur le site de l’université. Tu peux le saisir, ou attendre une proposition de l’équipe pédagogique.',
        cta: 'Saisir le programme',
        href: `/admin/fiches/${ctx.id}#s-prog`,
      };
    case 'OLD_PROGRAM':
      return {
        text: `Le dernier livret trouvé date de ${detail?.replace(/^Livret /, '') ?? 'plus de deux ans'}. Le site affiche un encadré « le programme a pu évoluer ».`,
        cta: 'Chercher une version récente',
        href: `/admin/recuperation?onglet=etablissements${ctx.universityName ? `&q=${encodeURIComponent(ctx.universityName)}` : ''}`,
      };
    case 'NO_UAI':
      return {
        text: 'L’établissement n’est pas rattaché à l’annuaire (code UAI manquant).',
        cta: 'Rattacher',
        href: `/admin/fiches/${ctx.universityId ?? ctx.id}`,
      };
  }
}

export async function getFicheDrawer(id: string): Promise<FicheDrawerData | null> {
  const [program, mention, university] = await Promise.all([
    prisma.program.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        city: true,
        isPublished: true,
        universityId: true,
        university: { select: { name: true, uai: true } },
        mention: { select: { rncpCode: true } },
        monMasterEntries: { select: { code: true } },
        searchIndex: { select: { programId: true } },
        _count: { select: { semesters: true, reviews: { where: { status: 'PUBLISHED' } } } },
      },
    }),
    prisma.mention.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, rncpCode: true, isPublished: true },
    }),
    prisma.university.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        uai: true,
        cities: true,
        isPublished: true,
        sector: true,
        shortName: true,
      },
    }),
  ]);
  if (!program && !mention && !university) return null;

  const [prov, issues, indexed, courses, last] = await Promise.all([
    prisma.fieldProvenance.findMany({ where: { entityId: id }, orderBy: { position: 'asc' } }),
    // raw-sql: constant OPEN_ISSUE_SQL; the id is the $1 parameter.
    prisma.$queryRawUnsafe<
      {
        id: string;
        kind: DataIssueKind;
        severity: IssueSeverity;
        detail: string | null;
        field: string;
      }[]
    >(
      `SELECT id, kind, severity, detail, field FROM "DataIssue" WHERE "targetId" = $1 AND ${OPEN_ISSUE_SQL}`,
      id,
    ),
    mention
      ? prisma.programSearchIndex.count({ where: { mentionId: id } })
      : university
        ? prisma.programSearchIndex.count({ where: { universityId: id } })
        : Promise.resolve(0),
    program
      ? prisma.programCourse.count({ where: { semester: { programId: id } } })
      : Promise.resolve(0),
    // Last change by hand: newest audit entry of a person on this fiche.
    prisma.auditLog.findFirst({
      where: {
        actorId: { not: null },
        OR: [
          { targetId: id },
          { targetId: null, targetLabel: (program?.title ?? mention?.name ?? university?.name)! },
        ],
      },
      orderBy: { at: 'desc' },
      select: { at: true, actorLabel: true, detail: true, diff: true },
    }),
  ]);

  const type: EntityType = program ? 'PROGRAM' : mention ? 'MENTION' : 'UNIVERSITY';
  const name = program?.title ?? mention?.name ?? university!.name;
  const publication: Publication = program
    ? program.searchIndex
      ? 'pub'
      : program.isPublished
        ? 'off'
        : 'draft'
    : !(mention ?? university)!.isPublished
      ? 'draft'
      : indexed
        ? 'pub'
        : 'off';
  const ident = program
    ? [
        program.monMasterEntries.length
          ? `MM ${program.monMasterEntries.map((e) => e.code).join(' + ')}`
          : 'MM —',
        program.mention.rncpCode,
        program.university.uai ? `UAI ${program.university.uai}` : 'UAI —',
      ]
        .filter(Boolean)
        .join(' · ')
    : mention
      ? (mention.rncpCode ?? 'RNCP —')
      : university!.uai
        ? `UAI ${university!.uai}`
        : 'UAI —';
  const sub = program
    ? `${program.university.name} · ${program.city}`
    : mention
      ? 'Mention nationale'
      : [university!.shortName, university!.cities.join(', ')].filter(Boolean).join(' · ');

  const conflictFields = new Set(issues.filter((i) => i.kind === 'CONFLICT').map((i) => i.field));
  const reviewKeys = new Set(issues.flatMap((i) => ISSUE_FIELDS[i.kind] ?? []));
  const fields: DrawerField[] = prov.map((p) => {
    const review = conflictFields.has(p.field) || reviewKeys.has(p.field) || p.state !== 'OK';
    return {
      label: p.label,
      value: show(p.value),
      source: p.locked ? 'Verrouillé · saisi à la main' : p.source,
      tone: p.locked
        ? 'locked'
        : p.state === 'OK'
          ? 'ok'
          : p.state === 'CONFLICT' || p.state === 'STALE'
            ? 'warn'
            : 'bad',
      review,
    };
  });
  if (program) {
    const has = program._count.semesters > 0;
    const old = issues.some((i) => i.kind === 'OLD_PROGRAM');
    fields.push({
      label: 'Programme',
      value: has ? `${program._count.semesters} semestres · ${courses} cours` : '—',
      source: has
        ? old
          ? (issues.find((i) => i.kind === 'OLD_PROGRAM')?.detail ?? 'Livret ancien')
          : 'Site de l’université'
        : 'Aucun programme trouvé',
      tone: has ? (old ? 'warn' : 'ok') : 'bad',
      review: !has || old,
    });
    fields.push({
      label: 'Avis',
      value: `${program._count.reviews} publié${program._count.reviews > 1 ? 's' : ''}`,
      source: 'notetonmaster',
      tone: 'ok',
      review: false,
    });
  }
  if (university && !university.uai)
    fields.unshift({ label: 'UAI', value: '—', source: 'Annuaire ESR', tone: 'bad', review: true });

  const ctx = {
    id,
    universityId: program?.universityId ?? university?.id ?? null,
    universityName: program?.university.name ?? university?.name ?? null,
  };
  const labelOf = new Map(prov.map((p) => [p.field, p.label]));
  return {
    id,
    type,
    name,
    sub,
    ident,
    publication,
    publicHref:
      publication === 'pub'
        ? program
          ? `/parcours/${program.slug}`
          : mention
            ? `/mentions/${mention.slug}`
            : `/universites/${university!.slug}`
        : null,
    editHref: `/admin/fiches/${id}`,
    issues: issues
      .sort((a, b) => ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind))
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        severity: i.severity,
        label:
          i.kind === 'CONFLICT' && labelOf.get(i.field)
            ? `Conflit · ${labelOf.get(i.field)}`
            : ISSUE_LABEL[i.kind],
        ...issueText(i.kind, i.detail, i.field, labelOf.get(i.field), ctx),
      })),
    fields,
    history: last
      ? {
          text: `Dernière modification à la main ${formatWhen(last.at, new Date(), false).replace(/^(\d)/, 'le $1')} par ${last.actorLabel}${
            Array.isArray(last.diff) && last.diff.length
              ? ` (${(last.diff as { field: string }[])
                  .map((d) => d.field)
                  .slice(0, 3)
                  .join(', ')})`
              : last.detail
                ? ` (${last.detail.slice(0, 80)})`
                : ''
          }`,
          href: `/admin/audit?objet=${id}`,
        }
      : null,
    sectorToCheck: !!university && university.sector == null,
  };
}
