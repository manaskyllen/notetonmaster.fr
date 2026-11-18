/** Human-readable references: SIG-2026-0142 (report), NOT-2026-0017 (notice), REQ-… (requisition). */
export type RefPrefix = 'SIG' | 'NOT' | 'REQ';

export function formatReference(prefix: RefPrefix, year: number, n: number): string {
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export function parseReference(ref: string): { prefix: RefPrefix; year: number; n: number } | null {
  const m = /^(SIG|NOT|REQ)-(\d{4})-(\d{4,})$/.exec(ref);
  if (!m) return null;
  return { prefix: m[1] as RefPrefix, year: Number(m[2]), n: Number(m[3]) };
}

/** Next reference given the existing references of the same prefix and year. */
export function nextReference(prefix: RefPrefix, year: number, existing: string[]): string {
  const max = existing
    .map(parseReference)
    .filter((r): r is NonNullable<typeof r> => !!r && r.prefix === prefix && r.year === year)
    .reduce((m, r) => Math.max(m, r.n), 0);
  return formatReference(prefix, year, max + 1);
}

/** Short review reference: "avis-" + 6 hex chars. */
export function reviewRef(random: () => number = Math.random): string {
  return `avis-${Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

/** Stable alias for a conversation: "Étudiant·e anonyme #4F2". */
export function conversationAlias(random: () => number = Math.random): string {
  return `Étudiant·e anonyme #${Math.floor(random() * 0xfff)
    .toString(16)
    .toUpperCase()
    .padStart(3, '0')}`;
}
