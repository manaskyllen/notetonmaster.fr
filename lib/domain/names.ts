/**
 * Detects a named person: a civility or title followed by a proper noun.
 * Used before submission (blocking warning) and in moderation.
 */
const TITLES = String.raw`(?:M\.|Mme|Mlle|Madame|Mademoiselle|Monsieur|Pr\.?|Prof\.?|Professeure?|Dr\.?|Docteure?)`;
const PROPER = String.raw`[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+(?:[ -][A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+)?`;
const NAME_RE = new RegExp(String.raw`(?<![\p{L}])${TITLES}\s+${PROPER}`, 'gu');

export interface NameHit {
  found: boolean;
  matches: string[];
}

export function detectNamedPerson(...texts: (string | null | undefined)[]): NameHit {
  const matches: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(NAME_RE)) matches.push(m[0]);
  }
  return { found: matches.length > 0, matches };
}

export function maskNamedPersons(text: string): string {
  return text.replace(NAME_RE, '[nom masqué]');
}
