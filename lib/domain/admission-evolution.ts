/**
 * « Comment ce master évolue » (fiche parcours › Admission, feature 2): Mon Master figures per
 * session, followed across number changes, with annotations generated when something changes from
 * one session to the next, and the rating promo by promo. Pure functions.
 */
import { normMention, splitMonMasterPlaces } from '@/lib/data/normalize';

/** A promo gets a rating from 3 published reviews. */
export const PROMO_MIN_REVIEWS = 3;

/** One AdmissionStat row of a Mon Master number, with what its raw source line says. */
export interface EvolutionStat {
  session: number;
  /** MonMasterEntry code (or id): two numbers of one session are added up. */
  entry: string;
  applications: number | null;
  offers: number | null;
  capacity: number | null;
  /** Fields of the raw source line kept in AdmissionStat.raw. */
  raw: { mention?: string; lieux?: string; lieux_formation?: string; alternance?: string } | null;
}

export interface EvolutionPoint {
  session: number;
  applications: number | null;
  offers: number | null;
  /** Offers for 100 applications, one decimal. */
  rate: number | null;
}

export interface Annotation {
  kind: 'place' | 'mention' | 'capacity' | 'workStudy';
  /** « 2025 », « 2023 et 2024 » */
  when: string;
  text: string;
}

const sumOrNull = (vals: (number | null)[]) =>
  vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

/** « VERSAILLES » → « Versailles », « LE MANS » → « Le Mans », « SAINT-DENIS » → « Saint-Denis ». */
export function communeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Sur|Sous|En|Les|La|Le|De|Du|Des|Et|Aux?)\b(?=-)/g, (w) => w.toLowerCase());
}

/** « 2023 », « 2023 et 2024 », « 2022, 2023 et 2024 ». */
export function sessionsLabel(sessions: number[]): string {
  const s = [...sessions].sort((a, b) => a - b).map(String);
  return s.length <= 1 ? (s[0] ?? '') : `${s.slice(0, -1).join(', ')} et ${s.at(-1)}`;
}

interface SessionState {
  session: number;
  entries: Set<string>;
  applications: number | null;
  offers: number | null;
  capacity: number | null;
  cities: string[];
  mentionKey: string | null;
  mentionRaw: string | null;
  workStudy: boolean | null;
}

function bySession(stats: EvolutionStat[]): SessionState[] {
  const groups = Map.groupBy(stats, (s) => s.session);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([session, rows]) => {
      const cities = new Set<string>();
      for (const r of rows)
        for (const p of splitMonMasterPlaces(r.raw?.lieux || r.raw?.lieux_formation))
          cities.add(communeName(p.commune));
      const mention = rows.find((r) => r.raw?.mention)?.raw?.mention ?? null;
      const alt = rows
        .map((r) => r.raw?.alternance)
        .filter((a): a is string => a === '0' || a === '1');
      return {
        session,
        entries: new Set(rows.map((r) => r.entry)),
        applications: sumOrNull(rows.map((r) => r.applications)),
        offers: sumOrNull(rows.map((r) => r.offers)),
        capacity: sumOrNull(rows.map((r) => r.capacity)),
        cities: [...cities].sort((a, b) => a.localeCompare(b, 'fr')),
        mentionKey: mention ? normMention(mention) : null,
        mentionRaw: mention,
        workStudy: alt.length ? alt.includes('1') : null,
      };
    });
}

/** Applications, offers and rate per session. A session without data is absent, never a 0. */
export function evolutionPoints(stats: EvolutionStat[]): EvolutionPoint[] {
  return bySession(stats)
    .filter((s) => s.applications != null || s.offers != null)
    .map((s) => ({
      session: s.session,
      applications: s.applications,
      offers: s.offers,
      rate:
        s.applications && s.offers != null
          ? Math.round((s.offers / s.applications) * 1000) / 10
          : null,
    }));
}

const joinCities = (c: string[]) =>
  c.length <= 1 ? (c[0] ?? '') : `${c.slice(0, -1).join(', ')} et ${c.at(-1)}`;

/**
 * Annotations, from one session to the next (sessions present only):
 * - place: « 2025 : la formation passe de Guyancourt à Versailles »;
 * - mention: « 2023 et 2024 : le parcours dépendait de l'ancienne mention « … » », with « sous un
 *   autre numéro Mon Master » when the number changed too;
 * - capacity: « 2025 : 22 places au lieu de 20 »;
 * - work-study: « 2025 : la formation passe en alternance ».
 * `mentionNames` gives the accented name of a mention from its key (normMention).
 */
export function evolutionAnnotations(
  stats: EvolutionStat[],
  current: { mentionName: string },
  mentionNames: Map<string, string> = new Map(),
): Annotation[] {
  const s = bySession(stats);
  const out: Annotation[] = [];
  const latest = s.at(-1);
  if (!latest) return out;

  // Mention: earlier sessions that depended on another mention than the current one.
  const currentKey = normMention(current.mentionName);
  const older = s.filter((x) => x.mentionKey && x.mentionKey !== currentKey);
  for (const [key, group] of Map.groupBy(older, (x) => x.mentionKey!)) {
    const raw = group[0]!.mentionRaw ?? '';
    const name = mentionNames.get(key) ?? raw.charAt(0) + raw.slice(1).toLowerCase();
    const otherNumber = group.every((g) => ![...g.entries].some((e) => latest.entries.has(e)));
    out.push({
      kind: 'mention',
      when: sessionsLabel(group.map((g) => g.session)),
      text: `le parcours dépendait de l’ancienne mention « ${name} »${otherNumber ? ', sous un autre numéro Mon Master' : ''}.`,
    });
  }

  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    const when = String(b.session);
    if (a.cities.length && b.cities.length && a.cities.join('|') !== b.cities.join('|'))
      out.push({
        kind: 'place',
        when,
        text: `la formation passe de ${joinCities(a.cities)} à ${joinCities(b.cities)}.`,
      });
    if (a.capacity != null && b.capacity != null && a.capacity !== b.capacity)
      out.push({ kind: 'capacity', when, text: `${b.capacity} places au lieu de ${a.capacity}.` });
    if (a.workStudy != null && b.workStudy != null && a.workStudy !== b.workStudy)
      out.push({
        kind: 'workStudy',
        when,
        text: b.workStudy
          ? 'la formation passe en alternance.'
          : 'la formation n’est plus proposée en alternance.',
      });
  }
  return out.sort((x, y) => x.when.localeCompare(y.when));
}

export interface PromoRating {
  year: number;
  avg: number;
  count: number;
}

/** Ratings by cohort year: only the promos with at least 3 published reviews, oldest first. */
export function promoRatings(
  rows: { cohortYear: number; avg: number | null; count: number }[],
): PromoRating[] {
  return rows
    .filter((r) => r.count >= PROMO_MIN_REVIEWS && r.avg != null)
    .map((r) => ({ year: r.cohortYear, avg: r.avg!, count: r.count }))
    .sort((a, b) => a.year - b.year);
}

/**
 * History of a program across number changes: its own rows (every Mon Master number it has had)
 * plus the rows of the same parcours under a predecessor accreditation (« succède à »), for the
 * sessions the program has no figure of its own. Two numbers of one session are kept (added up).
 */
export function historyStats(own: EvolutionStat[], inherited: EvolutionStat[]): EvolutionStat[] {
  const covered = new Set(own.map((s) => s.session));
  return [...own, ...inherited.filter((s) => !covered.has(s.session))].sort(
    (a, b) => a.session - b.session,
  );
}
