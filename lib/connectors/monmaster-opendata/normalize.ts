/**
 * Mon Master open data: one row = one formation (`ifc`) in one session. Pure functions.
 * Two schemas: `fr-esr-mon_master` (sessions 2024, 2025: phases PP/PC) and
 * `fr-esr-mon_master_2023` (no phases, `rang_dernier`, `lieux_formation`).
 */
import {
  normCode,
  normMention,
  normProgramTitle,
  programAliases,
  splitMonMasterPlaces,
  toInt,
  type MonMasterPlace,
} from '@/lib/data/normalize';

export interface MMStats {
  capacity: number | null;
  applications: number | null; // main phase (2024+) or all (2023)
  applicationsPp: number | null;
  applicationsPc: number | null;
  ranked: number | null;
  offers: number | null;
  accepted: number | null;
  rankPp: number | null;
  rankPc: number | null;
  participatedPp: boolean | null;
  participatedPc: boolean | null;
  offPlatformRecruits: number | null;
  /** Diploma prepared the year of the application (« D'où viennent les admis »). */
  origins: MMOrigin[];
  acceptedSameInstitution: number | null;
  acceptedSameAcademy: number | null;
  acceptedAtMainPhaseStart: number | null;
}

export const ORIGIN_KINDS = [
  'LICENCE',
  'LICENCE_PRO',
  'BUT',
  'MASTER',
  'OTHER',
  'NOT_ENROLLED',
] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

/** One origin of one row. A null count means the column is absent from the source: never 0. */
export interface MMOrigin {
  origin: OriginKind;
  applications: number | null;
  offers: number | null;
  accepted: number | null;
}

/** Column infix of each origin (methodology 2025, lower case in the real files). */
const ORIGIN_COLUMN: Record<OriginKind, string> = {
  LICENCE: 'lg3',
  LICENCE_PRO: 'lp3',
  BUT: 'but3',
  MASTER: 'master',
  OTHER: 'autre',
  NOT_ENROLLED: 'noninscri',
};

/** Sum that stays null when every part is absent (an absent column is not a 0). */
const sumOrNull = (...vals: (number | null)[]) =>
  vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

/**
 * Origins of the applicants of one row, checked against fixtures/schemas/monmaster-opendata.json:
 * - 2024+ (`fr-esr-mon_master`): `n_can_<o>_pp` + `n_can_<o>_pc`, `n_prop_<o>_total`, `n_accept_<o>_total`;
 * - 2023 (`fr-esr-mon_master_2023`): `n_can_<o>`, `n_prop_<o>`, `n_accept_<o>`, no BUT (null).
 * A column missing from the file gives null (toInt of undefined), never 0.
 */
export function originsOf(r: Record<string, string>, dataset: 'main' | '2023'): MMOrigin[] {
  return ORIGIN_KINDS.map((origin) => {
    const c = ORIGIN_COLUMN[origin];
    return dataset === '2023'
      ? {
          origin,
          applications: toInt(r[`n_can_${c}`]),
          offers: toInt(r[`n_prop_${c}`]),
          accepted: toInt(r[`n_accept_${c}`]),
        }
      : {
          origin,
          applications: sumOrNull(toInt(r[`n_can_${c}_pp`]), toInt(r[`n_can_${c}_pc`])),
          offers: toInt(r[`n_prop_${c}_total`]),
          accepted: toInt(r[`n_accept_${c}_total`]),
        };
  });
}

/** The three « D'où viennent les admis » counts. 2023 names the academy column `n_accept_acad`. */
export function acceptedDetails(r: Record<string, string>, dataset: 'main' | '2023') {
  return {
    acceptedSameInstitution: toInt(r.n_accept_etab),
    acceptedSameAcademy: toInt(dataset === '2023' ? r.n_accept_acad : r.n_accept_lieu_acad),
    acceptedAtMainPhaseStart: toInt(r.n_accept_debut_pp),
  };
}

/** Columns the origins and the three counts read: kept in staging (KEEP of the connector). */
export const ORIGIN_SOURCE_COLUMNS = [
  ...Object.values(ORIGIN_COLUMN).flatMap((c) => [
    `n_can_${c}`,
    `n_can_${c}_pp`,
    `n_can_${c}_pc`,
    `n_prop_${c}`,
    `n_prop_${c}_total`,
    `n_accept_${c}`,
    `n_accept_${c}_total`,
  ]),
  'n_accept_etab',
  'n_accept_lieu_acad',
  'n_accept_acad',
  'n_accept_debut_pp',
];

export interface MMRecord {
  session: number;
  ifc: string;
  inm: string;
  inmp: string | null;
  uai: string;
  etaName: string;
  paysage: string | null;
  mention: string; // as published (upper case, no accents)
  mentionKey: string;
  title: string; // display title, internal codes removed
  titleKey: string;
  aliases: string[];
  workStudy: boolean;
  modes: string[];
  places: MonMasterPlace[];
  placesRaw: string;
  discipline: string;
  domainSlug: string | null;
  stats: MMStats;
}

const b = (v: string | undefined) => (v === '1' ? true : v === '0' ? false : null);

/** "M1 Evénementiel, Médiation des Arts et des Sciences (PR1139)" → "Evénementiel, Médiation des Arts et des Sciences". */
export function displayTitle(parcours: string | null | undefined, mention: string): string {
  const t = (parcours ?? '')
    .replace(/\s*(?:\(\s*PR\d+\s*\)|#\s*PR\d+)\s*/gi, ' ')
    .replace(/^\s*M\s?1\s*[-:]?\s+/i, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
  return t || prettyMention(mention);
}

/** "CULTURE, PATRIMOINE ET MEDIATION" → "Culture, patrimoine et mediation" (RNCP gives the accents later). */
export function prettyMention(m: string): string {
  const s = m.trim().toLowerCase().replace(/\s+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Discipline → one of the 4 domains of the site. */
export function domainOf(disci: string): string | null {
  const d = disci.toLowerCase();
  if (/\bshs\b|humaines|sociales/.test(d)) return 'sciences-humaines-et-sociales';
  if (/lettres|langues|\barts?\b/.test(d)) return 'arts-lettres-langues';
  if (/droit|econom|gestion|politique|\baes\b/.test(d)) return 'droit-economie-gestion';
  if (/sc\.|science|sant|staps|technolog|fondamentales/.test(d))
    return 'sciences-technologies-sante';
  return null;
}

export function normalizeRow(r: Record<string, string>, dataset: 'main' | '2023'): MMRecord {
  const mention = r.mention?.trim() ?? '';
  const parcours = r.parcours?.trim() || null;
  const title = displayTitle(parcours, mention);
  const placesRaw = (dataset === '2023' ? r.lieux_formation : r.lieux) ?? '';
  const disci = r.disci_master || r.disci_lib || r.discipline || '';
  const stats: MMStats =
    dataset === '2023'
      ? {
          capacity: toInt(r.col),
          applications: toInt(r.n_can),
          applicationsPp: toInt(r.n_can),
          applicationsPc: null,
          ranked: toInt(r.n_clas),
          offers: toInt(r.n_prop),
          accepted: toInt(r.n_accept),
          rankPp: toInt(r.rang_dernier),
          rankPc: null,
          participatedPp: true,
          participatedPc: null,
          offPlatformRecruits: toInt(r.n_recrut_comp),
          origins: originsOf(r, dataset),
          ...acceptedDetails(r, dataset),
        }
      : {
          capacity: toInt(r.col),
          applications: toInt(r.n_can_pp),
          applicationsPp: toInt(r.n_can_pp),
          applicationsPc: toInt(r.n_can_pc),
          ranked: toInt(r.n_clas_total),
          offers: toInt(r.n_prop_total),
          accepted: toInt(r.n_accept_total),
          rankPp: toInt(r.rang_dernier_appele_pp),
          rankPc: toInt(r.rang_dernier_appele_pc),
          participatedPp: b(r.pp),
          participatedPc: b(r.pc),
          offPlatformRecruits: toInt(r.n_recrut_comp),
          origins: originsOf(r, dataset),
          ...acceptedDetails(r, dataset),
        };
  return {
    session: toInt(r.session) ?? 0,
    ifc: normCode(r.ifc),
    inm: normCode(r.inm),
    inmp: r.inmp?.trim() || null,
    uai: normCode(r.eta_uai),
    etaName: r.eta_nom?.trim() ?? '',
    paysage: r.id_paysage_actuel?.trim() || r.id_paysage?.trim() || null,
    mention,
    mentionKey: normMention(mention),
    title,
    titleKey: normProgramTitle(title),
    aliases: programAliases(parcours),
    workStudy: r.alternance === '1',
    modes: (r.modalite_enseignement ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    places: splitMonMasterPlaces(placesRaw),
    placesRaw,
    discipline: disci,
    domainSlug: domainOf(disci),
    stats,
  };
}

/**
 * Displayed rank (decision 2): the complementary phase rank when the formation
 * took part in it and the rank is published, else the main phase rank. Never for work-study
 * (offers depend on a signed contract): null, shown "n.c." with an explanation.
 */
export function displayedRank(
  s: MMStats,
  workStudy: boolean,
): { rank: number | null; phase: 'PP' | 'PC' | null; reason?: string } {
  if (workStudy) return { rank: null, phase: null, reason: 'alternance' };
  if (s.participatedPc && s.rankPc != null) return { rank: s.rankPc, phase: 'PC' };
  if (s.rankPp != null) return { rank: s.rankPp, phase: 'PP' };
  return { rank: null, phase: null, reason: 'non publié' };
}

export const RANK_PHASE_LABEL = {
  PP: 'rang phase principale',
  PC: 'rang phase complémentaire',
} as const;

/** Out-of-bounds values: the row is set aside and listed in an alert (§8). */
export function outOfBounds(r: MMRecord): string | null {
  const s = r.stats;
  if (s.capacity != null && (s.capacity < 1 || s.capacity > 2000))
    return `places hors bornes (${s.capacity})`;
  const apps = (s.applicationsPp ?? 0) + (s.applicationsPc ?? 0);
  if (s.offers != null && apps && s.offers > apps)
    return `propositions (${s.offers}) supérieures aux candidatures (${apps})`;
  if ((s.rankPp ?? 0) < 0 || (s.rankPc ?? 0) < 0) return 'rang négatif';
  if (!r.ifc || !r.uai || !r.inm) return 'identifiant manquant (ifc, inm ou UAI)';
  return null;
}

/** MEEF masters (teaching): never a recommended merge (decision B). */
export function isMeef(r: Pick<MMRecord, 'mention' | 'discipline'>): boolean {
  return /\bMEEF\b/i.test(r.discipline) || /m[ée]tiers de l.?enseignement/i.test(r.mention);
}

/**
 * Every bounds check of a row (§8), for the « contrôles exécutés » counts: name → failure or null.
 * A row with at least one failure is set aside.
 */
export function boundsChecks(r: MMRecord): Record<string, string | null> {
  const s = r.stats;
  const apps = (s.applicationsPp ?? 0) + (s.applicationsPc ?? 0);
  return {
    'Places entre 1 et 2 000':
      s.capacity != null && (s.capacity < 1 || s.capacity > 2000)
        ? `places hors bornes (${s.capacity})`
        : null,
    'Propositions ≤ candidatures':
      s.offers != null && apps && s.offers > apps
        ? `propositions (${s.offers}) supérieures aux candidatures (${apps})`
        : null,
    'Acceptations ≤ propositions':
      s.accepted != null && s.offers != null && s.accepted > s.offers
        ? `acceptations (${s.accepted}) supérieures aux propositions (${s.offers})`
        : null,
    'Rang positif': (s.rankPp ?? 0) < 0 || (s.rankPc ?? 0) < 0 ? 'rang négatif' : null,
    'Identifiants présents (ifc, inm, UAI)':
      !r.ifc || !r.uai || !r.inm ? 'identifiant manquant (ifc, inm ou UAI)' : null,
  };
}

/**
 * Minimal typographic clean-up of a new title (decision C): extra spaces, space before « ) » and
 * after « ( », typographic apostrophes and quotes, trailing space. Never the case, never accents.
 */
export function cleanTitle(t: string): string {
  return t
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(\p{L})'(\p{L})/gu, '$1’$2')
    .replace(/"([^"]+)"/g, '« $1 »')
    .trim();
}

/** Places that describe the formation itself: the generic "<University> - CITY" entry is dropped when others exist. */
export function specificPlaces(r: Pick<MMRecord, 'places' | 'etaName'>): MonMasterPlace[] {
  const generic = (p: MonMasterPlace) => normProgramTitle(p.label) === normProgramTitle(r.etaName);
  const rest = r.places.filter((p) => !generic(p));
  return rest.length ? rest : r.places;
}

/** A place label that names a teaching component (UFR, faculty, institute…), not a campus. */
export function looksLikeComponent(label: string): boolean {
  return /\b(UFR|U\.F\.R|Facult[ée]|Institut|IAE|IUT|[ÉE]cole|D[ée]partement|P[ôo]le|INSPE|Insp[ée]|Graduate School|Sciences Po|Polytech)\b/i.test(
    label,
  );
}

/** Summary of the admission figures of one session, for the difference report. */
export function statsSummary(s: MMStats, rank: number | null): string {
  const f = (v: number | null) => (v == null ? 'n.c.' : String(v));
  return `${f(s.capacity)} places · ${f(s.applications)} cand. · ${f(s.offers)} prop. · ${f(s.accepted)} acc. · rang ${f(rank)}`;
}
