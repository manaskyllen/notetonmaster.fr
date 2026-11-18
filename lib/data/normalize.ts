/**
 * Pure normalisation helpers used to match records between sources.
 * No I/O here: everything is unit-tested in tests/unit/data-normalize.test.ts.
 */

const APOSTROPHES = /[’‘ʼ`´′]/g;
const DASHES = /[‐‑‒–—―−]/g;

/** Lower case, no accents, unified apostrophes and dashes, no punctuation, single spaces, "&" → "et". */
export function normText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Upper case, no spaces nor dashes (RNCP 42684 → RNCP42684, 2500101-02L → 250010102L). */
export function normCode(input: string | null | undefined): string {
  return (input ?? '').toUpperCase().replace(/[\s\-_.]+/g, '');
}

/** Internal Mon Master codes found in program titles: "(PR1138)", "#PR1138". */
const INTERNAL_CODE = /\s*(?:\(\s*PR\d+\s*\)|#\s*PR\d+)\s*/gi;
/** An acronym between brackets: (EPIC), (ACPCI), (MISAC ). */
const ACRONYM = /\(\s*([A-Z][A-Z0-9&-]{1,9})\s*\)/g;
const TITLE_PREFIX = /^(?:(?:master|parcours|mention|m1|m2|m 1|m 2)\b\s*[:-]?\s*)+/;

/** Acronyms of a program title, kept apart as aliases: "Expertise … (EPIC)" → ["EPIC"]. */
export function programAliases(title: string | null | undefined): string[] {
  if (!title) return [];
  const clean = title.replace(INTERNAL_CODE, ' ');
  return [...clean.matchAll(ACRONYM)].map((m) => m[1]!.toUpperCase());
}

/**
 * Program title key: normText, without "master", "parcours", "M1", "M2", "mention" prefixes,
 * without internal codes (PR1138) and bracketed acronyms (kept as aliases).
 */
export function normProgramTitle(title: string | null | undefined): string {
  if (!title) return '';
  const clean = title.replace(INTERNAL_CODE, ' ').replace(ACRONYM, ' ');
  return normText(clean).replace(TITLE_PREFIX, '').trim();
}

/** Mention key: normText without "master", "mention", "(fiche nationale)"; then the alias table. */
export function normMention(
  name: string | null | undefined,
  aliases: Record<string, string> = {},
): string {
  if (!name) return '';
  const key = normText(name.replace(/\(\s*fiche nationale\s*\)/i, ' '))
    .replace(/^(?:(?:master|mention)\b\s*)+/, '')
    .trim();
  return aliases[key] ?? key;
}

/** City name key when no INSEE code is known: CEDEX removed, St/Ste expanded. */
export function normCity(name: string | null | undefined): string {
  const t = normText((name ?? '').replace(/\bcedex\b(\s*\d+)?/gi, ' '));
  return t
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MonMasterPlace {
  label: string;
  commune: string; // as written, CEDEX removed
  department: string | null; // "10", "2A", "971"
}

/**
 * Parses one Mon Master `lieux` entry: "Campus des Comtes de Champagne - TROYES CEDEX 9 (10)".
 * The label may itself contain " - ", so the commune is the part after the last separator.
 */
export function parseMonMasterPlace(raw: string): MonMasterPlace | null {
  const s = raw.trim();
  if (!s) return null;
  const dep = s.match(/\(\s*(\d[0-9AB]?\d?)\s*\)\s*$/i);
  const body = dep ? s.slice(0, dep.index).trim() : s;
  const sep = body.lastIndexOf(' - ');
  const label = sep >= 0 ? body.slice(0, sep).trim() : body;
  const communeRaw = sep >= 0 ? body.slice(sep + 3).trim() : body;
  const commune = communeRaw
    .replace(/\bcedex\b(\s*\d+)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { label, commune, department: dep ? dep[1]!.toUpperCase() : null };
}

/**
 * Splits a Mon Master `lieux` cell: "|" since 2025, "," before. A comma inside a label
 * ("UFR SCIENCES ECONOMIQUES. SOCIALES ET DE GESTION") is not a separator: only a comma that
 * follows a "(département)" is.
 */
export function splitMonMasterPlaces(cell: string | null | undefined): MonMasterPlace[] {
  if (!cell) return [];
  const parts = cell.includes('|')
    ? cell.split('|')
    : cell.split(/(?<=\(\s*\d[0-9AB]?\d?\s*\))\s*,\s*/i);
  return parts.map(parseMonMasterPlace).filter((p): p is MonMasterPlace => !!p);
}

/** pg_trgm-like trigrams of a normalised string (each word padded with two spaces before, one after). */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normText(s).split(' ')) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** Trigram similarity (Jaccard), like pg_trgm `similarity()`: 0 … 1. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Title score: trigram similarity, or 0.9 × containment when one title (at least 3 words) is
 * wholly included in the other ("Histoire de l'art et culture matérielle" within
 * "… - de l'Antiquité à nos jours"). Containment never reaches the automatic link.
 */
export function titleScore(a: string, b: string): number {
  const sim = similarity(a, b);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (normText(short).split(' ').length < 3) return sim;
  const ts = trigrams(short);
  const tl = trigrams(long);
  let inter = 0;
  for (const t of ts) if (tl.has(t)) inter++;
  return Math.max(sim, ts.size ? 0.9 * (inter / ts.size) : 0);
}

/** Number of words that differ between two normalised titles (symmetric difference). */
export function wordDifference(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  let d = 0;
  for (const w of wa) if (!wb.has(w)) d++;
  for (const w of wb) if (!wa.has(w)) d++;
  return d;
}

/** "mediation-culturelle" style slug, safe for URLs. */
export function slugify(s: string, max = 80): string {
  return normText(s).replace(/\s+/g, '-').slice(0, max).replace(/-+$/, '');
}

/** Integer from a source cell; "", "nd", "ns", "n.c." and the like are null (never 0). */
export function toInt(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!/^-?\d+(?:[.,]0+)?$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

/** Decimal from a source cell ("64,1", "64.1"); non-numeric markers are null. */
export function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Number.parseFloat(s);
}
