/**
 * Themes of the courses of a programme (Programme tab), for every discipline. Six fixed
 * categories with their colours; a course is classified by keywords
 * (no accent, no case), tested in a fixed order, the most specific first.
 *
 * « Cœur du master » is the default, and also the category of the discipline itself: in a law
 * master, a law course is « Cœur du master », not « Droit, gestion et économie ».
 *
 * Changing the table changes the version: courses whose category was not chosen by hand are
 * reclassified by `reclassifyCourses` (lib/catalog/program-courses.ts).
 */
import type { CourseCategory } from '@/lib/db/generated/enums';

export const COURSE_CATEGORIES_VERSION = '2026-11';

export interface CategoryInfo {
  id: CourseCategory;
  label: string;
  color: string;
}

/** Display order of the filters and legends. */
export const COURSE_CATEGORIES: CategoryInfo[] = [
  { id: 'CORE', label: 'Cœur du master', color: '#5A3BF0' },
  { id: 'METHODS', label: 'Méthodes et recherche', color: '#eb6834' },
  { id: 'LAW_ECONOMICS', label: 'Droit, gestion et économie', color: '#1baf7a' },
  { id: 'DIGITAL', label: 'Numérique et données', color: '#eda100' },
  { id: 'LANGUAGES', label: 'Langues', color: '#e87ba4' },
  { id: 'PROJECTS', label: 'Projets et terrain', color: '#2a78d6' },
];

export const CATEGORY_BY_ID = Object.fromEntries(COURSE_CATEGORIES.map((c) => [c.id, c])) as Record<
  CourseCategory,
  CategoryInfo
>;

/** Lower case, no accent, apostrophes and dashes as spaces. */
export function normLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`\-–_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Keywords, as regular expressions on the normalised label. `\b` is a word start; a keyword
 * without final `\b` is a stem (« statisti » for statistique, biostatistiques…).
 */
const RULES: [Exclude<CourseCategory, 'CORE'>, RegExp][] = [
  [
    'LANGUAGES',
    /\b(anglais|english|lv ?[12]\b|langues? (vivantes?|etrangeres?)|langues?\b|espagnol|allemand|italien|portugais|chinois|japonais|arabe|russe|coreen|fle\b|toeic|toefl|cles\b)/,
  ],
  [
    'PROJECTS',
    /\b(stages?\b|projets?\b|tutore|tuteure|ateliers?\b|terrain|voyages?\b|professionnalisation|insertion professionnelle|certification|alternance|apprentissage\b|mise en situation|immersion)/,
  ],
  [
    'METHODS',
    /\b(methodolog|methodes?\b|recherche|epistemolog|statisti|biostatisti|econometr|seminaires?\b|memoires?\b|bibliograph|outils de la recherche|demarche scientifique)/,
  ],
  [
    'DIGITAL',
    /\b(numerique|digital|web\b|donnees|data\b|(bio)?informati(que|ques|cien)|programmation|programming|algorithm|logiciels?\b|software|sig\b|systemes? d information|humanites numeriques|intelligence artificielle|\bia\b|machine learning|apprentissage automatique|python|bases? de donnees|cyber|bureautique|developpement (web|logiciel|d applications))/,
  ],
  [
    'LAW_ECONOMICS',
    /\b(droits?\b|juridique|gestion|management|manager|econom|finance|financ|marketing|comptab|fiscal|contrats?\b|entreprises?\b|audit|budget|ressources humaines|commerce|commercial)/,
  ],
];

/** Categories a mention name can belong to (its own discipline). */
const DISCIPLINE_RULES: CourseCategory[] = ['LANGUAGES', 'DIGITAL', 'LAW_ECONOMICS'];

/** Category of the discipline of a mention (« Droit pénal… » → LAW_ECONOMICS), or null. */
export function disciplineCategory(mentionName: string | null | undefined): CourseCategory | null {
  if (!mentionName) return null;
  const n = normLabel(mentionName);
  for (const id of DISCIPLINE_RULES) {
    const re = RULES.find(([c]) => c === id)![1];
    if (re.test(n)) return id;
  }
  return null;
}

/** Category of a course label; the category of the mention's own discipline becomes CORE. */
export function classifyCourse(
  label: string,
  ctx: { mentionName?: string | null } = {},
): CourseCategory {
  const n = normLabel(label);
  const own = disciplineCategory(ctx.mentionName);
  for (const [id, re] of RULES) if (re.test(n)) return id === own ? 'CORE' : id;
  return 'CORE';
}

/** Label of a category on the fiche: CORE takes the short name of the mention when it has one. */
export function categoryLabel(id: CourseCategory, mentionShortLabel?: string | null): string {
  if (id === 'CORE' && mentionShortLabel?.trim()) return mentionShortLabel.trim();
  return CATEGORY_BY_ID[id].label;
}
