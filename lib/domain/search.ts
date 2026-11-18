/** Search normalisation: lower case, accents removed (NFD), split into words. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ');
}

export function tokenize(q: string): string[] {
  return normalize(q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Every query word must be found somewhere in the haystack fields. */
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const hay = normalize(fields.filter(Boolean).join(' '));
  return tokens.every((t) => hay.includes(t));
}

/** Simple relevance: title matches first, then the number of matched fields. */
export function scoreMatch(
  title: string,
  fields: (string | null | undefined)[],
  query: string,
): number {
  const tokens = tokenize(query);
  const t = normalize(title);
  let score = 0;
  for (const tok of tokens) {
    if (t.startsWith(tok)) score += 3;
    else if (t.includes(tok)) score += 2;
    else if (fields.some((f) => f && normalize(f).includes(tok))) score += 1;
  }
  return score;
}

// ───────────── Identifiers ─────────────

export type IdentifierKindName =
  | 'RNCP'
  | 'RNCP_PREVIOUS'
  | 'MONMASTER'
  | 'MM_MENTION'
  | 'MM_PARCOURS'
  | 'UAI'
  | 'SISE'
  | 'PAYSAGE'
  | 'ONISEP'
  | 'CFD'
  | 'OTHER';

/** Short name of an identifier kind, as in « Trouvé par RNCP · RNCP42684 ». */
export const IDENTIFIER_LABEL: Record<IdentifierKindName, string> = {
  RNCP: 'RNCP',
  RNCP_PREVIOUS: 'RNCP (ancienne)',
  MONMASTER: 'Mon Master',
  MM_MENTION: 'Mon Master (mention)',
  MM_PARCOURS: 'Mon Master (parcours)',
  UAI: 'UAI',
  SISE: 'SISE',
  PAYSAGE: 'Paysage',
  ONISEP: 'Onisep',
  CFD: 'CFD',
  OTHER: 'Code',
};

/** How a result was found: by its text, or by one of its identifiers. */
export type MatchedBy =
  { kind: 'TEXT' } | { kind: IdentifierKindName; value: string; label: string };

export interface IdentifierRef {
  kind: IdentifierKindName;
  value: string;
  label: string;
}

/** "Trouvé par …" text: "RNCP · RNCP42684". Null when found by text. */
export function matchedByText(m: MatchedBy | null | undefined): string | null {
  return m && m.kind !== 'TEXT' ? `${m.label} · ${m.value}` : null;
}

/** Stored form of a code: upper case, no accent, no space, dash or dot ("rncp 42684" → "RNCP42684"). */
export function normalizeCode(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * A word that may be a code: RNCP number, UAI (7 digits + letter), Mon Master number
 * (7 digits + 5 characters), any mix of letters and digits of 5+ characters, or 5+ digits
 * (a bare RNCP number, or the start of a Mon Master number).
 */
export function looksLikeCode(code: string): boolean {
  return (
    isStructuredCode(code) ||
    /^\d{5,}$/.test(code) ||
    (code.length >= 5 && /[A-Z]/.test(code) && /\d/.test(code))
  );
}

/** RNCP number, UAI or Mon Master number: the only shapes a pair of words can form. */
export function isStructuredCode(code: string): boolean {
  return /^RNCP\d+$/.test(code) || /^\d{7}[A-Z]$/.test(code) || /^\d{7}[A-Z0-9]{5}$/.test(code);
}

export interface CodeCandidate {
  code: string;
  /** Indexes of the query words it is made of. */
  words: number[];
}

/** Query words, split on spaces only (codes keep their dashes and dots until normalised). */
export function queryWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Codes typed in a query. A word followed by another can form one code ("rncp 42684",
 * "2500101 kdkqn") when together they have the shape of an RNCP, UAI or Mon Master number.
 */
export function codeCandidates(query: string): CodeCandidate[] {
  const words = queryWords(query).map(normalizeCode);
  const out: CodeCandidate[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = words[i + 1];
    if (next !== undefined && w && next && isStructuredCode(w + next) && !isStructuredCode(w)) {
      out.push({ code: w + next, words: [i, i + 1] });
      i++;
    } else if (w && looksLikeCode(w)) {
      out.push({ code: w, words: [i] });
    }
  }
  return out;
}

/** Stored values a typed code may stand for: "42684" is also "RNCP42684". */
export function codeVariants(code: string): string[] {
  return /^\d+$/.test(code) ? [code, `RNCP${code}`] : [code];
}

/** Exact or prefix match of a typed code against a stored identifier value. */
export function matchCode(code: string, value: string): 'exact' | 'prefix' | null {
  const variants = codeVariants(code);
  if (variants.includes(value)) return 'exact';
  if (variants.some((v) => value.startsWith(v))) return 'prefix';
  return null;
}

/**
 * Local filter of an already loaded list (university page, admin tables): same rules as the
 * server search, without typo tolerance. Codes typed in the query must match one of the
 * entity's identifiers; every other word must be found in its text.
 */
export function matchLocal(
  fields: (string | null | undefined)[],
  codes: IdentifierRef[],
  query: string,
): MatchedBy | null {
  const words = queryWords(query);
  if (words.length === 0) return { kind: 'TEXT' };
  let found: MatchedBy | null = null;
  const consumed = new Set<number>();
  for (const c of codeCandidates(query)) {
    const hit = codes.find((id) => matchCode(c.code, id.value));
    if (!hit) continue;
    c.words.forEach((i) => consumed.add(i));
    found ??= { kind: hit.kind, value: hit.value, label: hit.label };
  }
  const rest = words.filter((_, i) => !consumed.has(i)).join(' ');
  if (rest && !matchesQuery(fields, rest)) return null;
  return found ?? { kind: 'TEXT' };
}

// ───────────── Ranking ─────────────

export type SearchType = 'program' | 'mention' | 'university' | 'city';
export const SEARCH_TYPES: SearchType[] = ['program', 'mention', 'university', 'city'];

/** Programs before mentions before universities (before cities) at equal score. */
export const TYPE_ORDER: Record<SearchType, number> = {
  program: 0,
  mention: 1,
  university: 2,
  city: 3,
};

/**
 * Score of a result: exact identifier > identifier prefix > exact title > title prefix >
 * full-text rank > trigram similarity.
 */
export function rankScore(r: {
  identifier?: 'exact' | 'prefix' | null;
  title: string;
  query: string;
  tsRank?: number;
  similarity?: number;
}): number {
  const t = normalize(r.title).trim();
  const q = normalize(r.query).trim().replace(/\s+/g, ' ');
  let s = 0;
  if (r.identifier === 'exact') s = 1000;
  else if (r.identifier === 'prefix') s = 900;
  else if (q && t === q) s = 800;
  else if (q && t.startsWith(q)) s = 700;
  return s + Math.min(1, r.tsRank ?? 0) * 100 + Math.min(1, r.similarity ?? 0) * 50;
}

/** Slug of a city name, same rule as the search_document view ("Gif-sur-Yvette" → "gif-sur-yvette"). */
export function citySlug(name: string): string {
  return normalize(name).replace(/[^a-z0-9]+/g, '-');
}
