import { truncateMiddle } from '@/lib/domain/truncate';
import { BRAND, DESCRIPTION, TITLE } from './rules';

/**
 * Titles and descriptions of the public pages, computed from the real data (unique per page,
 * in French). Each one tries its full form first, then shorter forms, until it fits the length
 * aimed at (lib/seo/rules.ts); as a last resort the longest name is cut on a word.
 */

const SUFFIX = ` | ${BRAND}`;
/** Titles of the listing pages: their own format as long as it fits the maximum. */
const LISTING = { target: TITLE.max, max: TITLE.max };
const nf = new Intl.NumberFormat('fr-FR');

/** « 4,1 » (one decimal, French comma). */
export function ratingText(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
}

/** Cut on a word, with an ellipsis, to at most `max` characters. */
export function cutWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(1, max - 1));
  const i = cut.lastIndexOf(' ');
  return `${(i > max * 0.5 ? cut.slice(0, i) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/**
 * A name cut in the middle, on words: « Commerce international – Anglais-Chinois » keeps both its
 * start and the end that tells it from « … Anglais-Coréen ».
 */
export function cutName(s: string, max: number): string {
  if (s.length <= max) return s;
  // The end of a name is what sets it apart (« … anglais-russe », « … : chimie »): the split
  // that keeps the most, the end first on a tie.
  const tries = [0.35, 0.45, 0.6, 0.75]
    .map((share) => truncateMiddle(s, Math.max(8, max), share))
    .filter((c) => c.length <= max);
  return tries.sort((x, y) => y.length - x.length)[0] ?? cutWords(s, max);
}

const bare = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * A name cut while keeping its first word and the words that set it apart from its
 * near-homonyms (`keep`, lib/catalog/homonyms.ts): the other words go from the end backwards.
 * « Études arabes - Relations internationales » → « Études arabes… ». Without such words: cutName.
 */
export function cutKeeping(s: string, max: number, keep: string[] = []): string {
  if (s.length <= max) return s;
  if (!keep.length) return cutName(s, max);
  const ws = s.split(' ');
  const keepSet = new Set(keep);
  const kept = ws.map(() => true);
  const render = () => {
    const out: string[] = [];
    ws.forEach((w, i) => {
      if (kept[i]) out.push(w);
      else if (out.at(-1) !== '…') out.push('…');
    });
    return out.join(' ').replace(/[\s,;:–-]*…/g, '…');
  };
  for (let i = ws.length - 1; i > 0 && render().length > max; i--)
    if (!bare(ws[i]!).some((w) => keepSet.has(w))) kept[i] = false;
  const r = render();
  return r.length <= max ? r : cutName(s, max);
}

/**
 * The first candidate within `target`, else the first within `max`, else the last candidate
 * built with its variable part cut on a word to fit `max`.
 */
function fit(
  candidates: string[],
  cutLast: { build: (part: string) => string; part: string },
  limits: { target: number; max: number },
  cut: (s: string, max: number) => string = cutName,
): string {
  const ok = candidates.find((c) => c.length <= limits.target);
  if (ok) return ok;
  const near = candidates.find((c) => c.length <= limits.max);
  if (near) return near;
  const room = limits.max - cutLast.build('').length;
  return cutLast.build(cut(cutLast.part, Math.max(8, room)));
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** « Nantes Université » already names Nantes: no « (Nantes) » after it. */
const namesCity = (uni: string, city: string) => !!city && norm(uni).includes(norm(city));

/** « Les cities » as a list: « Nantes, Lyon et Strasbourg », « 5 villes » beyond three. */
export function citiesText(names: string[]): string {
  if (names.length > 3) return `${names.length} villes`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}

/** « à Nantes », « à Nantes et Lyon », « dans 5 villes » (never « à 5 villes »). */
export function inCities(names: string[]): string {
  return names.length > 3 ? `dans ${names.length} villes` : `à ${citiesText(names)}`;
}

/** « de droit », « d’informatique », « de MEEF »: the mention after « Masters ». */
export function deMention(name: string): string {
  const acronym = /^[A-Z]{2}/.test(name);
  const word = acronym ? name : name.charAt(0).toLowerCase() + name.slice(1);
  return /^[aeiouyhâàéèêëîïôöûüœ]/i.test(word) && !acronym ? `d’${word}` : `de ${word}`;
}

// ───────────────────────────── fiche parcours ─────────────────────────────

export interface ParcoursSeoInput {
  /** Displayed title (the speciality: splitParcoursTitle). */
  title: string;
  /**
   * What sets this fiche apart from its homonyms at the same university (« alternance »,
   * « entrée en M2 », a campus, a Mon Master number: lib/catalog/homonyms.ts), or « alternance »
   * for a work-study parcours without homonym; null otherwise.
   */
  qualifier: string | null;
  /** Words that set this name apart from its near-homonyms: kept when it is cut. */
  keepWords?: string[];
  mention: string;
  universityName: string;
  universityShort: string | null;
  city: string;
  reviewCount: number;
  avgRating: number | null;
  hasProgramme: boolean;
  hasAdmission: boolean;
}

/**
 * « Université de Montpellier Paul-Valéry » → « Univ. Montpellier Paul-Valéry »: the usual short
 * form when the annuaire has no short name.
 */
export function abbreviateUniversity(name: string): string {
  return name
    .replace(/^Université (de |d’|d')?/i, 'Univ. ')
    .replace(/^Institut national des sciences appliquées/i, 'INSA')
    .replace(/^École normale supérieure/i, 'ENS');
}

/** The names of a university, longest first, without repeats. */
function universityNames(name: string, short: string | null): string[] {
  return [...new Set([name, abbreviateUniversity(name), ...(short ? [short] : [])])].sort(
    (a, b) => b.length - a.length,
  );
}

/** `Master {Parcours} – {Université} ({Ville}) : avis et programme | notetonmaster`. */
export function parcoursTitle(p: ParcoursSeoInput): string {
  // A long qualifier (a campus) is cut: titles have little room.
  const cut = (x: string, n: number) => cutKeeping(x, n, p.keepWords);
  const q = p.qualifier ? ` (${cutName(p.qualifier, 28)})` : '';
  const t = `${p.title}${q}`;
  const at = (uni: string) => (namesCity(uni, p.city) ? uni : `${uni} (${p.city})`);
  const unis = universityNames(p.universityName, p.universityShort);
  const withCity = [
    ...unis.map((u) => `Master ${t} – ${at(u)} : avis et programme${SUFFIX}`),
    ...unis.map((u) => `Master ${t} – ${at(u)} : avis${SUFFIX}`),
    ...unis.map((u) => `Master ${t} – ${at(u)}${SUFFIX}`),
  ];
  // Without the city only when no form with it fits: the university stays (it tells homonyms
  // of one city apart).
  const withoutCity = unis.map((u) => `Master ${t} – ${u}${SUFFIX}`);
  const ok =
    withCity.find((c) => c.length <= TITLE.target) ??
    withCity.find((c) => c.length <= TITLE.max) ??
    withoutCity.find((c) => c.length <= TITLE.max);
  if (ok) return ok;
  // Long names: the parcours name is what tells fiches apart, it goes first. After it: the
  // shortest university name if the name keeps 70 % of itself; else the whole name and a cut
  // university; else the city; else the name alone, cut in the middle.
  const base = (title: string, u: string) => `Master ${title}${q}${u ? ` – ${u}` : ''}${SUFFIX}`;
  const budget = TITLE.max - base('', '').length;
  const keeps = (title: string) =>
    title.length >= Math.ceil(p.title.length * 0.7) || title.length >= 40;
  const uni = unis.at(-1)!;
  const withUni = cut(p.title, budget - 3 - uni.length);
  if (keeps(withUni)) return base(withUni, uni);
  // the whole name, and as much of the university as fits
  const uniRoom = budget - 3 - p.title.length;
  if (uniRoom >= Math.max(6, Math.ceil(uni.length / 2)))
    return base(p.title, cutName(uni, uniRoom));
  const cityTitle = cut(p.title, budget - 3 - p.city.length);
  // The city stays even when the name loses more: same names exist at many universities.
  if (keeps(cityTitle) || cityTitle.length >= 15) return base(cityTitle, p.city);
  return base(cut(p.title, budget), '');
}

export function parcoursDescription(p: ParcoursSeoInput): string {
  const where = `à ${p.city}`;
  const unis = universityNames(p.universityName, p.universityShort);
  const tails = p.hasProgramme
    ? [
        `Programme semestre par semestre, admission et parcours similaires ${where}.`,
        `Programme, admission et parcours similaires ${where}.`,
      ]
    : p.hasAdmission
      ? [
          `Admission, origine des admis et parcours similaires ${where}.`,
          `Admission et parcours similaires ${where}.`,
        ]
      : [`Admission et parcours similaires ${where}.`];
  const rated = p.reviewCount > 0 && p.avgRating != null;
  const lead = rated
    ? `${ratingText(p.avgRating!)}/5 sur ${nf.format(p.reviewCount)} avis d’étudiant·es.`
    : '';
  const q = p.qualifier ? `, ${cutName(p.qualifier, 45)}` : '';
  // « Master X (Université) : 4,1/5 sur 12 avis d’étudiant·es. Programme… »: the name and the
  // university keep two fiches with the same figures apart, so they stay; the sentence after
  // them gets shorter first.
  const build = (t: string, uni: string | null, tail: string) =>
    `Master ${t}${uni || q ? ` (${[uni, q.slice(2)].filter(Boolean).join(', ')})` : ''}${lead ? ` : ${lead}` : '.'} ${rated ? tail : `${tail} Sois le ou la premier·e à donner ton avis.`}`;
  // The whole name before the university: the city stays in the sentence after it.
  const candidates = [
    ...tails.flatMap((tail) => unis.map((u) => build(p.title, u, tail))),
    ...tails.map((tail) => build(p.title, null, tail)),
  ];
  const last = { tail: tails.at(-1)!, uni: unis.at(-1)! };
  const d = fit(
    candidates,
    { build: (t) => build(t, last.uni, last.tail), part: p.title },
    DESCRIPTION,
    (x, n) => cutKeeping(x, n, p.keepWords),
  );
  // Very long establishment and campus names: the end of the sentence is cut rather than the limit.
  return d.length <= DESCRIPTION.max ? d : cutWords(d, DESCRIPTION.max);
}

// ───────────────────────────── mention, université, ville ─────────────────────────────

/** `Master {Mention} : {n} parcours à {villes} | notetonmaster`. */
export function mentionTitle(m: {
  name: string;
  programs: number;
  page?: number;
  cities: string[];
}): string {
  // « — page 2 » goes before the brand, inside the length budget: the shorter forms win.
  const S = `${m.page && m.page > 1 ? ` — page ${m.page}` : ''}${SUFFIX}`;
  const n = `${nf.format(m.programs)} parcours`;
  const count =
    m.cities.length > 1 ? `dans ${m.cities.length} villes` : `à ${citiesText(m.cities)}`;
  const candidates = [
    `Master ${m.name} : ${n} ${inCities(m.cities)}${S}`,
    `Master ${m.name} : ${n} ${count}${S}`,
    `Master ${m.name} : ${n}${S}`,
    // never « Master {name} » alone: a parcours of the same name has that title
    `Mention ${m.name} : ${n}${S}`,
    `Mention ${m.name}${S}`,
  ];
  return fit(candidates, { build: (x) => `Master ${x} : ${n}${S}`, part: m.name }, LISTING);
}

export function mentionDescription(m: {
  name: string;
  programs: number;
  universities: number;
  reviews: number;
  cities: string[];
}): string {
  const etab = `${nf.format(m.universities)} établissement${m.universities > 1 ? 's' : ''} public${m.universities > 1 ? 's' : ''}`;
  const avis = m.reviews ? `${nf.format(m.reviews)} avis d’étudiant·es` : 'les avis d’étudiant·es';
  const where =
    m.cities.length > 3 ? `dans ${m.cities.length} villes` : `à ${citiesText(m.cities)}`;
  const forms = [
    (n: string) =>
      `Les ${nf.format(m.programs)} parcours du master ${n} ${where}, proposés par ${etab} : programmes, admission et ${avis}.`,
    (n: string) =>
      `Les ${nf.format(m.programs)} parcours du master ${n} ${where} : programmes, admission et ${avis}.`,
    (n: string) =>
      `Master ${n} : ${nf.format(m.programs)} parcours ${where}, avec programmes et avis.`,
  ];
  return fit(
    forms.map((f) => f(m.name)),
    { build: forms.at(-1)!, part: m.name },
    DESCRIPTION,
  );
}

/** `Masters à {Université} : {n} parcours et avis | notetonmaster`. */
export function universityTitle(u: {
  name: string;
  shortName: string | null;
  programs: number;
  page?: number;
}): string {
  // « — page 2 » goes before the brand, inside the length budget: the shorter forms win.
  const S = `${u.page && u.page > 1 ? ` — page ${u.page}` : ''}${SUFFIX}`;
  const n = `${nf.format(u.programs)} parcours`;
  const names = [
    u.name,
    ...(u.shortName && u.shortName.length < u.name.length ? [u.shortName] : []),
  ];
  const candidates = [
    ...names.map((x) => `Masters à ${x} : ${n} et avis${S}`),
    ...names.map((x) => `Masters à ${x} : ${n}${S}`),
  ];
  return fit(candidates, { build: (x) => `Masters à ${x} : ${n}${S}`, part: u.name }, LISTING);
}

export function universityDescription(u: {
  name: string;
  programs: number;
  mentions: number;
  reviews: number;
  cities: string[];
}): string {
  const avis = u.reviews ? `${nf.format(u.reviews)} avis d’étudiant·es` : 'les avis d’étudiant·es';
  // « Nantes Université (Nantes) » says it twice: only the cities its name does not give.
  const others = u.cities.filter((c) => !namesCity(u.name, c));
  const where = others.length ? ` (${citiesText(others)})` : '';
  const build = (name: string) =>
    `Les ${nf.format(u.programs)} parcours de master de ${name}${where} dans ${nf.format(u.mentions)} mention${u.mentions > 1 ? 's' : ''} : programmes, admission et ${avis}.`;
  return fit([build(u.name)], { build, part: u.name }, DESCRIPTION);
}

/** `Masters à {Ville} : {n} parcours, avis d’étudiant·es | notetonmaster`. */
export function cityTitle(c: { name: string; programs: number; page?: number }): string {
  // « — page 2 » goes before the brand, inside the length budget: the shorter forms win.
  const S = `${c.page && c.page > 1 ? ` — page ${c.page}` : ''}${SUFFIX}`;
  const n = `${nf.format(c.programs)} parcours`;
  return fit(
    [
      `Masters à ${c.name} : ${n}, avis d’étudiant·es${S}`,
      `Masters à ${c.name} : ${n} et avis${S}`,
      `Masters à ${c.name} : ${n}${S}`,
    ],
    { build: (x) => `Masters à ${x} : ${n}${S}`, part: c.name },
    LISTING,
  );
}

/** « 213 parcours dans 3 établissements publics, 39 avis d’étudiant·es » (intro and description). */
export function cityIntro(c: { programs: number; universities: number; reviews: number }): string {
  const etab = `${nf.format(c.universities)} établissement${c.universities > 1 ? 's' : ''} public${c.universities > 1 ? 's' : ''}`;
  const avis = c.reviews
    ? `${nf.format(c.reviews)} avis d’étudiant·es`
    : 'pas encore d’avis d’étudiant·es';
  return `${nf.format(c.programs)} parcours dans ${etab}, ${avis}`;
}

export function cityDescription(c: {
  name: string;
  programs: number;
  universities: number;
  reviews: number;
  topMentions: string[];
}): string {
  const build = (m: string) =>
    `Les masters à ${c.name} : ${cityIntro(c)}.${m ? ` ${m}…` : ''} Programmes, admission et avis, parcours par parcours.`;
  const mentions = c.topMentions.slice(0, 3).join(', ');
  return fit([build(mentions), build('')], { build, part: mentions }, DESCRIPTION);
}

export function cityMentionTitle(c: {
  city: string;
  mention: string;
  programs: number;
  page?: number;
}): string {
  // « — page 2 » goes before the brand, inside the length budget: the shorter forms win.
  const S = `${c.page && c.page > 1 ? ` — page ${c.page}` : ''}${SUFFIX}`;
  const n = `${nf.format(c.programs)} parcours`;
  const de = deMention(c.mention);
  return fit(
    [
      `Masters ${de} à ${c.city} : ${n} et avis${S}`,
      `Masters ${de} à ${c.city} : ${n}${S}`,
      `Masters ${de} à ${c.city}${S}`,
    ],
    { build: (x) => `Masters ${deMention(x)} à ${c.city}${S}`, part: c.mention },
    LISTING,
  );
}

/** « 12 parcours de master de droit à Nantes, dans 2 établissements publics ; 4 avis… ». */
export function cityMentionIntro(c: {
  city: string;
  mention: string;
  programs: number;
  universities: number;
  reviews: number;
}): string {
  const etab = `${nf.format(c.universities)} établissement${c.universities > 1 ? 's' : ''} public${c.universities > 1 ? 's' : ''}`;
  const avis = c.reviews
    ? `${nf.format(c.reviews)} avis d’étudiant·es publiés`
    : 'pas encore d’avis d’étudiant·es';
  return `${nf.format(c.programs)} parcours du master ${c.mention} à ${c.city}, dans ${etab} ; ${avis}.`;
}

export function cityMentionDescription(c: {
  city: string;
  mention: string;
  programs: number;
  universities: number;
  reviews: number;
}): string {
  const avis = c.reviews ? `${nf.format(c.reviews)} avis d’étudiant·es` : 'pas encore d’avis';
  const forms = [
    (m: string) =>
      `${cityMentionIntro({ ...c, mention: m })} Programmes, admission et notes, parcours par parcours.`,
    (m: string) =>
      `${nf.format(c.programs)} parcours du master ${m} à ${c.city} ; ${avis}. Programmes, admission et notes.`,
    (m: string) =>
      `Masters ${deMention(m)} à ${c.city} : ${nf.format(c.programs)} parcours, ${avis}.`,
  ];
  return fit(
    forms.map((f) => f(c.mention)),
    { build: forms.at(-1)!, part: c.mention },
    DESCRIPTION,
  );
}

/** Fixed or listing pages: « {title} | notetonmaster », cut if needed. */
export function plainTitle(title: string): string {
  return fit([`${title}${SUFFIX}`], { build: (x) => `${x}${SUFFIX}`, part: title }, LISTING);
}

/** « … — page 2 » for the pages of a list beyond the first, kept within the lengths. */
export function pagedSeoTitle(title: string, page: number): string {
  if (page <= 1) return title;
  const tag = ` — page ${page}`;
  const base = title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title;
  return fit(
    [`${base}${tag}${SUFFIX}`],
    { build: (x) => `${x}${tag}${SUFFIX}`, part: base },
    LISTING,
  );
}
