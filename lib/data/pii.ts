/**
 * Personal data filter applied to anything extracted from a university page before it is stored:
 * e-mail addresses, phone numbers and "Responsable : Prénom Nom" lines are removed. Only roles
 * are kept.
 */

const EMAIL =
  /[\w.+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\s+arobase\s+)\s*[\w-]+(?:\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\))\s*[\w-]+)+/gi;
/** French numbers: 02 61 91 10 10, 02.61.91.10.10, +33 (0)2 61 91 10 10, 0261911010. */
const PHONE = /(?:(?:\+|00)\s*33\s*(?:\(\s*0\s*\))?\s*|\b0)[1-9](?:[\s.\-/]*\d{2}){4}\b/g;
const PHONE_LABEL = /\b(?:t[ée]l(?:[ée]phone)?|fax|portable|mobile)\s*\.?\s*:?\s*$/i;

/** Roles worth keeping (the person behind them is removed). */
const ROLE =
  /\b(responsables?|co-?responsables?|directeur|directrice|direction|coordinat(?:eur|rice)s?|secr[ée]tariat|gestionnaires?|contacts?|r[ée]f[ée]rent(?:e|s)?|charg[ée]e?s? de (?:scolarit[ée]|mission|formation))\b[^:\n]{0,60}\s*:/i;

export interface ScrubResult {
  text: string;
  removed: number;
}

/**
 * Removes personal data from a text. A line "Responsable du parcours : Marie Dupont" becomes
 * "Responsable du parcours" (role only); e-mails and phones anywhere are dropped.
 */
export function scrubPii(input: string): ScrubResult {
  let removed = 0;
  const lines = input.split(/\r?\n/).map((line) => {
    let l = line.replace(EMAIL, () => {
      removed++;
      return '';
    });
    l = l.replace(PHONE, () => {
      removed++;
      return '';
    });
    const role = l.match(ROLE);
    if (role) {
      const after = l.slice((role.index ?? 0) + role[0].length).trim();
      if (after && looksLikePersonNames(after)) {
        removed++;
        l = l.slice(0, (role.index ?? 0) + role[0].length - 1).trimEnd();
      }
    }
    return l
      .replace(PHONE_LABEL, '')
      .replace(/\s{2,}/g, ' ')
      .trimEnd();
  });
  return {
    text: lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    removed,
  };
}

const NAME_WORD =
  /^(?:(?:M\.|Mme|Mr|Dr|Pr)\.?|[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’]+(?:-[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’]+)*|[A-ZÀ-ÖØ-Þ]{2,}(?:-[A-ZÀ-ÖØ-Þ]{2,})?|[A-Z]\.)$/;
const CONNECTORS = new Set(['et', 'ou', '/', '&', ',', '-', 'de', 'du', 'des', 'le', 'la']);

/** "Marie Dupont", "M. DUPONT", "Jean-Luc MARTIN et Anne Durand" → true; "dossier et entretien" → false. */
export function looksLikePersonNames(s: string): boolean {
  const words = s
    .replace(/[(),;]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !CONNECTORS.has(w.toLowerCase()));
  if (!words.length || words.length > 12) return false;
  const named = words.filter((w) => NAME_WORD.test(w)).length;
  return named >= 2 && named / words.length >= 0.75;
}

/** A short evidence extract: scrubbed, single-spaced, at most 300 characters. */
export function evidenceExtract(text: string, max = 300): string {
  const t = scrubPii(text).text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
