import { counts, DOMAIN_CODES, findUniversity, pct, type Figures } from './figures';

/**
 * Tokens of the guides: `{{ville.parcours}}` in the text becomes a number of the database
 * (content/articles/README.md). An unknown token resolves to null: it blocks the publication,
 * shows in red in the admin preview and never on the site.
 */

export const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_.-]*)\s*\}\}/g;

const nf = new Intl.NumberFormat('fr-FR');

export interface TokenValue {
  /** Shown in the text (« 1 234 », « Nantes »). */
  text: string;
  /** Kept for « À relire »: compared after each sync. */
  raw: string;
}

const num = (n: number): TokenValue => ({ text: nf.format(n), raw: String(n) });

/** Value of a token in a scope, or null when the token is unknown there. */
export function resolveToken(code: string, f: Figures): TokenValue | null {
  const [head, key] = code.split('.') as [string, string | undefined];
  if (head === 'session' && key === undefined)
    return f.session ? { text: String(f.session), raw: String(f.session) } : null;
  if (head === 'site') {
    if (key === 'parcours') return num(f.site.programs);
    if (key === 'villes') return num(f.site.cities);
    return null;
  }
  // A city that is not open has no figures: its tokens have no value (never a false 0).
  if (f.cityClosed && (head === 'domaine' || head === 'etablissement' || head === 'ville'))
    return null;
  if (head === 'domaine') {
    const d = key ? DOMAIN_CODES[key] : undefined;
    if (!d) return null;
    return num(f.rows.filter((r) => r.domain === d.slug).length);
  }
  if (head === 'etablissement') {
    if (!key) return null;
    const u = findUniversity(f, key);
    if (!u) return null;
    return num(f.rows.filter((r) => r.universitySlug === u.slug).length);
  }
  if (head === 'ville') {
    if (!f.city) return null;
    const c = counts(f);
    switch (key) {
      case 'nom':
        return { text: f.city.name, raw: f.city.name };
      case 'parcours':
        return num(c.programs);
      case 'etablissements':
        return num(c.establishments);
      case 'mentions':
        return num(c.mentions);
      case 'tres_selectifs':
        return num(c.veryselective);
      case 'selectifs':
        return num(c.selective);
      case 'accessibles':
        return num(c.accessible);
      case 'pct_tres_selectifs':
        return num(pct(c.veryselective, c.programs));
      case 'pct_accessibles':
        return num(pct(c.accessible, c.programs));
      case 'alternance':
        return num(c.workStudy);
      case 'pct_alternance':
        return num(pct(c.workStudy, c.programs));
      case 'distance':
        return num(c.remote);
      case 'avis':
        return num(f.reviews);
      default:
        return null;
    }
  }
  return null;
}

const CITY_KEYS = [
  'nom',
  'parcours',
  'etablissements',
  'mentions',
  'tres_selectifs',
  'selectifs',
  'accessibles',
  'pct_tres_selectifs',
  'pct_accessibles',
  'alternance',
  'pct_alternance',
  'distance',
  'avis',
];

/**
 * Whether a code is a token of the README, whatever its value: `ville.parcours` is known even in
 * a city that is not open (it then has no value), `ville.inconnu` is not. An establishment is
 * checked against the database by the caller.
 */
export function isKnownToken(code: string): boolean {
  const [head, key, more] = code.split('.');
  if (more !== undefined) return false;
  if (head === 'session') return key === undefined;
  if (head === 'site') return key === 'parcours' || key === 'villes';
  if (head === 'domaine') return !!key && key in DOMAIN_CODES;
  if (head === 'ville') return !!key && CITY_KEYS.includes(key);
  if (head === 'etablissement') return !!key && /^[a-z0-9-]+$/.test(key);
  return false;
}

/** Every token code written in a text, in order of appearance, without repeats. */
export function tokensIn(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[1]!))];
}

/** Values of the tokens quoted in a text (`reviewedValues`): unknown ones left out. */
export function tokenValues(text: string, f: Figures): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of tokensIn(text)) {
    const v = resolveToken(code, f);
    if (v) out[code] = v.raw;
  }
  return out;
}

/**
 * Tokens quoted in the text whose value changed since the last review: the guide goes to
 * « À relire ». A token without a reviewed value (added since) does not count: the next review
 * takes it in.
 */
export function changedTokens(
  text: string,
  reviewed: Record<string, string> | null | undefined,
  f: Figures,
): { code: string; before: string; after: string }[] {
  if (!reviewed) return [];
  const now = tokenValues(text, f);
  return Object.entries(now)
    .filter(([code, v]) => code in reviewed && reviewed[code] !== v)
    .map(([code, after]) => ({ code, before: reviewed[code]!, after }));
}

/** Menu « Chiffre » of the editor: the tokens of a city guide, or of a guide about every city. */
export interface TokenChoice {
  code: string;
  label: string;
}

export function tokenMenu(withCity: boolean, universities: { slug: string; name: string }[]) {
  const city: TokenChoice[] = [
    { code: 'ville.nom', label: 'Nom de la ville' },
    { code: 'ville.parcours', label: 'Parcours de master' },
    { code: 'ville.etablissements', label: 'Établissements publics' },
    { code: 'ville.mentions', label: 'Mentions nationales' },
    { code: 'ville.tres_selectifs', label: 'Très sélectifs (< 10 %)' },
    { code: 'ville.selectifs', label: 'Sélectifs (10 à 30 %)' },
    { code: 'ville.accessibles', label: 'Accessibles (> 30 %)' },
    { code: 'ville.pct_tres_selectifs', label: '% très sélectifs' },
    { code: 'ville.pct_accessibles', label: '% accessibles' },
    { code: 'ville.alternance', label: 'En alternance' },
    { code: 'ville.pct_alternance', label: '% en alternance' },
    { code: 'ville.distance', label: 'Hybrides ou à distance' },
    { code: 'ville.avis', label: 'Avis publiés' },
  ];
  const domains: TokenChoice[] = Object.entries(DOMAIN_CODES).map(([k, d]) => ({
    code: `domaine.${k}`,
    label: `Domaine : ${d.label}`,
  }));
  const site: TokenChoice[] = [
    { code: 'site.parcours', label: 'Parcours sur le site' },
    { code: 'site.villes', label: 'Villes ouvertes' },
    { code: 'session', label: 'Année de la session' },
  ];
  return [
    ...(withCity ? city : []),
    ...domains,
    ...universities.map((u) => ({ code: `etablissement.${u.slug}`, label: u.name })),
    ...site,
  ];
}
