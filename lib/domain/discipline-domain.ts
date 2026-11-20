/**
 * The four national domains of the master, from the discipline Mon Master gives each formation
 * (`disci_master`). One rule for the whole site: the importer (new mentions), the search index
 * (`domainSlug` of each parcours) and the backfill of `Mention.domainId` all read it from here.
 *
 * The labels seen in the open data (2023 to 2025), with or without dots in the acronyms:
 *   « Droit et sc. politiques » · « Economie, gestion et A.E.S. » / « … et AES »
 *   « Lettres, langues, art » · « S.H.S. » / « SHS » · « M.E.E.F. » / « MEEF »
 *   « Sc. fondamentales et appliquées (dont S.T.A.P.S.) » / « … (dont STAPS) »
 * MEEF (teaching) goes with the humanities, as in the national nomenclature of the site.
 *
 * Before November 2026 the importer did not recognise « S.H.S. » nor « M.E.E.F. »: the mentions
 * created from those rows had no domain, and the home tiles counted 0 mention in « Sciences
 * humaines et sociales » (docs: migration 20261124090000_mention_domains).
 */

export const DOMAIN_SLUGS = [
  'arts-lettres-langues',
  'sciences-humaines-et-sociales',
  'droit-economie-gestion',
  'sciences-technologies-sante',
] as const;
export type DomainSlug = (typeof DOMAIN_SLUGS)[number];

/** « S.H.S. » → « shs », « Sc. fondamentales » → « sc fondamentales », accents removed. */
function plain(disci: string): string {
  return disci
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b([a-z])\./g, '$1') // dotted acronyms: s.h.s. → shs, a.e.s. → aes
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Discipline of Mon Master → domain slug, or null when the label says nothing known. */
export function domainOfDiscipline(disci: string | null | undefined): DomainSlug | null {
  const d = plain(disci ?? '');
  if (!d) return null;
  // Order matters: « Droit et sc. politiques » holds « sc », « Sciences humaines » holds « sciences ».
  if (/^(droit|econ)|\b(droit|economie|gestion|aes)\b/.test(d)) return 'droit-economie-gestion';
  if (/\b(shs|meef)\b|humaines|sociales/.test(d)) return 'sciences-humaines-et-sociales';
  if (/^lettres|\b(lettres|langues|arts?)\b/.test(d)) return 'arts-lettres-langues';
  if (/^sc\b|\bsciences?\b|\bstaps\b|sante|technolog|fondamentales/.test(d))
    return 'sciences-technologies-sante';
  return null;
}

/**
 * The same rule in SQL, on a column holding `disci_master` (search index, backfill). Kept to the
 * shapes of the labels above; `tests/integration/catalog/mention-domains.test.ts` checks that both
 * agree on every one of them.
 */
export function disciplineDomainSql(column: string): string {
  return `CASE
    WHEN ${column} ~* '^(droit|econ)' THEN 'droit-economie-gestion'
    WHEN ${column} ~* '^(s\\.?\\s*h\\.?\\s*s|m\\.?\\s*e\\.?\\s*e\\.?\\s*f)|humaines|sociales' THEN 'sciences-humaines-et-sociales'
    WHEN ${column} ~* '^lettres' THEN 'arts-lettres-langues'
    WHEN ${column} ~* '^sc(\\.|iences)' THEN 'sciences-technologies-sante'
  END`;
}
