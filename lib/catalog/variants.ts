/**
 * Cursus of one parcours (issue #21): several Mon Master numbers of the same parcours, told apart
 * by a site, a cursus or a rhythm. Pure functions, no database: the rules are explicit and on an
 * allow-list, and in doubt nothing is grouped.
 *
 * Two fiches are cursus of one parcours when they share the establishment (UAI), the mention
 * (RNCP code, else the mention key) and the base title, i.e. the title without its variant suffix.
 *
 * Suffixes recognised (case and accents ignored):
 * - after a dash (-, – or —): « cursus X », « site de X », « site X », « campus X », « voie X »;
 * - in parentheses at the end: (alternance), (apprentissage), (formation continue), (à distance),
 *   (FOAD).
 * A dash alone never cuts a title: « Management - Marketing » stays whole.
 *
 * The Mon Master open data often has no suffix at all (the Strasbourg LEA case: three numbers with
 * the very same title, told apart only by their teaching places). The label of such a cursus comes
 * from its own teaching place (placeLabels).
 */
import { normCity, normCode, normText, type MonMasterPlace } from '@/lib/data/normalize';

export type SuffixKind =
  'cursus' | 'site' | 'campus' | 'voie' | 'alternance' | 'apprentissage' | 'continue' | 'distance';

export interface VariantSuffix {
  kind: SuffixKind;
  /** The place or name after the keyword (« Kehl », « de Troyes »), empty for a rhythm. */
  value: string;
  /** The suffix as written, separator included (« - cursus Kehl », « (alternance) »). */
  raw: string;
}

export interface DetectedVariant {
  /** Title without the suffix, as written (case and accents kept). */
  base: string;
  suffix: VariantSuffix | null;
  /** Displayable label of the cursus, null without suffix. */
  label: string | null;
}

/** Dash suffixes: the keyword must follow the last dash, and a name must follow the keyword. */
const DASH_SUFFIX = /^(.*\S)\s*[-–—]\s*(cursus|site\s+de|site|campus|voie)\s+(\S.*?)\s*$/iu;

/** Rhythm suffixes, in parentheses at the very end. */
const PAREN_SUFFIX =
  /^(.*\S)\s*\(\s*(alternance|apprentissage|formation\s+continue|[aà]\s+distance|foad)\s*\)\s*$/iu;

const PAREN_KIND: Record<string, SuffixKind> = {
  alternance: 'alternance',
  apprentissage: 'apprentissage',
  'formation continue': 'continue',
  'a distance': 'distance',
  foad: 'distance',
};

/** Title → base title and cursus label. Never cuts on a dash without one of the keywords. */
export function detectVariantSuffix(title: string): DetectedVariant {
  const t = title.trim();
  const paren = PAREN_SUFFIX.exec(t);
  if (paren) {
    const key = normText(paren[2]!);
    const suffix: VariantSuffix = {
      kind: PAREN_KIND[key] ?? 'distance',
      value: key === 'foad' ? 'FOAD' : '',
      raw: t.slice(paren[1]!.length).trim(),
    };
    return { base: paren[1]!, suffix, label: variantLabel(suffix) };
  }
  const dash = DASH_SUFFIX.exec(t);
  if (dash) {
    const word = normText(dash[2]!);
    const kind: SuffixKind = word.startsWith('site')
      ? 'site'
      : word === 'campus'
        ? 'campus'
        : word === 'voie'
          ? 'voie'
          : 'cursus';
    const value = (word.endsWith(' de') ? 'de ' : '') + dash[3]!;
    const suffix: VariantSuffix = { kind, value, raw: t.slice(dash[1]!.length).trim() };
    return { base: dash[1]!, suffix, label: variantLabel(suffix) };
  }
  return { base: t, suffix: null, label: null };
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);

/** « kehl » → « Kehl », « STRASBOURG » → « Strasbourg », « saint-dié » → « Saint-Dié ». */
export function placeName(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toLocaleUpperCase('fr') && t !== t.toLocaleLowerCase('fr')) return cap(t);
  return t
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase('fr'))
    .replace(/(?<=[\s-])(De|Du|Des|La|Le|Les|Sur|En|Et)(?=[\s-])/g, (w) => w.toLowerCase());
}

/** Displayable label of a cursus (« Kehl », « En alternance », « Site de Troyes »). */
export function variantLabel(suffix: VariantSuffix | null | undefined): string {
  if (!suffix) return 'Cursus principal';
  switch (suffix.kind) {
    case 'cursus':
      return cap(suffix.value);
    case 'site':
      return `Site ${suffix.value.replace(/^de\s+/i, 'de ')}`;
    case 'campus':
      return `Campus ${suffix.value}`;
    case 'voie':
      return `Voie ${suffix.value}`;
    case 'alternance':
      return 'En alternance';
    case 'apprentissage':
      return 'En apprentissage';
    case 'continue':
      return 'Formation continue';
    case 'distance':
      return suffix.value === 'FOAD' ? 'À distance (FOAD)' : 'À distance';
  }
}

/** Base title key: accents, case, punctuation and repeated spaces ignored. */
export function baseTitleKey(title: string): string {
  return normText(detectVariantSuffix(title).base);
}

export interface GroupableFiche {
  /** UAI of the establishment. */
  uai: string;
  /** RNCP code of the mention; when absent, any stable key of the mention (id, normalised name). */
  mention: string;
  title: string;
}

/** UAI + mention + base title: two fiches with the same key are cursus of one parcours. */
export function groupKey(f: GroupableFiche): string {
  return [normCode(f.uai), normCode(f.mention), baseTitleKey(f.title)].join('|');
}

export interface PlacedFiche {
  /** Any id, returned as the key of the result. */
  id: string;
  /** Teaching places, the generic establishment entry already removed (specificPlaces). */
  places: MonMasterPlace[];
  workStudy: boolean;
}

/**
 * Labels of the cursus of one group when their titles carry no suffix: what tells them apart is
 * their teaching place (Kehl, Passau) or their rhythm. Each fiche gets the communes no other fiche
 * of the group has; a fiche with none of its own gets the common commune (Strasbourg). When places
 * do not tell them apart, the work-study one is « En alternance ». Null when nothing does: such a
 * group is ambiguous and stays as « Cursus principal » for a human to name.
 */
export function placeLabels(fiches: PlacedFiche[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const communes = fiches.map((f) => {
    const m = new Map<string, string>();
    for (const p of f.places) {
      const k = normCity(p.commune);
      if (k && !m.has(k)) m.set(k, placeName(p.commune));
    }
    return m;
  });
  const count = new Map<string, number>();
  for (const m of communes) for (const k of m.keys()) count.set(k, (count.get(k) ?? 0) + 1);
  fiches.forEach((f, i) => {
    const own = [...communes[i]!].filter(([k]) => count.get(k)! < fiches.length);
    const common = [...communes[i]!].filter(([k]) => count.get(k) === fiches.length);
    out.set(
      f.id,
      own.length ? own.map(([, v]) => v).join(' et ') : common.length === 1 ? common[0]![1] : null,
    );
  });
  // Places alone do not tell them apart (same label twice): fall back on the rhythm.
  const labels = [...out.values()];
  const clash = labels.some((l, i) => l === null || labels.indexOf(l) !== i);
  if (clash) {
    const rhythms = new Set(fiches.map((f) => f.workStudy));
    for (const f of fiches)
      out.set(f.id, rhythms.size > 1 ? (f.workStudy ? 'En alternance' : 'Cursus principal') : null);
    const again = [...out.values()];
    if (again.some((l, i) => l === null || again.indexOf(l) !== i))
      for (const f of fiches) out.set(f.id, null);
  }
  return out;
}
