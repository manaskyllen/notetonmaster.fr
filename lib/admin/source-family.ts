/**
 * Source family of a value: the connector key (`univ-sites`, `monmaster-opendata`…). Conflict
 * options written since the admin redesign carry `sourceKey`; older ones only a human label
 * (« Mon Master · données ouvertes, session 2025 (lieu) », « Livret pédagogique 2022-2023 »),
 * mapped here. Conflicts are grouped, and source rules (SourceRule) stored, by family.
 */

export const SOURCE_FAMILY_LABEL: Record<string, string> = {
  'univ-sites': 'Site de l’université',
  'monmaster-opendata': 'Mon Master',
  'monmaster-fiches': 'Fiche Mon Master',
  rncp: 'France Compétences',
  'esr-etablissements': 'Annuaire ESR',
  insersup: 'InserSup',
  manual: 'Saisie manuelle',
};

const PATTERNS: [RegExp, string][] = [
  [/^monmaster\.gouv/i, 'monmaster-fiches'],
  [/^mon ?master/i, 'monmaster-opendata'],
  [/^(site de l|livret|brochure|plaquette|maquette)/i, 'univ-sites'],
  [/^france comp/i, 'rncp'],
  [/^(établissements|annuaire)/i, 'esr-etablissements'],
  [/^insersup/i, 'insersup'],
  [/^(saisi|arbitr)/i, 'manual'],
];

export function sourceFamily(option: {
  source?: string | null;
  sourceKey?: string | null;
}): string {
  if (option.sourceKey) return option.sourceKey;
  const label = (option.source ?? '').trim();
  for (const [re, key] of PATTERNS) if (re.test(label)) return key;
  return `autre:${label.split(/[·,(]/)[0]!.trim().toLowerCase()}`;
}

export function sourceFamilyLabel(key: string): string {
  return (
    SOURCE_FAMILY_LABEL[key] ?? key.replace(/^autre:/, '').replace(/^./, (c) => c.toUpperCase())
  );
}

/** The same mapping in SQL, for a jsonb option `o` (grouping in the database). */
export function sourceFamilySql(o: string): string {
  const label = `trim(coalesce(${o}->>'source', ''))`;
  return `coalesce(${o}->>'sourceKey', CASE
    WHEN ${label} ~* '^monmaster\\.gouv' THEN 'monmaster-fiches'
    WHEN ${label} ~* '^mon ?master' THEN 'monmaster-opendata'
    WHEN ${label} ~* '^(site de l|livret|brochure|plaquette|maquette)' THEN 'univ-sites'
    WHEN ${label} ~* '^france comp' THEN 'rncp'
    WHEN ${label} ~* '^(établissements|annuaire)' THEN 'esr-etablissements'
    WHEN ${label} ~* '^insersup' THEN 'insersup'
    WHEN ${label} ~* '^(saisi|arbitr)' THEN 'manual'
    ELSE 'autre:' || lower(trim(split_part(split_part(split_part(${label}, '·', 1), ',', 1), '(', 1))) END)`;
}

/** In a sentence: « toujours le site de l’université », « toujours Mon Master ». */
export function sourceFamilyPhrase(key: string): string {
  return (
    {
      'univ-sites': 'le site de l’université',
      'monmaster-fiches': 'la fiche Mon Master',
      'esr-etablissements': 'l’annuaire ESR',
      manual: 'la saisie manuelle',
    }[key] ?? sourceFamilyLabel(key)
  );
}
