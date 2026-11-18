/**
 * « D'où viennent les admis » (fiche parcours › Admission): pure computations over the
 * AdmissionStat rows of a program. A program with several Mon Master numbers adds their figures.
 */
import type { AdmissionOriginKind } from '@/lib/db/generated/enums';

/** Under 10 applications, an origin gets no rate (« n.c. »). */
export const RATE_MIN_APPLICATIONS = 10;
/** Under 5 accepted in all, the three figures are shown as numbers, never as percentages. */
export const SHARE_MIN_ACCEPTED = 5;

/**
 * The five groups of the bar, in this order, with colours checked for colour-blind readers.
 * « Autre » and « Non inscrit » are merged into one group.
 */
export const ORIGIN_GROUPS = [
  { id: 'LICENCE', label: 'Licence générale', color: '#5A3BF0', kinds: ['LICENCE'] },
  { id: 'LICENCE_PRO', label: 'Licence pro', color: '#eb6834', kinds: ['LICENCE_PRO'] },
  { id: 'BUT', label: 'BUT', color: '#1baf7a', kinds: ['BUT'] },
  { id: 'MASTER', label: 'Master', color: '#eda100', kinds: ['MASTER'] },
  {
    id: 'OTHER',
    label: 'Autre ou non inscrit',
    color: '#e87ba4',
    kinds: ['OTHER', 'NOT_ENROLLED'],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  color: string;
  kinds: AdmissionOriginKind[];
}[];

export type OriginGroupId = (typeof ORIGIN_GROUPS)[number]['id'];
export type Stage = 'applications' | 'offers' | 'accepted';
export const STAGES: { id: Stage; label: string; word: string }[] = [
  { id: 'applications', label: 'Candidatures', word: 'candidatures' },
  { id: 'offers', label: 'Propositions', word: 'propositions' },
  { id: 'accepted', label: 'Admis', word: 'admis' },
];

export interface OriginCounts {
  origin: AdmissionOriginKind;
  applications: number | null;
  offers: number | null;
  accepted: number | null;
}

export interface StatWithOrigins {
  session: number;
  monMasterEntryId: string | null;
  accepted: number | null;
  acceptedSameInstitution: number | null;
  acceptedSameAcademy: number | null;
  acceptedAtMainPhaseStart: number | null;
  origins: OriginCounts[];
}

export interface GroupCount {
  id: OriginGroupId;
  label: string;
  color: string;
  /** null: the source does not publish this origin for the session (e.g. BUT in 2023). */
  n: number | null;
}

export interface OriginRate {
  id: OriginGroupId;
  label: string;
  color: string;
  applications: number | null;
  offers: number | null;
  /** Offers for 100 applications, rounded; null under RATE_MIN_APPLICATIONS (« n.c. »). */
  rate: number | null;
}

export interface OriginFigure {
  id: 'institution' | 'academy' | 'start';
  n: number;
  /** Share in %, rounded; null under SHARE_MIN_ACCEPTED accepted (numbers only). */
  share: number | null;
}

export interface OriginsSummary {
  session: number;
  entries: number;
  stages: Record<Stage, { total: number | null; groups: GroupCount[] }>;
  rates: OriginRate[];
  acceptedTotal: number | null;
  figures: OriginFigure[];
  percentages: boolean;
}

const sumOrNull = (vals: (number | null | undefined)[]) =>
  vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

/** Share in % of n over total, rounded. */
export const share = (n: number, total: number) => Math.round((n / total) * 100);

/** Offers for 100 applications, or null (« n.c. ») when there are fewer than 10 applications. */
export function ratePer100(applications: number | null, offers: number | null): number | null {
  if (applications == null || offers == null || applications < RATE_MIN_APPLICATIONS) return null;
  return Math.round((offers / applications) * 100);
}

/**
 * Summary of the latest Mon Master session that has origins: the five groups for each stage, the
 * rate per origin and the three figures. Several numbers of one program are added up.
 */
export function summarizeOrigins(stats: StatWithOrigins[]): OriginsSummary | null {
  const withOrigins = stats.filter(
    (s) =>
      s.monMasterEntryId &&
      s.origins.some((o) => o.applications != null || o.offers != null || o.accepted != null),
  );
  if (!withOrigins.length) return null;
  const session = Math.max(...withOrigins.map((s) => s.session));
  const rows = withOrigins.filter((s) => s.session === session);

  const count = (kinds: readonly AdmissionOriginKind[], stage: Stage) =>
    sumOrNull(
      rows.flatMap((r) => r.origins.filter((o) => kinds.includes(o.origin)).map((o) => o[stage])),
    );

  const stages = Object.fromEntries(
    STAGES.map(({ id: stage }) => {
      const groups: GroupCount[] = ORIGIN_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        color: g.color,
        n: count(g.kinds, stage),
      }));
      return [stage, { total: sumOrNull(groups.map((g) => g.n)), groups }];
    }),
  ) as OriginsSummary['stages'];

  const rates: OriginRate[] = ORIGIN_GROUPS.map((g) => {
    const applications = count(g.kinds, 'applications');
    const offers = count(g.kinds, 'offers');
    return {
      id: g.id,
      label: g.label,
      color: g.color,
      applications,
      offers,
      rate: ratePer100(applications, offers),
    };
  });

  const acceptedTotal = sumOrNull(rows.map((r) => r.accepted)) ?? stages.accepted.total;
  const percentages = acceptedTotal != null && acceptedTotal >= SHARE_MIN_ACCEPTED;
  const figures: OriginFigure[] = [];
  const add = (id: OriginFigure['id'], n: number | null) => {
    if (n == null || acceptedTotal == null || !acceptedTotal) return;
    figures.push({ id, n, share: percentages ? share(n, acceptedTotal) : null });
  };
  add('institution', sumOrNull(rows.map((r) => r.acceptedSameInstitution)));
  // « venus d'une autre académie » = 1 − accepted from the academy of the place of study
  const sameAcademy = sumOrNull(rows.map((r) => r.acceptedSameAcademy));
  add('academy', sameAcademy == null || acceptedTotal == null ? null : acceptedTotal - sameAcademy);
  add('start', sumOrNull(rows.map((r) => r.acceptedAtMainPhaseStart)));

  return { session, entries: rows.length, stages, rates, acceptedTotal, figures, percentages };
}

/** Label of a figure, after its number. */
export function figureLabel(id: OriginFigure['id'], university: string): string {
  return id === 'institution'
    ? `déjà inscrits à ${university}`
    : id === 'academy'
      ? 'venus d’une autre académie'
      : 'admis dès l’ouverture de la phase principale';
}
