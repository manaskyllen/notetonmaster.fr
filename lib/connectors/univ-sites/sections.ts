/**
 * Generic extractor by sections (« rubriques ») of a program page, by rules only (no AI).
 *
 * 1. The page is cut into sections by its headings (h2, h3, h4 by default, or the headings a
 *    profile declares with their level), tabs and accordions rendered in the HTML (`aria-controls`
 *    panels, `<details><summary>`).
 * 2. Each heading is matched against a table of normalised synonyms (Objectifs, Compétences,
 *    Admission, Débouchés, Programme, Stages, Poursuite d'études, Langues, Frais). A section runs
 *    until the next heading, except deeper headings that match no rubric (« Semestre 1 », « M1 »),
 *    which stay inside it. « Débouchés » is still recognised, only to end the previous section:
 *    its content is no longer read.
 * 3. Structured reads: course units (tables and lists) in « Programme », criteria lists in
 *    « Admission ».
 *
 * Every field keeps its evidence (300 characters at most) and the year of the document when the
 * page states it. Personal data is removed (lib/data/pii.ts) before anything is returned. What is
 * not found with certainty is absent from the result (the field stays MISSING).
 */
import { evidenceExtract, looksLikePersonNames, scrubPii } from '@/lib/data/pii';
import {
  getById,
  inlineText,
  isEl,
  matches,
  parseHtml,
  query,
  queryAll,
  removeAll,
  textOf,
  type El,
  type Node,
} from './html';

// ───────────────────────────── rubrics ─────────────────────────────

export const RUBRICS = [
  'objectifs',
  'competences',
  'admission',
  'debouches',
  'programme',
  'stages',
  'poursuite',
  'langues',
  'frais',
] as const;
export type Rubric = (typeof RUBRICS)[number];

export const RUBRIC_LABEL: Record<Rubric, string> = {
  objectifs: 'Objectifs',
  competences: 'Compétences',
  admission: 'Admission',
  debouches: 'Débouchés',
  programme: 'Programme',
  stages: 'Stages',
  poursuite: "Poursuite d'études",
  langues: 'Langues',
  frais: 'Frais',
};

/** Lower case, no accent, no punctuation, single spaces. */
export function normHeading(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\(s\)/g, 's')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/^\s*(\d+|[ivx]+)\s+/, '') // « 2. Admission », « II - Programme »
    .trim();
}

interface Synonym {
  rubric: Rubric;
  /** Normalised phrase. */
  phrase: string;
  /** exact: the whole heading; start: the heading starts with it; any: anywhere in the heading. */
  mode: 'exact' | 'start' | 'any';
  /** 2 = the rubric's own name, 1 = a generic heading (« Présentation », « Et après »). */
  weight: 1 | 2;
}

const S = (rubric: Rubric, weight: 1 | 2, mode: Synonym['mode'], ...phrases: string[]): Synonym[] =>
  phrases.map((phrase) => ({ rubric, phrase: normHeading(phrase), mode, weight }));

/**
 * Synonyms, most specific first: the first match wins. « Poursuite d'études » is tested before
 * « Débouchés » and « Contenu de la formation » before « La formation ».
 */
export const SYNONYMS: Synonym[] = [
  ...S(
    'poursuite',
    2,
    'start',
    "poursuite d'études",
    'poursuites d études',
    'poursuite d etude',
    'poursuite des études',
  ),
  ...S(
    'frais',
    2,
    'start',
    'frais',
    "droits d'inscription",
    'droits de scolarité',
    'coût de la formation',
    'tarifs',
  ),
  ...S(
    'langues',
    2,
    'start',
    "langues d'enseignement",
    "langue d'enseignement",
    'langues',
    'langue',
  ),
  ...S(
    'competences',
    2,
    'start',
    'compétences visées',
    'compétences',
    'savoir-faire',
    'savoir faire',
    'connaissances et compétences',
    'acquis d apprentissage',
  ),
  ...S('objectifs', 2, 'start', 'objectifs', 'objectif', 'objectifs de la formation', 'finalités'),
  ...S(
    'programme',
    2,
    'start',
    'programme',
    'programmes',
    'contenu de la formation',
    'contenus de la formation',
    'maquette',
    'enseignements',
    'enseignement',
    'organisation des enseignements',
    'unités d enseignement',
    'structure de la formation',
  ),
  ...S('programme', 1, 'start', 'organisation', 'organisation de la formation', 'contenu'),
  ...S(
    'stages',
    2,
    'start',
    'stages',
    'stage',
    'alternance',
    'rythme',
    'stages et projets',
    'stages projets tutorés',
  ),
  ...S(
    'debouches',
    2,
    'start',
    'débouchés',
    'débouché',
    'insertion professionnelle',
    'métiers visés',
    'métiers',
    'secteurs d activité',
    'perspectives professionnelles',
    'emplois visés',
  ),
  ...S('debouches', 1, 'start', 'et après', 'après la formation', 'devenir des diplômés'),
  ...S(
    'admission',
    2,
    'start',
    'admission',
    'conditions d accès',
    'conditions d admission',
    'candidater',
    'candidature',
    'public visé',
    'public cible',
    'public ciblé',
    'publics visés',
    'prérequis',
    'pré requis',
    'attendus',
    'modalités de sélection',
    'modalités de recrutement',
    'recrutement',
    'niveaux de recrutement',
    'formations requises',
    'formation requise',
    'diplômes conseillés',
    'accès à la formation',
    'critères',
  ),
  ...S(
    'objectifs',
    1,
    'exact',
    'présentation',
    'la formation',
    'présentation de la formation',
    'description',
    'à propos',
  ),
  ...S('objectifs', 1, 'start', 'présentation du master', 'présentation du parcours'),
];

/**
 * Headings that end a section even when they are deeper: what follows is not part of a rubric
 * (and may name people: contacts, testimonials).
 */
const STOP = new RegExp(
  '^(' +
    [
      'contact',
      'responsable',
      'equipe',
      'secretariat',
      'scolarite',
      'nous contacter',
      'ils en parlent',
      'temoignage',
      'portrait',
      'capacite',
      'controle des connaissances',
      'modalites de controle',
      'evaluation',
      'amenagement',
      'lieu',
      'campus',
      'les \\+',
      'resume de la formation',
      'en savoir plus',
      'telechargement',
      'pieces jointes',
      'documents',
      'calendrier',
      'modalites d inscription',
      'inscription',
      'dimension internationale',
      'statistique',
      'chiffres cles',
      'partenaires',
      'actualite',
      'formation continue',
      'vae',
      'validation des acquis',
      'informations pratiques',
      'renseignements',
      'acces handicap',
      'etudes et handicap',
      'numero rncp',
    ].join('|') +
    ')',
);

export function rubricOf(heading: string): { rubric: Rubric; weight: 1 | 2 } | null {
  const h = normHeading(heading);
  if (!h || h.length > 80) return null;
  for (const s of SYNONYMS) {
    const ok =
      s.mode === 'exact'
        ? h === s.phrase
        : s.mode === 'start'
          ? h === s.phrase || h.startsWith(`${s.phrase} `)
          : ` ${h} `.includes(` ${s.phrase} `);
    if (ok) return { rubric: s.rubric, weight: s.weight };
  }
  return null;
}

export const isStopHeading = (heading: string) => STOP.test(normHeading(heading));

// ───────────────────────────── options and result ─────────────────────────────

export interface HeadingRule {
  selector: string;
  level: number;
}

export interface ExtractOptions {
  /** Page URL (its path may give the year of the catalogue: « formations-2026-2027 »). */
  url?: string;
  /** Content area (first match); the whole page by default. */
  root?: string;
  /** Elements removed before reading (navigation, side blocks…), on top of the defaults. */
  drop?: string;
  /** Headings and their level; default h2 (2), h3 (3), h4 (4). */
  headings?: HeadingRule[];
  /** Elements that look like headings but are not (key facts, cards…). */
  ignoreHeadings?: string;
  /** Tabs and accordions whose `aria-controls` (or `data-target`) panel holds the section. */
  controllers?: HeadingRule[];
  /** Key facts « label → value » (Ametys benefits, K-Sup `dt/dd`): label selector, value = next element. */
  facts?: string;
  /** Lines removed from the text (« Lire plus »…), on top of the defaults. */
  noise?: RegExp[];
}

export interface Field<T> {
  value: T;
  /** Extract proving the value, personal data removed, ≤ 300 characters. Never public. */
  evidence: string;
  /** Heading the value was found under. */
  heading: string;
  /** Academic year the document states (« 2025-2026 »), or null. */
  year: string | null;
}

export interface CourseUnit {
  title: string;
  ects: number | null;
  /** Semester number as the page gives it (1–4, or 7–10 in LMD numbering). */
  semester: number | null;
  /** Year of the master (1 or 2) when the page or the semester number tells it. */
  year: 1 | 2 | null;
  hours: number | null;
}

export interface SemesterBlock {
  position: number;
  /** « M1 · Semestre 1 », « Semestre 7 », « M2 », « Enseignements ». */
  label: string;
  content: string;
  units: CourseUnit[];
}

export interface AdmissionLists {
  expectations?: Field<string[]>;
  selectionCriteria?: Field<string[]>;
  advisedDegrees?: Field<string[]>;
  requirements?: Field<string[]>;
  examModes?: Field<string[]>;
}

export interface PageExtraction {
  rubrics: Partial<Record<Rubric, Field<string>>>;
  units: Field<CourseUnit[]> | null;
  semesters: Field<SemesterBlock[]> | null;
  admission: AdmissionLists;
  languages: Field<string[]> | null;
  facts: Record<string, string>;
  /** Year stated by the page (or its URL), or null. */
  documentYear: string | null;
  /** Number of rubrics found (the « 3 rubriques ou plus » measure). */
  rubricCount: number;
  /** Personal data items removed. */
  piiRemoved: number;
}

// ───────────────────────────── stream of blocks ─────────────────────────────

const DEFAULT_DROP =
  'script, style, noscript, template, svg, img, picture, video, iframe, form, nav, header, footer, button.close, .visually-hidden, .sr-only, [aria-hidden=true], [class*=person], [class*=temoignage], [class*=testimon], .modal';
const DEFAULT_HEADINGS: HeadingRule[] = [
  { selector: 'h2', level: 2 },
  { selector: 'h3', level: 3 },
  { selector: 'h4', level: 4 },
  { selector: 'summary', level: 5 },
];
const DEFAULT_CONTROLLERS: HeadingRule[] = [
  { selector: '[role=tab]', level: 2 },
  { selector: 'button[aria-controls]', level: 4 },
  { selector: '[data-bs-toggle=collapse]', level: 4 },
  { selector: '[data-toggle=collapse]', level: 4 },
];
const DEFAULT_NOISE = [
  /^(lire|voir|afficher|masquer) (plus|moins|la suite|les cours|le détail|les détails)/i,
  /^chargement/i,
  /^(imprimer|partager|télécharger( en pdf)?|version pdf|facebook|twitter|x \(twitter\)|linkedin|envoyer par (e-?mail|courriel))$/i,
  /^(t[ée]l[ée]chargements?|fiche synth[ée]tique|retour)$|^(ajouter [àa] (la|ma) s[ée]lection|vous avez .*sauvegard[ée]s)/i,
  /^(url )?fiche rncp\b|^n°\s*rncp\b|^(code|num[ée]ro) rncp\b|^rncp\s*:?\s*\d+$/i,
];

type Block =
  { kind: 'heading'; text: string; level: number; el: El } | { kind: 'node'; node: Node };

interface Doc {
  root: El;
  blocks: Block[];
}

function buildStream(root: El, o: ExtractOptions): Block[] {
  const headingRules = o.headings ?? DEFAULT_HEADINGS;
  const controllerRules = o.controllers ?? DEFAULT_CONTROLLERS;
  const level = new Map<El, number>();
  const panelOf = new Map<El, El>();
  const consumed = new Set<El>();
  const ignored = o.ignoreHeadings;
  const usable = (e: El) => {
    if (ignored && matches(e, ignored)) return false;
    const t = inlineText(e);
    return t.length > 0 && t.length <= 120;
  };
  for (const r of headingRules)
    for (const e of queryAll(root, r.selector))
      if (!level.has(e) && usable(e)) level.set(e, r.level);
  for (const r of controllerRules) {
    for (const e of queryAll(root, r.selector)) {
      if (level.has(e) || !usable(e)) continue;
      const target = (
        e.attrs['aria-controls'] ??
        e.attrs['data-bs-target'] ??
        e.attrs['data-target'] ??
        ''
      ).replace(/^#/, '');
      const panel = target && /^[\w-]+$/.test(target) ? getById(root, target) : null;
      if (!panel || panel === e || isAncestor(panel, e)) continue;
      level.set(e, r.level);
      panelOf.set(e, panel);
      consumed.add(panel);
    }
  }
  // elements containing a heading are walked into; the others are content blocks
  const holds = new Set<El>();
  for (const e of level.keys()) for (let p = e.parent; p; p = p.parent) holds.add(p);
  for (const p of panelOf.values()) for (let a = p.parent; a; a = a.parent) holds.add(a);

  const out: Block[] = [];
  const visit = (el: El, viaPanel: boolean) => {
    for (const c of el.children) {
      if (!isEl(c)) {
        if (c.trim()) out.push({ kind: 'node', node: c });
        continue;
      }
      if (consumed.has(c) && !viaPanel) continue;
      const lv = level.get(c);
      if (lv !== undefined) {
        out.push({ kind: 'heading', text: inlineText(c), level: lv, el: c });
        const panel = panelOf.get(c);
        if (panel) {
          out.push(...panelBlocks(panel));
        }
        continue;
      }
      if (holds.has(c)) visit(c, false);
      else out.push({ kind: 'node', node: c });
    }
  };
  const panelBlocks = (panel: El): Block[] => {
    const save = out.length;
    visit(panel, true);
    return out.splice(save);
  };
  visit(root, false);
  return out;
}

const isAncestor = (a: El, b: El) => {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
};

function prepare(html: string | El, o: ExtractOptions): Doc {
  const doc = typeof html === 'string' ? parseHtml(html) : html;
  const root = (o.root && query(doc, o.root)) || query(doc, 'main') || query(doc, 'body') || doc;
  removeAll(root, DEFAULT_DROP);
  if (o.drop) removeAll(root, o.drop);
  return { root, blocks: buildStream(root, o) };
}

// ───────────────────────────── sections ─────────────────────────────

interface RawSection {
  rubric: Rubric;
  weight: 1 | 2;
  heading: string;
  level: number;
  blocks: Block[];
}

function cutSections(blocks: Block[]): RawSection[] {
  const out: RawSection[] = [];
  let cur: RawSection | null = null;
  for (const b of blocks) {
    if (b.kind === 'heading') {
      const r = rubricOf(b.text);
      const stop = !r && isStopHeading(b.text);
      if (cur && (r || stop || b.level <= cur.level)) cur = null;
      if (r) {
        cur = { rubric: r.rubric, weight: r.weight, heading: b.text, level: b.level, blocks: [] };
        out.push(cur);
      } else if (cur) cur.blocks.push(b); // deeper sub-heading (« Semestre 1 ») stays in the section
      continue;
    }
    cur?.blocks.push(b);
  }
  return out;
}

function blockText(b: Block, skipTables = false): string {
  if (b.kind === 'heading') return b.text;
  if (!skipTables || !isEl(b.node)) return textOf(b.node);
  const clone = stripTables(b.node);
  return clone ? textOf(clone) : '';
}

function stripTables(e: El): El | null {
  if (e.tag === 'table') return null;
  return {
    ...e,
    children: e.children
      .map((c) => (isEl(c) ? stripTables(c) : c))
      .filter((c): c is Node => c !== null),
  };
}

function cleanLines(text: string, noise: RegExp[]): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      const bare = l.replace(/^•\s*/, '').trim();
      return bare && !noise.some((re) => re.test(bare));
    });
}

// ───────────────────────────── years ─────────────────────────────

const YEAR_RE = /\b(20\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/g;

/** Academic years stated in a text (« 2025-2026 », « 2025/26 »), as « 2025-2026 ». */
export function academicYears(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(YEAR_RE)) {
    const a = Number(m[1]);
    const b = m[2]!.length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (b === a + 1) out.push(`${a}-${b}`);
  }
  return out;
}

export function yearFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const y = academicYears(path.replace(/[_]/g, '-'))[0];
  if (y) return y;
  const cat = /catalogue[-_]?(20\d{2})\b/i.exec(path);
  return cat ? `${cat[1]}-${Number(cat[1]) + 1}` : null;
}

/** The latest academic year of a text (a page often cites older years for its statistics). */
const latest = (years: string[]) => (years.length ? [...years].sort().at(-1)! : null);

// ───────────────────────────── course units ─────────────────────────────

const ECTS_RE = /(\d{1,2}(?:[.,]5)?)\s*(?:cr[ée]dits?\s*ects|ects|cr[ée]dits?|credits?)\b/i;
const HOURS_RE = /(\d{1,3}(?:[.,]\d)?)\s*h(?:eures?)?\b(?!\w)/gi;
const SEMESTER_RE = /\b(?:semestre|semester)\s*(\d{1,2})\b|\bS(\d{1,2})\b/i;
const YEAR_OF_MASTER_RE =
  /\b(?:master\s*([12])\b|M([12])\b|(premi[eè]re|1(?:re|ère)|deuxi[eè]me|seconde|2e|2ème) ann[ée]e)/i;
/** Pure metadata line under a title (Tours: « (UE)100 h - 13 Crédits ECTS »). */
const META_LINE =
  /^\((ue|[ée]l[ée]ment constitutif|ec|cours magistral|travaux dirig[ée]s|travaux pratiques|cm|td|tp)\)|^[\d,.\s]*(h|heures?)\b[^a-z]*(\d+\s*(cr[ée]dits?\s*)?ects)?$/i;
/** Element of a unit (ECUE, EC): not a unit itself. */
const ELEMENT_LINE = /^[-–]?\s*(ecue|ec|[ée]l[ée]ment constitutif)\b/i;
/** Context line: only a year and/or a semester (« Master 1 - Semestre 1 », « M2 », « Semestre 7 »). */
const CONTEXT_TOKENS =
  /master\s*[12]\b|\bm[12]\b|semestre\s*\d{1,2}|semester\s*\d{1,2}|(premi[eè]re|deuxi[eè]me|1re|2e|1ère|2ème)\s+ann[ée]e|ann[ée]e\s*[12]\b/gi;
const SUB_PART =
  /\b(CM|TD|TP|Cours Magistral|Travaux Dirig[ée]s|Travaux Pratiques)\s*(S\d{1,2})?\s*[A-Z0-9]{0,10}$/;

const num = (s: string) => Number(s.replace(',', '.'));
/** Placeholders of a choice (« UE 706 au choix », « CHOIX 1 UE EE », « Option »): not a unit. */
const CHOICE = /^(au choix|choix\b|options?\b|\d+ (ue|options?) au choix)|\bau choix\b/i;

function yearOfSemester(n: number | null): 1 | 2 | null {
  if (n === null) return null;
  if (n === 1 || n === 2 || n === 7 || n === 8) return 1;
  if (n === 3 || n === 4 || n === 9 || n === 10) return 2;
  return null;
}

function parseYear(line: string): 1 | 2 | null {
  const m = YEAR_OF_MASTER_RE.exec(line);
  if (!m) return null;
  if (m[1] || m[2]) return Number(m[1] ?? m[2]) as 1 | 2;
  return /premi|1re|1ère/i.test(m[3] ?? '') ? 1 : 2;
}

/** Cleans a unit title: codes, semester tokens, « UE 701 » prefix, trailing dashes. */
function cleanUnitTitle(t: string): string {
  return t
    .replace(/^•\s*/, '')
    .replace(/^UE\s*[\d.]*\s*[:\-–]?\s*/i, '')
    .replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,}\b/g, '') // ES00701T, DM1BTD24
    .replace(/\bS\d{1,2}\b/g, '')
    .replace(ECTS_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/(\s*-\s*\d{1,3}\s*h\s*\([^)]*\))+/gi, '')
    .replace(/[\s\-–:|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hoursOf(s: string): number | null {
  let total = 0;
  let found = false;
  for (const m of s.matchAll(HOURS_RE)) {
    total += num(m[1]!);
    found = true;
  }
  return found ? total : null;
}

/**
 * Units from text lines. A line is a unit when it carries ECTS, or starts with « UE », or is
 * followed by a metadata line typed « (UE) ». Elements of a unit (EC, CM, TD) are not units.
 */
export function unitsFromLines(lines: string[]): CourseUnit[] {
  const units: CourseUnit[] = [];
  let semester: number | null = null;
  let year: 1 | 2 | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.replace(/^•\s*/, '').trim();
    if (!raw) continue;
    if (!ECTS_RE.test(raw) && raw.length <= 80 && !/^UE\b/i.test(raw)) {
      const rest = raw
        .replace(CONTEXT_TOKENS, '')
        .replace(/\b[A-Z]{2,}\d[A-Z0-9]*\b/g, '')
        .replace(/[-–:·|(),.\s]/g, '');
      const semM = /(?:semestre|semester)\s*(\d{1,2})/i.exec(raw);
      const yM = parseYear(raw);
      if (rest === '' && (semM || yM)) {
        if (semM) semester = Number(semM[1]);
        else semester = null;
        year = yearOfSemester(semester) ?? yM ?? year;
        continue;
      }
    }
    const y = raw.length <= 140 && !ECTS_RE.test(raw) ? parseYear(raw) : null;
    if (y && !/^UE\b/i.test(raw)) {
      year = y;
      continue;
    }
    // « Semestre 1 : 9 UE (30 ECTS) »: a summary of the semester, not a unit
    const summary = /^(?:semestre|semester)\s*(\d{1,2})\s*[:–-]/i.exec(raw);
    if (summary) {
      semester = Number(summary[1]);
      year = yearOfSemester(semester) ?? year;
      continue;
    }
    if (META_LINE.test(raw)) continue; // consumed by the title above it
    if (ELEMENT_LINE.test(raw)) continue;
    const next = lines[i + 1]?.replace(/^•\s*/, '').trim() ?? '';
    const nextMeta = META_LINE.test(next) ? next : '';
    const typed =
      /^\(?\s*(ue|[ée]l[ée]ment constitutif|ec|cours magistral|travaux)/i
        .exec(nextMeta)?.[1]
        ?.toLowerCase() ?? null;
    if (typed && typed !== 'ue') continue; // element of a unit, or a CM/TD part
    if (SUB_PART.test(raw) && !ECTS_RE.test(raw)) continue;
    const meta = `${raw} ${nextMeta}`;
    const ects = ECTS_RE.exec(meta);
    const isUnit = !!ects || /^UE\b/i.test(raw) || typed === 'ue';
    if (!isUnit) continue;
    const ownSem = SEMESTER_RE.exec(raw);
    const sem = ownSem ? Number(ownSem[1] ?? ownSem[2]) : semester;
    let title = cleanUnitTitle(raw.replace(/\s*\((?:UE|[ée]l[ée]ment constitutif)\).*$/i, ''));
    if (title.length < 3 && /^UE\b/i.test(raw)) {
      // « UE 701 » / « ES00701T » / « Initiation aux outils de la recherche » on three lines
      for (let k = i + 1; k <= i + 2 && k < lines.length; k++) {
        const l = lines[k]!.replace(/^•\s*/, '').trim();
        if (/^[A-Z0-9]{5,}$/.test(l)) continue;
        if (/^UE\b/i.test(l) || /^(semestre|semester)\b/i.test(l) || META_LINE.test(l)) break;
        title = cleanUnitTitle(l);
        i = k;
        break;
      }
    }
    if (title.length < 3 || title.length > 160 || CHOICE.test(title)) continue;
    units.push({
      title,
      ects: ects ? num(ects[1]!) : null,
      semester: sem,
      year: yearOfSemester(sem) ?? year,
      hours:
        hoursOf(raw.replace(ECTS_RE, '')) ??
        (nextMeta ? hoursOf(nextMeta.replace(ECTS_RE, '')) : null),
    });
  }
  return units;
}

const COL = {
  title:
    /^(mati[eè]res?|intitul[ée]|libell[ée]|unit[ée]s?|ue|enseignements?|cours|modules?|[ée]l[ée]ments?)/i,
  ects: /^(ects|cr[ée]dits?)/i,
  semester: /^(semestres?|p[ée]riode)/i,
  hours: /^(cours|cm|td|tp|cours-td|cours-tp|td-tp|volume|heures|vh|total|h)\b/i,
  totalHours: /^(volume horaire|total|heures|vh)/i,
};

/** Units from a table whose header names the columns (title, ECTS, semester, hours). */
export function unitsFromTable(
  table: El,
  context: { semester: number | null; year: 1 | 2 | null },
): CourseUnit[] {
  const rows = queryAll(table, 'tr');
  const header = rows.find((r) => queryAll(r, 'th').length >= 2) ?? null;
  if (!header) return [];
  const cells = queryAll(header, 'th, td').map((c) => inlineText(c));
  const idx = (re: RegExp) => cells.findIndex((c) => re.test(c));
  let ti = idx(COL.title);
  const ei = idx(COL.ects);
  let ctx = context;
  const firstSem = SEMESTER_RE.exec(cells[0] ?? '');
  if (ti < 0 && firstSem) {
    // « SEMESTRE 2 EE ENERGIE ELECTRIQUE | Volume horaire | CM | TD | TP | ECTS »
    ti = 0;
    const n = Number(firstSem[1] ?? firstSem[2]);
    ctx = { semester: n, year: yearOfSemester(n) ?? parseYear(cells[0]!) ?? context.year };
  }
  if (ti < 0 || ei < 0) return []; // not a course table, or not sure enough
  const si = idx(COL.semester);
  const total = idx(COL.totalHours);
  const hourCols =
    total >= 0 && total !== ti
      ? [total]
      : cells
          .map((c, i) => (i !== ti && i !== ei && COL.hours.test(c) ? i : -1))
          .filter((i) => i >= 0);
  const out: CourseUnit[] = [];
  for (const r of rows) {
    if (r === header) continue;
    const tds = queryAll(r, 'td, th').filter((c) => c.parent === r);
    if (tds.length < cells.length - 1) continue; // detail rows (colspan)
    const title = cleanUnitTitle(inlineText(tds[ti]!));
    if (title.length < 3 || CHOICE.test(title)) continue;
    const ects = /(\d{1,2}(?:[.,]5)?)/.exec(inlineText(tds[ei] ?? ''));
    const semText = si >= 0 ? inlineText(tds[si] ?? '') : '';
    const semM = /(\d{1,2})/.exec(semText);
    const semester = semM ? Number(semM[1]) : ctx.semester;
    let hours = 0;
    let anyHours = false;
    for (const i of hourCols) {
      const v = /(\d{1,3}(?:[.,]\d)?)/.exec(inlineText(tds[i] ?? ''));
      if (v) {
        hours += num(v[1]!);
        anyHours = true;
      }
    }
    out.push({
      title,
      ects: ects ? num(ects[1]!) : null,
      semester,
      year: yearOfSemester(semester) ?? ctx.year,
      hours: anyHours ? hours : null,
    });
  }
  return out;
}

export function semestersOf(units: CourseUnit[]): SemesterBlock[] {
  const groups = new Map<string, { label: string; order: number; units: CourseUnit[] }>();
  for (const u of units) {
    const key = u.semester !== null ? `s${u.semester}` : u.year !== null ? `y${u.year}` : 'all';
    const label =
      u.semester !== null
        ? `${u.year ? `M${u.year} · ` : ''}Semestre ${u.semester}`
        : u.year !== null
          ? `M${u.year}`
          : 'Enseignements';
    const order = u.semester !== null ? u.semester : u.year !== null ? u.year * 100 : 1000;
    const g = groups.get(key) ?? { label, order, units: [] };
    g.units.push(u);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((g, position) => ({
      position,
      label: g.label,
      content: g.units
        .map((u) => {
          const facts = [
            u.ects !== null ? `${u.ects} ECTS` : null,
            u.hours !== null ? `${u.hours} h` : null,
          ]
            .filter(Boolean)
            .join(', ');
          return facts ? `${u.title} (${facts})` : u.title;
        })
        .join(' · '),
      units: g.units,
    }));
}

// ───────────────────────────── lists ─────────────────────────────

/** List items of the blocks (li, or « • » lines), personal data removed. */
function itemsOf(
  blocks: Block[],
  counter: { removed: number },
  noise: RegExp[] = DEFAULT_NOISE,
): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind !== 'node' || !isEl(b.node)) continue;
    const lis = b.node.tag === 'li' ? [b.node] : queryAll(b.node, 'li');
    for (const li of lis) {
      if (queryAll(li, 'li').length) continue; // keep the leaves
      const s = scrubPii(inlineText(li));
      counter.removed += s.removed;
      const t = s.text
        .replace(/^•\s*/, '')
        .replace(/\s*[;,.]$/, '')
        .trim();
      if (t.length < 3 || t.length > 200 || noise.some((re) => re.test(t))) continue;
      if (looksLikePersonNames(t)) {
        counter.removed++;
        continue;
      }
      out.push(t);
    }
  }
  return [...new Set(out)];
}

const EXAM_MODES: [RegExp, string][] = [
  [
    /\b(sur dossier|examen du dossier|dossier de candidature|s[ée]lection sur dossier|[ée]tude du dossier)\b/i,
    'Dossier',
  ],
  [/\bentretiens?\b/i, 'Entretien'],
  [/\b([ée]preuves? [ée]crites?|tests? [ée]crits?|examen [ée]crit)\b/i, 'Épreuve écrite'],
];

type AdmissionKind = keyof Omit<AdmissionLists, 'examModes'>;
function admissionKind(heading: string): AdmissionKind | null {
  const h = normHeading(heading);
  if (/^attendus/.test(h)) return 'expectations';
  if (/^(modalites de (selection|recrutement)|criteres|recrutement|selection)/.test(h))
    return 'selectionCriteria';
  if (/^(pre ?requis)/.test(h)) return 'requirements';
  if (
    /^(public|publics|niveaux? de recrutement|formations? requises?|diplomes? conseilles?)/.test(h)
  )
    return 'advisedDegrees';
  return null;
}

// ───────────────────────────── extraction ─────────────────────────────

const FACT_LANG = /^langues?( s)? d.?enseignement|^langues?$/;

export function extractSections(html: string | El, o: ExtractOptions = {}): PageExtraction {
  const noise = [...DEFAULT_NOISE, ...(o.noise ?? [])];
  const { root, blocks } = prepare(html, o);
  const counter = { removed: 0 };
  const urlYear = yearFromUrl(o.url);
  const pageYear = latest(academicYears(textOf(root)));
  const documentYear = urlYear ?? pageYear;

  // key facts (label → value)
  const facts: Record<string, string> = {};
  for (const sel of [o.facts, 'dt'].filter(Boolean) as string[]) {
    for (const label of queryAll(root, sel)) {
      const parent = label.parent;
      if (!parent) continue;
      const i = parent.children.indexOf(label);
      const value = parent.children.slice(i + 1).find((c) => isEl(c) || c.trim());
      if (!value) continue;
      const k = inlineText(label).replace(/\s*:$/, '');
      const v = scrubPii(isEl(value) ? inlineText(value) : value.trim());
      counter.removed += v.removed;
      if (k && v.text && k.length <= 60 && v.text.length <= 200 && !(k in facts)) facts[k] = v.text;
    }
  }

  const sections = cutSections(blocks);
  const rubrics: Partial<Record<Rubric, Field<string>>> = {};
  const bestWeight: Partial<Record<Rubric, number>> = {};
  const byRubric = new Map<Rubric, RawSection[]>();
  for (const s of sections) {
    if (s.rubric === 'debouches') continue; // a boundary only: outcomes are not collected
    const text = scrubText(
      cleanLines(s.blocks.map((b) => blockText(b)).join('\n'), noise).join('\n'),
      counter,
    );
    if (text.replace(/\s+/g, ' ').length < 20) continue; // empty or a single word: not certain
    const w = bestWeight[s.rubric] ?? 0;
    if (s.weight < w) continue;
    const list = s.weight > w ? [] : (byRubric.get(s.rubric) ?? []);
    list.push(s);
    byRubric.set(s.rubric, list);
    bestWeight[s.rubric] = s.weight;
    const prev = s.weight > w ? undefined : rubrics[s.rubric];
    const value = prev ? `${prev.value}\n\n${text}` : text;
    rubrics[s.rubric] = {
      value,
      evidence: evidenceExtract(`${prev ? prev.heading : s.heading} : ${value}`),
      heading: prev ? prev.heading : s.heading,
      year: latest(academicYears(value)) ?? documentYear,
    };
  }

  // languages: a « Langues » section or a key fact
  let languages: Field<string[]> | null = null;
  const langFact = Object.entries(facts).find(([k]) => FACT_LANG.test(normHeading(k)));
  const langSource = langFact
    ? { heading: langFact[0], text: langFact[1] }
    : rubrics.langues
      ? { heading: rubrics.langues.heading, text: rubrics.langues.value }
      : null;
  if (langSource) {
    const names = [
      ...new Set(
        [
          ...langSource.text.matchAll(
            /\b(fran[çc]ais|anglais|allemand|espagnol|italien|portugais|arabe|chinois|japonais|russe|english|french)\b/gi,
          ),
        ].map((m) => cap(normLang(m[1]!))),
      ),
    ];
    if (names.length)
      languages = {
        value: names,
        evidence: evidenceExtract(`${langSource.heading} : ${langSource.text}`),
        heading: langSource.heading,
        year: documentYear,
      };
  }

  // course units: tables first, then lines (tables are not read twice)
  let units: Field<CourseUnit[]> | null = null;
  const prog = byRubric.get('programme') ?? [];
  const progAll = sections.filter((s) => s.rubric === 'programme');
  const fromTables: CourseUnit[] = [];
  const fromLines: CourseUnit[] = [];
  for (const s of progAll) {
    let ctx = { semester: null as number | null, year: null as 1 | 2 | null };
    for (const b of s.blocks) {
      if (b.kind === 'heading') {
        const sm = SEMESTER_RE.exec(b.text);
        ctx = {
          semester: sm ? Number(sm[1] ?? sm[2]) : ctx.semester,
          year: parseYear(b.text) ?? ctx.year,
        };
        continue;
      }
      if (!isEl(b.node)) continue;
      const tables = b.node.tag === 'table' ? [b.node] : queryAll(b.node, 'table');
      for (const t of tables) fromTables.push(...unitsFromTable(t, ctx));
    }
    fromLines.push(
      ...unitsFromLines(cleanLines(s.blocks.map((b) => blockText(b, true)).join('\n'), noise)),
    );
  }
  // Title-case course names (« Ressources Humaines ») are not person names: only mails and phones are scrubbed.
  const all = dedupeUnits([...fromTables, ...fromLines])
    .map((u) => ({ ...u, title: scrubText(u.title, counter) }))
    .filter((u) => u.title.length >= 3);
  // Certain enough: at least two units, half of them with ECTS or a semester.
  const located = all.filter((u) => u.ects !== null || u.semester !== null).length;
  if (all.length >= 2 && located * 2 >= all.length) {
    const s = progAll[0]!;
    const heading = (prog[0] ?? s).heading;
    const value = all;
    const sample = value
      .slice(0, 4)
      .map((u) => `${u.title}${u.ects !== null ? ` (${u.ects} ECTS)` : ''}`)
      .join(' · ');
    const year = rubrics.programme?.year ?? documentYear;
    units = { value, evidence: evidenceExtract(`${heading} : ${sample}`), heading, year };
  }
  const semesters = units ? { ...units, value: semestersOf(units.value) } : null;

  // admission lists
  const admission: AdmissionLists = {};
  for (const s of sections.filter((x) => x.rubric === 'admission')) {
    const kind = admissionKind(s.heading);
    if (!kind) continue;
    const items = itemsOf(s.blocks, counter, noise);
    if (!items.length) continue;
    const prev = admission[kind];
    const value = prev ? [...new Set([...prev.value, ...items])] : items;
    admission[kind] = {
      value,
      evidence: evidenceExtract(`${s.heading} : ${value.join(' ; ')}`),
      heading: prev?.heading ?? s.heading,
      year: documentYear,
    };
  }
  if (rubrics.admission) {
    const modes = EXAM_MODES.filter(([re]) => re.test(rubrics.admission!.value)).map(
      ([, label]) => label,
    );
    if (modes.length)
      admission.examModes = {
        value: modes,
        evidence: rubrics.admission.evidence,
        heading: rubrics.admission.heading,
        year: rubrics.admission.year,
      };
  }

  const found = new Set<Rubric>(Object.keys(rubrics) as Rubric[]);
  if (languages) found.add('langues');
  if (units) found.add('programme');
  return {
    rubrics,
    units,
    semesters,
    admission,
    languages,
    facts,
    documentYear,
    rubricCount: found.size,
    piiRemoved: counter.removed,
  };
}

function scrubText(text: string, counter: { removed: number }): string {
  const s = scrubPii(text);
  counter.removed += s.removed;
  return s.text;
}

function dedupeUnits(units: CourseUnit[]): CourseUnit[] {
  const seen = new Set<string>();
  return units.filter((u) => {
    const k = `${normHeading(u.title)}|${u.semester ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const normLang = (s: string) => {
  const l = s.toLowerCase().replace('ç', 'c');
  return l === 'english' ? 'anglais' : l === 'french' || l === 'francais' ? 'français' : l;
};
