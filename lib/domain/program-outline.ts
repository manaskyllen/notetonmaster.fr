/**
 * Programme of a parcours, by year (Programme tab of a fiche parcours). Pure functions, tested:
 * - reading a semester label (« M1 · Semestre 1 », « Semestre 9 »);
 * - milestones (internship, thesis…) in a text: « stage de 3 mois », « 3 à 6 mois », « mémoire
 *   d'environ 80 pages », « soutenu en juin »;
 * - the split of the former free text of a semester into courses and milestones (migration);
 * - the facts of the tab (duration, internships, theses, certification) and the years to show.
 */
import type { CourseCategory, MilestoneKind } from '@/lib/db/generated/enums';
import { classifyCourse, normLabel } from './course-categories';

// ───────────────────────────── semesters ─────────────────────────────

/** Year (1, 2) and number (1–4) of a semester label; LMD numbers 7–10 become 1–4. */
export function semesterIdentity(label: string): { year: 1 | 2 | null; number: number | null } {
  const sem = /semestre\s*(\d{1,2})|\bS(\d{1,2})\b/i.exec(label);
  let n = sem ? Number(sem[1] ?? sem[2]) : null;
  if (n !== null && n >= 7 && n <= 10) n -= 6;
  if (n !== null && (n < 1 || n > 4)) n = null;
  const y = /\bM\s?([12])\b|master\s*([12])\b/i.exec(label);
  const year = y ? (Number(y[1] ?? y[2]) as 1 | 2) : n !== null ? (n <= 2 ? 1 : 2) : null;
  return { year, number: n };
}

// ───────────────────────────── milestones ─────────────────────────────

export interface MilestoneDraft {
  kind: MilestoneKind;
  title: string;
  detail: string | null;
  minMonths: number | null;
  maxMonths: number | null;
  pages: number | null;
  period: string | null;
  /** Year of the master the text gives (« en M1 »), or null. */
  year: 1 | 2 | null;
}

const MONTHS =
  'janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre';
const num = (s: string) => Number(s.replace(',', '.'));
const fmt = (n: number) => String(n).replace('.', ',');
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Kind of a clause that starts with a milestone word, or null. */
function kindOf(clause: string, loose: boolean): MilestoneKind | null {
  const n = normLabel(clause).replace(/^(un|une|le|la|les|des|puis|et)\s+/, '');
  if (/^stages?\b/.test(n)) return 'INTERNSHIP';
  if (/^memoires?\b/.test(n)) return 'THESIS';
  if (!loose) return null;
  if (/^voyages? d ?etudes?\b/.test(n)) return 'STUDY_TRIP';
  if (/^projets? (tutore|tuteure)/.test(n)) return 'PROJECT';
  if (/^(preparation (a|de) la )?certification\b/.test(n)) return 'CERTIFICATION';
  return null;
}

/**
 * One milestone from a clause (« Stage de 3 mois minimum en M1 », « mémoire d'environ 50 pages
 * soutenu en juin »). `loose` also accepts projects and certifications (rubric texts).
 */
export function parseMilestone(clause: string, loose = false): MilestoneDraft | null {
  const text = clause
    .replace(/\s+/g, ' ')
    .replace(/[.;:]+$/, '')
    .trim();
  const kind = kindOf(text, loose);
  if (!kind) return null;
  let minMonths: number | null = null;
  let maxMonths: number | null = null;
  let durationText = '';
  const range = /(\d+(?:[.,]5)?)\s*(?:à|a|-|–)\s*(\d+(?:[.,]5)?)\s*(mois|semaines)/i.exec(text);
  const single = /(\d+(?:[.,]5)?)\s*(mois|semaines)(\s+(minimum|au moins|maximum|au plus))?/i.exec(
    text,
  );
  const toMonths = (v: number, unit: string) =>
    /semaine/i.test(unit) ? Math.round((v / 4.33) * 2) / 2 : v;
  if (range) {
    minMonths = toMonths(num(range[1]!), range[3]!);
    maxMonths = toMonths(num(range[2]!), range[3]!);
    durationText = range[0];
  } else if (single) {
    const v = toMonths(num(single[1]!), single[2]!);
    const bound = single[4]?.toLowerCase() ?? '';
    if (/minimum|au moins/.test(bound)) minMonths = v;
    else if (/maximum|au plus/.test(bound)) maxMonths = v;
    else minMonths = maxMonths = v;
    durationText = single[0];
  } else if (/\bau moins\s+(\d+)/i.test(text)) {
    // « au moins 12 semaines » is caught above; nothing else is a duration
  }
  const pagesM = /(environ|d['’]environ|≈|~|de)?\s*(\d{2,3})\s*pages/i.exec(text);
  const pages = pagesM ? Number(pagesM[2]) : null;
  const periodM = new RegExp(
    `(?<![\\p{L}])(soutenu|soutenue|soutenance|évalué|évaluée|evalue|rendu|rendue|présenté|présentée)s?\\s+(en|au mois de|à la fin de|fin)\\s+(${MONTHS})`,
    'iu',
  ).exec(text);
  const period = periodM
    ? `${periodM[1]!.toLowerCase()} ${periodM[2]!.toLowerCase()} ${periodM[3]!.toLowerCase()}`
    : null;
  const yearM = /\b(?:en|du|de)\s+(?:M\s?([12])|master\s*([12]))\b/i.exec(text);
  const year = yearM ? (Number(yearM[1] ?? yearM[2]) as 1 | 2) : null;

  // Title: generated from the figures, or the clause itself (« Stage ou mémoire »)
  let title: string;
  if (kind === 'INTERNSHIP' && (minMonths !== null || maxMonths !== null)) {
    title =
      minMonths !== null && maxMonths !== null && minMonths !== maxMonths
        ? `Stage de ${fmt(minMonths)} à ${fmt(maxMonths)} mois`
        : minMonths !== null && maxMonths === null
          ? `Stage de ${fmt(minMonths)} mois minimum`
          : maxMonths !== null && minMonths === null
            ? `Stage de ${fmt(maxMonths)} mois maximum`
            : `Stage de ${fmt(minMonths!)} mois`;
  } else if (kind === 'THESIS' && pages !== null) {
    title = `Mémoire d’environ ${pages} pages`;
  } else if (kind === 'STUDY_TRIP') {
    title = 'Voyage d’étude';
  } else {
    title = cap(
      text
        .replace(/^(un|une|le|la|les|des|puis|et)\s+/i, '')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+\d+\s*C\b.*$/, '')
        .replace(new RegExp(`\\s*(${periodM?.[0] ?? '\\u0000'}).*$`), '')
        .trim(),
    );
    if (title.length > 80) title = `${title.slice(0, 78).replace(/\s+\S*$/, '')}…`;
  }
  // Detail: the period, or what the clause says after the duration (« en structure patrimoniale »)
  let detail: string | null = period ? cap(period) : null;
  if (!detail && durationText) {
    const rest = text
      .slice(text.indexOf(durationText) + durationText.length)
      .replace(/^\s*(minimum|au moins|maximum|au plus)\b/i, '')
      .replace(/\b(?:en|du|de)\s+(?:M\s?[12]|master\s*[12])\b/gi, '')
      .replace(/^[\s,–-]+/, '')
      .trim();
    if (rest && rest.length <= 80 && /^(en|dans|au|à|a|auprès)\b/i.test(rest)) detail = cap(rest);
  }
  return { kind, title, detail, minMonths, maxMonths, pages, period, year };
}

/** Clauses of a text: sentences, then commas or « et » before a milestone word. */
export function clauses(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .flatMap((s) =>
      s.split(
        /,\s+(?=(?:un |une |le |la |puis |et )?(?:stages?|m[ée]moires?|voyages? d|projets? tutor|certification)\b)|\s+(?:et|puis)\s+(?=(?:un |une |le |la )?(?:stages?|m[ée]moires?|voyages? d)\b)/i,
      ),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Milestones of a rubric text (Stages, Mémoire): every clause that starts with one. */
export function milestonesFromText(text: string): MilestoneDraft[] {
  const out: MilestoneDraft[] = [];
  for (const c of clauses(text)) {
    // « Stage de 3 mois minimum en M1, stage de 3 à 6 mois en M2. » or a longer sentence where the
    // milestone is not the first word: look for its start
    const start =
      /\b(un |une )?(stages?|m[ée]moires?|voyages? d['’]?\s?[ée]tudes?|projets? tutor[ée]s?|certification)\b/i.exec(
        c,
      );
    if (!start) continue;
    const m = parseMilestone(c.slice(start.index), true);
    if (m) out.push(m);
  }
  // the same milestone twice (« stage » in two sentences) is kept once, the most precise
  const seen = new Map<string, MilestoneDraft>();
  for (const m of out) {
    const key = `${m.kind}|${m.year ?? ''}|${m.minMonths ?? ''}|${m.maxMonths ?? ''}|${m.pages ?? ''}`;
    if (!seen.has(key)) seen.set(key, m);
  }
  return [...seen.values()];
}

// ───────────────────────────── courses ─────────────────────────────

export interface CourseDraft {
  label: string;
  ects: number | null;
  hours: number | null;
}

/** Splits on separators outside parentheses. */
function splitOutside(s: string, seps: string[]): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '(' || ch === '«') depth++;
    else if ((ch === ')' || ch === '»') && depth > 0) depth--;
    const sep = depth === 0 ? seps.find((x) => s.startsWith(x, i)) : undefined;
    if (sep) {
      out.push(cur);
      cur = '';
      i += sep.length - 1;
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** A course from one item of the former text: « Droit A (6 ECTS, 24 h) », « … 6C + 2C (48 h) ». */
export function courseOf(item: string): CourseDraft | null {
  let label = item
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, '')
    .trim();
  let ects: number | null = null;
  let hours: number | null = null;
  const facts = /\s*\((\d+(?:[.,]5)?)\s*ECTS(?:,\s*(\d+(?:[.,]\d)?)\s*h)?\)\s*$/i.exec(label);
  if (facts) {
    ects = num(facts[1]!);
    hours = facts[2] ? num(facts[2]) : null;
    label = label.slice(0, facts.index);
  }
  const h = /\s*\((\d+(?:[.,]\d)?)\s*h\)\s*$/i.exec(label);
  if (h) {
    hours = num(h[1]!);
    label = label.slice(0, h.index);
  }
  // Montpellier: « 6C + 2C », « obligatoire : 2C »
  const c =
    /\s*(?:obligatoire\s*:\s*)?(\d+(?:[.,]5)?)\s*C\b(?:\s*\+\s*(\d+(?:[.,]5)?)\s*C\b)?\s*$/.exec(
      label,
    );
  if (c) {
    ects = num(c[1]!) + (c[2] ? num(c[2]) : 0);
    label = label.slice(0, c.index);
  }
  label = label
    .replace(/\s*\((?:[^()]*\d+\s*h[^()]*(?:CM|TD|TP)[^()]*|\s*-\s*\d+h|\d+h\s*-\s*)\)/gi, '')
    .replace(/\s+\d+(?:[.,]\d)?\s*h\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s:–-]+$/, '')
    .trim();
  if (label.length < 2) return null;
  return { label: cap(label), ects, hours };
}

/**
 * The former free text of a semester, split into courses and milestones: on « · » or « ; » when
 * the text has them, otherwise on commas (outside parentheses and quotes). An item that starts
 * with « stage », « mémoire » or « voyage d'étude » is a milestone, the others are courses.
 */
export function splitLegacySemester(content: string): {
  courses: CourseDraft[];
  milestones: MilestoneDraft[];
} {
  const text = content.trim().replace(/\.$/, '');
  if (!text) return { courses: [], milestones: [] };
  const seps = / · |;/.test(text) ? [' · ', ';'] : [','];
  const courses: CourseDraft[] = [];
  const milestones: MilestoneDraft[] = [];
  for (const item of splitOutside(text, seps)) {
    const m = parseMilestone(item);
    if (m) {
      milestones.push(m);
      continue;
    }
    const c = courseOf(item);
    if (c) courses.push(c);
  }
  return { courses, milestones };
}

/** Category of a milestone in the theme filter. */
export function milestoneCategory(kind: MilestoneKind): CourseCategory {
  return kind === 'THESIS' ? 'METHODS' : 'PROJECTS';
}

export { classifyCourse };

// ───────────────────────────── facts and years ─────────────────────────────

export interface OutlineCourse {
  id: string;
  label: string;
  ects: number | null;
  category: CourseCategory;
}

export interface OutlineMilestone {
  id: string;
  kind: MilestoneKind;
  title: string;
  detail: string | null;
  minMonths: number | null;
  maxMonths: number | null;
  pages: number | null;
}

export interface OutlineSemester {
  id: string;
  label: string;
  title: string | null;
  year: number | null;
  number: number | null;
  ects: number;
  courses: OutlineCourse[];
  milestones: OutlineMilestone[];
}

export interface Fact {
  key: 'duration' | 'internships' | 'theses' | 'certification';
  value: string;
  label: string;
}

const yearOf = (s: OutlineSemester) => s.year ?? semesterIdentity(s.label).year;

/** Semesters shown: a parcours that starts in M2 only shows M2. */
export function shownSemesters(semesters: OutlineSemester[], entryLevel: 'M1' | 'M2') {
  return entryLevel === 'M2' ? semesters.filter((s) => yearOf(s) !== 1) : semesters;
}

function durationOf(m: OutlineMilestone): string | null {
  const { minMonths: a, maxMonths: b } = m;
  if (a !== null && b !== null && a !== b) return `${fmt(a)} à ${fmt(b)} mois`;
  if (a !== null) return `${fmt(a)} mois${b === null ? ' minimum' : ''}`;
  if (b !== null) return `${fmt(b)} mois maximum`;
  return null;
}

const where = (y: number | null) => (y ? `en M${y}` : '');

/** The four facts of the tab, computed; a fact is left out when it is not known. */
export function programmeFacts(
  semesters: OutlineSemester[],
  program: { entryLevel: 'M1' | 'M2'; durationYears: number; ects: number | null },
): Fact[] {
  const facts: Fact[] = [];
  const shown = shownSemesters(semesters, program.entryLevel);
  if (shown.length) {
    const years = program.entryLevel === 'M2' ? 1 : program.durationYears;
    const expected = years * 2;
    const numbered = shown.filter((s) => s.number !== null);
    const ects =
      numbered.length === expected
        ? numbered.reduce((a, s) => a + s.ects, 0)
        : program.entryLevel === 'M2'
          ? 60
          : (program.ects ?? expected * 30);
    facts.push({
      key: 'duration',
      value: `${years} an${years > 1 ? 's' : ''} · ${ects} ECTS`,
      label: `${expected} semestres`,
    });
  }
  const all = shown.flatMap((s) => s.milestones.map((m) => ({ m, year: yearOf(s) })));
  const internships = all.filter((x) => x.m.kind === 'INTERNSHIP');
  if (internships.length) {
    const parts = internships.map((x) =>
      [durationOf(x.m), where(x.year)].filter(Boolean).join(' '),
    );
    facts.push({
      key: 'internships',
      value: `${internships.length} stage${internships.length > 1 ? 's' : ''}`,
      label: joinParts(parts) || 'Durée non précisée',
    });
  }
  const theses = all.filter((x) => x.m.kind === 'THESIS');
  if (theses.length) {
    const withPages = theses.filter((x) => x.m.pages !== null);
    const label =
      withPages.length === theses.length
        ? theses.map((x) => `≈ ${x.m.pages} pages`).join(', puis ')
        : joinParts(theses.map((x) => where(x.year)).filter(Boolean));
    facts.push({
      key: 'theses',
      value: `${theses.length} mémoire${theses.length > 1 ? 's' : ''}`,
      label: label || 'Longueur non précisée',
    });
  }
  const cert =
    all.find((x) => x.m.kind === 'CERTIFICATION') ??
    shown
      .flatMap((s) => s.courses.map((c) => ({ c, year: yearOf(s) })))
      .find((x) => /^(pr[ée]paration (à|a|de) la )?certification\b/i.test(x.c.label));
  if (cert) {
    const raw = 'm' in cert ? cert.m.title : cert.c.label;
    const name = raw
      .replace(/^(pr[ée]paration (à|a|de) la )?certification\s*(de |d['’]|du |en |:)?\s*/i, '')
      .trim();
    facts.push({
      key: 'certification',
      value: name ? cap(name) : 'Certification',
      label: `Certification préparée${cert.year ? ` en M${cert.year}` : ''}`,
    });
  }
  return facts;
}

function joinParts(parts: string[]): string {
  return parts.join(', ');
}

export interface OutlineYear {
  /** « M1 », « M2 », or « UE » when the source does not tell the year. */
  label: string;
  aria: string;
  semesters: OutlineSemester[];
}

/** Semesters grouped by year, in order. */
export function outlineYears(semesters: OutlineSemester[], entryLevel: 'M1' | 'M2'): OutlineYear[] {
  const groups = new Map<string, OutlineYear>();
  for (const s of shownSemesters(semesters, entryLevel)) {
    const y = yearOf(s);
    const key = y ? `M${y}` : 'UE';
    const g = groups.get(key) ?? {
      label: key,
      aria: y === 1 ? 'Première année' : y === 2 ? 'Deuxième année' : 'Enseignements',
      semesters: [],
    };
    g.semesters.push(s);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Categories present in the shown programme (courses and milestones), in display order. */
export function presentCategories(
  semesters: OutlineSemester[],
  order: CourseCategory[],
): CourseCategory[] {
  const set = new Set<CourseCategory>();
  for (const s of semesters) {
    for (const c of s.courses) set.add(c.category);
    for (const m of s.milestones) set.add(milestoneCategory(m.kind));
  }
  return order.filter((c) => set.has(c));
}

/** First year of an academic year (« 2022-2023 » → 2022), or null. */
export function academicStart(year: string | null | undefined): number | null {
  const m = /(20\d{2})/.exec(year ?? '');
  return m ? Number(m[1]) : null;
}

/** True when the document is more than 2 academic years old. */
export function isStaleProgramme(sourceYear: string | null | undefined, now = new Date()): boolean {
  const start = academicStart(sourceYear);
  if (start === null) return false;
  const current = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return current - start > 2;
}

// ───────────────────────────── university sites ─────────────────────────────

/** A semester read on a university site, with its courses and milestones (worker → database). */
export interface SemesterPlan {
  position: number;
  label: string;
  content: string;
  courses: CourseDraft[];
  milestones: Omit<MilestoneDraft, 'year'>[];
}

/**
 * Courses and milestones of the semesters read on a page (`semestersOf`), plus the milestones of
 * the « Stages » rubric: a unit titled « Stage » or « Mémoire » is a milestone; a rubric milestone
 * goes to the last semester of its year (or of the programme), replacing a bare unit of the same
 * kind there (« Stage (30 ECTS) » + « stage de 4 à 6 mois » = one internship).
 */
export function programmeFromSemesters(
  semesters: {
    position: number;
    label: string;
    content: string;
    units: { title: string; ects: number | null; hours: number | null }[];
  }[],
  rubricText: string | null,
): SemesterPlan[] {
  const out: SemesterPlan[] = semesters.map((s) => {
    const courses: CourseDraft[] = [];
    const milestones: Omit<MilestoneDraft, 'year'>[] = [];
    for (const u of s.units) {
      const m = parseMilestone(u.title);
      if (m) {
        const { year: _y, ...rest } = m;
        void _y;
        milestones.push(rest);
      } else courses.push({ label: cap(u.title), ects: u.ects, hours: u.hours });
    }
    return { position: s.position, label: s.label, content: s.content, courses, milestones };
  });
  if (!rubricText || !out.length) return out;
  for (const m of milestonesFromText(rubricText)) {
    const { year, ...rest } = m;
    const candidates = out.filter((s) => !year || semesterIdentity(s.label).year === year);
    const target = candidates.at(-1) ?? (year ? null : out.at(-1));
    if (!target) continue;
    const bare = target.milestones.findIndex(
      (x) => x.kind === m.kind && x.minMonths === null && x.maxMonths === null && x.pages === null,
    );
    if (bare >= 0) target.milestones[bare] = rest;
    else if (!target.milestones.some((x) => x.title === rest.title)) target.milestones.push(rest);
  }
  return out;
}
