/**
 * Dates of the admin lists, in Paris time: « aujourd’hui 04:00 », « hier 23:00 », « 12/11 03:12 »,
 * « 12/11/2025 » beyond a year.
 */
const TZ = 'Europe/Paris';
const day = new Intl.DateTimeFormat('fr-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const dmy = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const long = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function parisDay(d: Date): string {
  return day.format(d);
}

/** Days between the Paris calendar days of `d` and `now` (0 = same day). */
export function daysAgo(d: Date, now = new Date()): number {
  return Math.round((Date.parse(parisDay(now)) - Date.parse(parisDay(d))) / 86_400_000);
}

export function formatWhen(input: Date | string, now = new Date(), withTime = true): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const n = daysAgo(d, now);
  const t = withTime ? ` ${hm.format(d)}` : '';
  if (n === 0) return `aujourd’hui${t}`;
  if (n === 1) return `hier${t}`;
  if (n < 300) return `${dm.format(d)}${t}`;
  return dmy.format(d);
}

/** « Aujourd’hui », « Hier », « Mardi 10 novembre »: headings of the audit log days. */
export function dayHeading(d: Date, now = new Date()): string {
  const n = daysAgo(d, now);
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Hier';
  const s = n < 300 ? long.format(d) : dmy.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
