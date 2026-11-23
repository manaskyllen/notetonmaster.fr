/**
 * The rules of the robot, in one place: the HTTP client (lib/data/http.ts) applies them and the
 * page /a-propos#notre-robot shows them, so the two cannot disagree. Pure values and helpers (no
 * database, no environment), tested in tests/unit/robot-policy.test.ts.
 */

/** Product token of the User-Agent, and the name to write in robots.txt. */
export const CRAWLER_NAME = 'notetonmasterBot';
export const CRAWLER_VERSION = '1.0';

/** Never less than this between two requests to the same host, whatever the settings say. */
export const MIN_DELAY_FLOOR_SECONDS = 2;
/** Failures in a row (5xx, 429, network) after which a host is left alone… */
export const MAX_FAILURES = 3;
/** …for this long. */
export const HOST_PAUSE_HOURS = 24;
/** robots.txt (and TDMRep) is read again after this long: the delay of an exclusion there. */
export const ROBOTS_CACHE_HOURS = 24;
/** An exclusion asked by mail is applied within this delay (by the team, by hand). */
export const MAIL_EXCLUSION_HOURS = 72;

export const HOUR_MS = 3600_000;

/** The delay between two requests actually applied for the setting `collect.minDelaySeconds`. */
export function effectiveMinDelaySeconds(setting: number): number {
  return Math.max(MIN_DELAY_FLOOR_SECONDS, setting);
}

/** The two lines that exclude a site, as shown on /a-propos#notre-robot. */
export const ROBOTS_EXCLUSION = `User-agent: ${CRAWLER_NAME}\nDisallow: /`;

export type Cadence = 'night' | 'day' | 'week' | 'month';

/**
 * How often a cron expression (5 fields, as in DataSource.schedule) runs: every night (a daily run
 * before 7 am), every day, every week or every month. Null when it cannot tell (several runs a
 * day, months listed…): the page then shows no frequency rather than a wrong one.
 */
export function cronCadence(cron: string | null | undefined): Cadence | null {
  const f = cron?.trim().split(/\s+/);
  if (!f || f.length !== 5) return null;
  const [minute, hour, dom, month, dow] = f as [string, string, string, string, string];
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour) || month !== '*') return null;
  if (dom === '*' && dow === '*') return Number(hour) < 7 ? 'night' : 'day';
  if (dom === '*' && /^\d$/.test(dow)) return 'week';
  if (/^\d+$/.test(dom) && dow === '*') return 'month';
  return null;
}

const CADENCE_ORDER: Cadence[] = ['night', 'day', 'week', 'month'];
const CADENCE_LABEL: Record<Cadence, string> = {
  night: 'chaque nuit',
  day: 'chaque jour',
  week: 'chaque semaine',
  month: 'chaque mois',
};

/**
 * « Chaque semaine », or « Chaque semaine ou chaque mois » for a group of sources read at
 * different rhythms; null when none is known.
 */
export function cadenceLabel(crons: (string | null | undefined)[]): string | null {
  const found = new Set(crons.map(cronCadence).filter((c): c is Cadence => c !== null));
  const list = CADENCE_ORDER.filter((c) => found.has(c)).map((c) => CADENCE_LABEL[c]);
  if (!list.length) return null;
  const text = list.join(' ou ');
  return text[0]!.toUpperCase() + text.slice(1);
}
