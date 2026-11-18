/** French number formatting helpers. Missing values are never shown as 0. */

const nf = new Intl.NumberFormat('fr-FR');

export const NC = 'n.c.';

export function formatInt(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? NC : nf.format(n);
}

/** One decimal, French comma: 4.25 -> "4,3". */
export function formatRating(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return NC;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits })} %`;
}

export function formatEuros(n: number | null | undefined): string {
  return n == null ? NC : `${nf.format(n)} €`;
}

const df = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dtf = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

export const formatDate = (d: Date) => df.format(d);
export const formatDateShort = (d: Date) => dfShort.format(d);
export const formatDateTime = (d: Date) => dtf.format(d);

/** "il y a 2 h", "hier", "il y a 3 j" — coarse relative time for lists. */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  return formatDateShort(d);
}

/** "1 avis" / "3 avis", "1 candidature" / "2 candidatures". */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${formatInt(n)} ${n > 1 ? many : one}`;
}
