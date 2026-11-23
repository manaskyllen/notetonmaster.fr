/**
 * Cursus of one parcours (issue #21): several Mon Master numbers of the same parcours, told apart
 * by a site, a cursus or a rhythm. Pure functions, no database: the rules are explicit and on an
 * allow-list.
 *
 * Two fiches are cursus of one parcours when they share the establishment (UAI), the mention
 * (RNCP code, else the mention key) and the base title, i.e. the title without its variant suffix:
 * - a group formed by a suffix (« - Site Evry », « (FOAD) ») is grouped even when the Mon Master
 *   parcours codes (inmp) differ: sites or rhythms of one parcours;
 * - identical titles without a suffix are grouped only when their inmp is the same, or missing:
 *   two different inmp are two parcours for Mon Master (Sorbonne « Lettres » of the INSPE).
 *
 * Suffixes recognised (case and accents ignored):
 * - after a dash (-, – or —): « cursus X », « site de X », « site X », « campus X », « voie X »,
 *   « en alternance », « en apprentissage », « formation par apprentissage », « formation initiale »;
 * - in parentheses at the end: (alternance), (apprentissage), (apprentissage et contrat pro),
 *   (formation continue), (à distance), (FOAD).
 * A dash alone never cuts a title: « Management - Marketing » stays whole.
 *
 * The Mon Master open data often has no suffix at all (the Strasbourg LEA case: three numbers with
 * the very same title, told apart only by their teaching places): labelCursus then names each
 * cursus by its rhythm, its own teaching place, or the city of its former fiche.
 */
import { normCity, normCode, normText, type MonMasterPlace } from '@/lib/data/normalize';

export type SuffixKind =
  | 'cursus'
  | 'site'
  | 'campus'
  | 'voie'
  | 'alternance'
  | 'apprentissage'
  | 'initiale'
  | 'continue'
  | 'distance';

/** Suffixes that name a rhythm (they may follow one another: « - En alternance (apprentissage) »). */
const RHYTHM: ReadonlySet<SuffixKind> = new Set(['alternance', 'apprentissage', 'initiale']);

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

/** Dash suffixes naming a place: the keyword must follow the last dash, then a name. */
const DASH_PLACE = /^(.*\S)\s*[-–—]\s*(cursus|site\s+de|site|campus|voie)\s+(\S.*?)\s*$/iu;

/** Dash suffixes naming a rhythm, alone after the last dash. */
const DASH_RHYTHM =
  /^(.*\S)\s*[-–—]\s*(en\s+alternance|en\s+apprentissage|formation\s+par\s+apprentissage|formation\s+initiale)\s*$/iu;

/** Rhythm suffixes, in parentheses at the very end. */
const PAREN_SUFFIX =
  /^(.*\S)\s*\(\s*(alternance|apprentissage|apprentissage\s+et\s+contrat\s+pro|formation\s+continue|[aà]\s+distance|foad)\s*\)\s*$/iu;

const KIND_OF: Record<string, SuffixKind> = {
  alternance: 'alternance',
  'en alternance': 'alternance',
  'apprentissage et contrat pro': 'alternance',
  apprentissage: 'apprentissage',
  'en apprentissage': 'apprentissage',
  'formation par apprentissage': 'apprentissage',
  'formation initiale': 'initiale',
  'formation continue': 'continue',
  'a distance': 'distance',
  foad: 'distance',
};

function detectOne(t: string): { base: string; suffix: VariantSuffix } | null {
  const paren = PAREN_SUFFIX.exec(t);
  if (paren) {
    const key = normText(paren[2]!);
    return {
      base: paren[1]!,
      suffix: { kind: KIND_OF[key]!, value: '', raw: t.slice(paren[1]!.length).trim() },
    };
  }
  const rhythm = DASH_RHYTHM.exec(t);
  if (rhythm)
    return {
      base: rhythm[1]!,
      suffix: {
        kind: KIND_OF[normText(rhythm[2]!)]!,
        value: '',
        raw: t.slice(rhythm[1]!.length).trim(),
      },
    };
  const dash = DASH_PLACE.exec(t);
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
    return { base: dash[1]!, suffix: { kind, value, raw: t.slice(dash[1]!.length).trim() } };
  }
  return null;
}

/**
 * Title → base title and cursus label. Never cuts on a dash without one of the keywords. Only the
 * last suffix is cut, except a rhythm that follows another rhythm (« - En Alternance
 * (apprentissage et contrat pro) »): both go.
 */
export function detectVariantSuffix(title: string): DetectedVariant {
  const t = title.trim();
  const first = detectOne(t);
  if (!first) return { base: t, suffix: null, label: null };
  let { base, suffix } = first;
  if (RHYTHM.has(suffix.kind)) {
    const next = detectOne(base);
    if (next && RHYTHM.has(next.suffix.kind)) {
      base = next.base;
      suffix = { ...next.suffix, raw: t.slice(base.length).trim() };
    }
  }
  return { base, suffix, label: variantLabel(suffix) };
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);

/** Words that stay in lower case inside a place name (« Bonneuil-sur-Marne »). */
const LINKS = new Set([
  'sur',
  'sous',
  'en',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'lès',
  'aux',
  'et',
  'au',
]);
const ARTICLES = new Set(['le', 'la', 'les', "l'"]);

/**
 * Place name as a commune is written: « STRASBOURG CEDEX » → « Strasbourg », « La Roche sur Yon »
 * and « La Roche-sur Yon » → « La Roche-sur-Yon », « VILLENEUVE D'ASCQ » → « Villeneuve-d'Ascq »,
 * « LE MANS » → « Le Mans ». A leading article stays apart, the other words are joined by dashes.
 */
export function placeName(s: string): string {
  const t = s
    .replace(/\s*\([^()]*\)\s*$/, '')
    .replace(/\bc[ée]dex\b(\s*\d+)?/gi, ' ')
    .replace(/[’`]/g, "'")
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const words = t.split(' ').flatMap((w) => {
    const m = /^([dl]')(.+)$/i.exec(w);
    return m ? [`${m[1]!.toLowerCase()}`, m[2]!] : [w];
  });
  const lower = words.map((w) => w.toLocaleLowerCase('fr'));
  const out: string[] = [];
  lower.forEach((w, i) => {
    const elided = w.endsWith("'");
    const word = elided
      ? w
      : i > 0 && LINKS.has(w) && i < lower.length - 1
        ? w
        : cap(w).replace(
            /(-)(\p{L})/gu,
            (_, d: string, l: string) => d + l.toLocaleUpperCase('fr'),
          );
    out.push(i === 0 && elided ? cap(word) : word);
  });
  // Join: a leading article keeps its space, an elided article sticks to its word.
  let res = '';
  out.forEach((w, i) => {
    if (i === 0) res = w;
    else if (out[i - 1]!.endsWith("'")) res += w;
    else if (i === 1 && ARTICLES.has(lower[0]!)) res += ` ${w}`;
    else res += `-${w}`;
  });
  return res;
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
    case 'initiale':
      return 'Formation initiale';
    case 'continue':
      return 'Formation continue';
    case 'distance':
      return 'À distance';
  }
}

/** Base title key: accents, case, punctuation and repeated spaces ignored. */
export function baseTitleKey(title: string): string {
  return normText(detectVariantSuffix(title).base);
}

/**
 * A final parenthesis that only says where the programme leads (« (tronc commun menant vers les
 * M2 : …) ») leaves the displayed title and becomes a subtitle. Other parentheses stay
 * (« Europe (LLCER : albanais, …) »). The full title stays in the search.
 */
const SUBTITLE =
  /^(.*\S)\s*\(\s*((?:tronc\s+commun|menant|m[èe]ne|conduisant|donnant\s+acc[èe]s|acc[èe]s)\b[^()]*)\)\s*$/iu;

export function splitSubtitle(title: string): { title: string; subtitle: string | null } {
  const m = SUBTITLE.exec(title.trim());
  if (!m) return { title: title.trim(), subtitle: null };
  return { title: m[1]!, subtitle: cap(m[2]!.trim()) };
}

/** SQL twin of splitSubtitle (PostgreSQL ARE, case-insensitive), for the search index. */
export const SQL_SUBTITLE =
  '^(.*\\S)\\s*\\(\\s*((tronc\\s+commun|menant|m[èe]ne|conduisant|donnant\\s+acc[èe]s|acc[èe]s)\\y[^()]*)\\)\\s*$';

export interface GroupableFiche {
  /** UAI of the establishment. */
  uai: string;
  /** RNCP code of the mention; when absent, any stable key of the mention (id, normalised name). */
  mention: string;
  title: string;
}

/** UAI + mention + base title: two fiches with the same key may be cursus of one parcours. */
export function groupKey(f: GroupableFiche): string {
  return [normCode(f.uai), normCode(f.mention), baseTitleKey(f.title)].join('|');
}

export interface PlanFiche extends GroupableFiche {
  id: string;
  /** Mon Master parcours codes of its numbers (inmp), missing ones left out. */
  inmps: string[];
  /** Number of places of its latest session: the largest is kept when no slug decides. */
  places: number | null;
  slug: string;
  /** Already holds numbers of other fiches (an earlier grouping): it stays the parcours. */
  isParcours?: boolean;
}

export interface PlannedGroup {
  keeperId: string;
  memberIds: string[];
  /** Formed by a suffix of at least one title (rule 1), else by identical titles (rule 2). */
  bySuffix: boolean;
}

/**
 * Groups to form. Rule 1: a group with a suffixed title is grouped whatever the inmp. Rule 2: a
 * group of identical titles only when the inmp are the same or missing. The parcours kept is the
 * one already holding other numbers, else the one whose slug is `preferredSlug`, else the one with
 * the most places (then the smallest slug, for a stable choice).
 */
export function planGroups(
  fiches: PlanFiche[],
  preferredSlug: (f: PlanFiche) => string,
): PlannedGroup[] {
  const byKey = new Map<string, PlanFiche[]>();
  for (const f of fiches) {
    const k = groupKey(f);
    byKey.set(k, [...(byKey.get(k) ?? []), f]);
  }
  const out: PlannedGroup[] = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    const bySuffix = g.some((f) => detectVariantSuffix(f.title).suffix);
    if (!bySuffix && new Set(g.flatMap((f) => f.inmps)).size > 1) continue;
    const want = preferredSlug(g[0]!);
    const keeper =
      g.find((f) => f.isParcours) ??
      g.find((f) => f.slug === want) ??
      [...g].sort(
        (a, b) => (b.places ?? -1) - (a.places ?? -1) || a.slug.localeCompare(b.slug),
      )[0]!;
    out.push({ keeperId: keeper.id, memberIds: g.map((f) => f.id), bySuffix });
  }
  return out;
}

export interface CursusUnit {
  /** Any id, the key of the result (the Mon Master number). */
  id: string;
  /** Title of the number as Mon Master gives it. */
  title: string;
  /** Teaching places, the generic establishment entry already removed (specificPlaces). */
  places: MonMasterPlace[];
  workStudy: boolean;
  /** City or site of the fiche it came from (the one homonym slugs were told apart by). */
  hint?: string | null;
}

export type CursusKind = 'single' | 'named' | 'rhythm' | 'unnamed';

/**
 * Labels of the cursus of one parcours, in order of priority:
 * 1. the suffix of the title (« À distance », « Site de Troyes »);
 * 2. the rhythm: « En alternance », the other one « Formation initiale » (« En présentiel » next
 *    to a distance one);
 * 3. the commune the cursus alone is taught in (Strasbourg, Kehl, Passau);
 * 4. the city or site of the fiche it came from (CNAM: Dijon, Évry, Cholet…);
 * 5. « Cursus principal » for a last one without anything else; otherwise no label.
 * Then « Site »/« Campus » is removed when every label starts with it.
 */
export function labelCursus(units: CursusUnit[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (units.length < 2) {
    for (const u of units) out.set(u.id, null);
    return out;
  }
  const detected = new Map(units.map((u) => [u.id, detectVariantSuffix(u.title)]));
  for (const u of units) out.set(u.id, detected.get(u.id)!.label);
  const open = () => units.filter((u) => !out.get(u.id));
  const unique = (label: string | null | undefined, id: string) =>
    !!label && !units.some((o) => o.id !== id && out.get(o.id) === label);

  // 2. rhythm
  const kinds = units.map((u) => detected.get(u.id)!.suffix?.kind);
  const hasDistance = kinds.includes('distance');
  const rhythms = new Set(
    units.map((u) => u.workStudy || RHYTHM_ALT.has(kinds[units.indexOf(u)]!)),
  );
  for (const u of open()) {
    if (rhythms.size > 1) out.set(u.id, u.workStudy ? 'En alternance' : 'Formation initiale');
    else if (hasDistance) out.set(u.id, 'En présentiel');
  }
  // Two cursus with the same rhythm label are told apart by what follows.
  for (const u of units)
    if (!detected.get(u.id)!.label && !unique(out.get(u.id), u.id)) out.set(u.id, null);

  // 3. own commune
  const pending = open();
  if (pending.length) {
    const communes = units.map((u) => {
      const m = new Map<string, string>();
      for (const p of u.places) {
        const k = normCity(p.commune);
        if (k && !m.has(k)) m.set(k, placeName(p.commune));
      }
      return m;
    });
    const count = new Map<string, number>();
    for (const m of communes) for (const k of m.keys()) count.set(k, (count.get(k) ?? 0) + 1);
    const candidates = new Map<string, string>();
    for (const u of pending) {
      const i = units.indexOf(u);
      const own = [...communes[i]!].filter(([k]) => count.get(k)! < units.length);
      const common = [...communes[i]!].filter(([k]) => count.get(k) === units.length);
      const label = own.length
        ? own.map(([, v]) => v).join(' et ')
        : common.length === 1 && pending.length > 1
          ? common[0]![1]
          : null;
      if (label) candidates.set(u.id, label);
    }
    const values = [...candidates.values()];
    for (const [id, label] of candidates)
      if (values.indexOf(label) === values.lastIndexOf(label) && unique(label, id))
        out.set(id, label);
  }

  // 4. city or site of the former fiche
  const hinted = open().map((u) => [u.id, u.hint ? placeName(u.hint) : null] as const);
  const hintValues = hinted.map(([, h]) => h);
  for (const [id, h] of hinted)
    if (h && hintValues.indexOf(h) === hintValues.lastIndexOf(h) && unique(h, id)) out.set(id, h);

  // 5. a last one without anything else
  const left = open();
  if (left.length === 1) out.set(left[0]!.id, 'Cursus principal');

  // « Site »/« Campus » removed when every label has it
  for (const prefix of [/^Site (?:de )?/, /^Campus (?:de )?/]) {
    const labels = [...out.values()];
    if (labels.every((l) => l && prefix.test(l)))
      for (const [id, l] of out) out.set(id, placeName(l!.replace(prefix, '')));
  }
  for (const [id, l] of out) {
    const m = l ? /^((?:Site|Campus)(?: de)? )(.+)$/.exec(l) : null;
    if (m) out.set(id, m[1]! + placeName(m[2]!));
  }
  return out;
}

const RHYTHM_ALT: ReadonlySet<SuffixKind | undefined> = new Set(['alternance', 'apprentissage']);

/**
 * How a parcours shows its cursus: one only (nothing), named by place or suffix (« 3 cursus »),
 * a pair told apart by the rhythm only (« Initiale ou alternance »), or numbers that nothing
 * tells apart (« N fiches Mon Master »).
 */
export function cursusKind(labels: (string | null)[]): CursusKind {
  if (labels.length < 2) return 'single';
  if (labels.some((l) => !l)) return 'unnamed';
  const set = new Set(labels);
  if (
    labels.length === 2 &&
    set.has('Formation initiale') &&
    (set.has('En alternance') || set.has('En apprentissage'))
  )
    return 'rhythm';
  return 'named';
}
