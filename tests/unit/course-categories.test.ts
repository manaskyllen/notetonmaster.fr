import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  classifyCourse,
  COURSE_CATEGORIES,
  disciplineCategory,
} from '@/lib/domain/course-categories';

/**
 * Real course titles read on university sites and booklets (patrimoine, droit, informatique,
 * biologie, sciences économiques et sociales / MEEF, sciences de l'information, cosmétique),
 * with the mention they belong to.
 */
const PATRIMOINE = 'Culture, patrimoine et médiation';
const DROIT = 'Droit pénal et sciences criminelles';
const INFO = 'Informatique';
const BIO = 'Biologie-santé';
const SES = 'Métiers de l’enseignement, de l’éducation et de la formation (MEEF), second degré';
const DOC = 'Sciences de l’information et des bibliothèques';
const CHIMIE = 'Chimie';

const CASES: [string, string, string][] = [
  // patrimoine (Nantes, livret UFR Histoire)
  ['Histoire de la notion de patrimoine', PATRIMOINE, 'CORE'],
  ['Conservation et restauration', PATRIMOINE, 'CORE'],
  ['Droit de l’urbanisme', PATRIMOINE, 'LAW_ECONOMICS'],
  ['Montage de projet culturel', PATRIMOINE, 'PROJECTS'],
  ['Humanités numériques', PATRIMOINE, 'DIGITAL'],
  ['Anglais + LV2', PATRIMOINE, 'LANGUAGES'],
  ['Gestion de la culture', PATRIMOINE, 'LAW_ECONOMICS'],
  ['Voyage d’étude', PATRIMOINE, 'PROJECTS'],
  ['Méthodologie du mémoire', PATRIMOINE, 'METHODS'],
  // droit (Montpellier)
  ['Droit pénal des affaires', DROIT, 'CORE'],
  ['Procédure pénale 1 : le déroulement du procès pénal', DROIT, 'CORE'],
  ['Science et sociologie du crime et profilage', DROIT, 'CORE'],
  ['Formation à la recherche et par la recherche', DROIT, 'METHODS'],
  ['Droit privé du numérique', DROIT, 'DIGITAL'],
  ['Langue', DROIT, 'LANGUAGES'],
  ['Projet tutoré', DROIT, 'PROJECTS'],
  // informatique (Université Côte d'Azur)
  ['AI: Models and Applications (EN)', INFO, 'CORE'],
  ['Advanced Algorithms (EN)', INFO, 'CORE'],
  ['Data Science for Complex Networks (EN)', INFO, 'CORE'],
  ['English (EN)', INFO, 'LANGUAGES'],
  ['Gestion de projet', INFO, 'PROJECTS'],
  ['Logic for AI (EN)', INFO, 'CORE'],
  ['Alternance', INFO, 'PROJECTS'],
  // biologie (Orléans, Tours)
  ['Immunologie 2', BIO, 'CORE'],
  ['Biostatistiques 1', BIO, 'METHODS'],
  ['Outils bioinformatiques', BIO, 'DIGITAL'],
  ['Management Qualité 1', BIO, 'LAW_ECONOMICS'],
  ['Connaissance de l’entreprise', BIO, 'LAW_ECONOMICS'],
  // SES / MEEF (UPEC)
  ['Pédagogie et didactique des S.E.S. 1', SES, 'CORE'],
  ['Langue vivante étrangère 1 : Communication orale', SES, 'LANGUAGES'],
  ['Construction du mémoire 1 - S’initier à la démarche scientifique', SES, 'METHODS'],
  ['Les outils numériques pour l’enseignement des SES', SES, 'DIGITAL'],
  ['Savoirs fondamentaux en économie 1', SES, 'LAW_ECONOMICS'],
  // sciences de l'information (Enssib)
  ['Culture(s) du document', DOC, 'CORE'],
  ['Épistémologie et modélisation de l’information', DOC, 'METHODS'],
  ['Les données dans le métier de l’information', DOC, 'DIGITAL'],
  ['Anglais professionnel', DOC, 'LANGUAGES'],
  // chimie (UVSQ)
  ['Dermatologie', CHIMIE, 'CORE'],
  ['Veille réglementaire', CHIMIE, 'CORE'],
  ['Conduite de projet innovation et biotechnologies', CHIMIE, 'PROJECTS'],
  ['Statistiques', CHIMIE, 'METHODS'],
];

describe('classifyCourse on real titles of 7 disciplines', () => {
  it.each(CASES)('%s (%s) → %s', (label, mention, expected) => {
    expect(classifyCourse(label, { mentionName: mention })).toBe(expected);
  });
  it('covers at least 30 titles and 5 disciplines', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CASES.map((c) => c[1])).size).toBeGreaterThanOrEqual(5);
  });
  it('ignores accents and case', () => {
    expect(classifyCourse('MÉTHODOLOGIE DE LA RECHERCHE')).toBe('METHODS');
    expect(classifyCourse('numerique et societe')).toBe('DIGITAL');
  });
});

describe('the discipline of the mention is the core', () => {
  it('law courses are the core of a law master, not of a heritage one', () => {
    expect(disciplineCategory('Droit des affaires')).toBe('LAW_ECONOMICS');
    expect(disciplineCategory('Informatique')).toBe('DIGITAL');
    expect(
      disciplineCategory('Langues, littératures et civilisations étrangères et régionales'),
    ).toBe('LANGUAGES');
    expect(disciplineCategory('Culture, patrimoine et médiation')).toBeNull();
    expect(classifyCourse('Droit des contrats', { mentionName: 'Droit privé' })).toBe('CORE');
    expect(classifyCourse('Droit des contrats', { mentionName: 'Histoire' })).toBe('LAW_ECONOMICS');
  });
});

describe('labels and colours', () => {
  it('six categories in the validated order and colours', () => {
    expect(COURSE_CATEGORIES.map((c) => c.color)).toEqual([
      '#5A3BF0',
      '#eb6834',
      '#1baf7a',
      '#eda100',
      '#e87ba4',
      '#2a78d6',
    ]);
  });
  it('the core takes the short name of the mention', () => {
    expect(categoryLabel('CORE')).toBe('Cœur du master');
    expect(categoryLabel('CORE', 'Patrimoine')).toBe('Patrimoine');
    expect(categoryLabel('LANGUAGES', 'Patrimoine')).toBe('Langues');
  });
});
