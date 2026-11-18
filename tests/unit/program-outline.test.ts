import { describe, expect, it } from 'vitest';
import { COURSE_CATEGORIES } from '@/lib/domain/course-categories';
import {
  courseOf,
  isStaleProgramme,
  milestonesFromText,
  outlineYears,
  parseMilestone,
  presentCategories,
  programmeFacts,
  semesterIdentity,
  splitLegacySemester,
  type OutlineSemester,
} from '@/lib/domain/program-outline';

describe('semesterIdentity', () => {
  it('reads year and number, LMD numbers included', () => {
    expect(semesterIdentity('M1 · Semestre 1')).toEqual({ year: 1, number: 1 });
    expect(semesterIdentity('M2 · Semestre 4')).toEqual({ year: 2, number: 4 });
    expect(semesterIdentity('Semestre 9')).toEqual({ year: 2, number: 3 });
    expect(semesterIdentity('M1 · Semestre 8')).toEqual({ year: 1, number: 2 });
    expect(semesterIdentity('M2')).toEqual({ year: 2, number: null });
    expect(semesterIdentity('Enseignements')).toEqual({ year: null, number: null });
  });
});

describe('milestones', () => {
  it('« stage de 3 mois », « 3 à 6 mois », « minimum »', () => {
    expect(parseMilestone('Stage de 3 mois minimum')).toMatchObject({
      kind: 'INTERNSHIP',
      title: 'Stage de 3 mois minimum',
      minMonths: 3,
      maxMonths: null,
    });
    expect(parseMilestone('stage de 3 à 6 mois')).toMatchObject({
      title: 'Stage de 3 à 6 mois',
      minMonths: 3,
      maxMonths: 6,
    });
    expect(parseMilestone('Stage de 12 semaines')).toMatchObject({ minMonths: 3, maxMonths: 3 });
  });
  it('« mémoire d’environ 80 pages », « soutenu en juin »', () => {
    expect(parseMilestone('mémoire d’environ 50 pages soutenu en juin')).toMatchObject({
      kind: 'THESIS',
      title: 'Mémoire d’environ 50 pages',
      pages: 50,
      period: 'soutenu en juin',
      detail: 'Soutenu en juin',
    });
  });
  it('a clause without figures keeps its own words', () => {
    expect(parseMilestone('Stage ou Mémoire 3C')).toMatchObject({
      kind: 'INTERNSHIP',
      title: 'Stage ou Mémoire',
    });
    expect(parseMilestone('Mémoire et oral (20 ECTS)')).toMatchObject({ title: 'Mémoire et oral' });
    expect(parseMilestone('Méthodologie du mémoire')).toBeNull();
  });
  it('rubric text: one milestone per clause, with its year and its place', () => {
    const ms = milestonesFromText(
      'Stage de 3 mois minimum en M1 en structure patrimoniale, stage de 3 à 6 mois en M2. Un mémoire d’environ 80 pages est évalué en septembre.',
    );
    expect(ms.map((m) => [m.kind, m.year, m.minMonths, m.maxMonths, m.pages])).toEqual([
      ['INTERNSHIP', 1, 3, null, null],
      ['INTERNSHIP', 2, 3, 6, null],
      ['THESIS', null, null, null, 80],
    ]);
    expect(ms[0]!.detail).toBe('En structure patrimoniale');
    expect(ms[2]!.detail).toBe('Évalué en septembre');
  });
});

describe('migration of the former text', () => {
  it('commas: courses, and the milestones of a stage semester', () => {
    const s1 = splitLegacySemester(
      'Histoire de la notion de patrimoine, conservation et restauration, histoire de l’architecture, anglais + LV2.',
    );
    expect(s1.courses.map((c) => c.label)).toEqual([
      'Histoire de la notion de patrimoine',
      'Conservation et restauration',
      'Histoire de l’architecture',
      'Anglais + LV2',
    ]);
    const s2 = splitLegacySemester(
      'Stage de 3 mois minimum, mémoire d’environ 50 pages soutenu en juin.',
    );
    expect(s2.courses).toEqual([]);
    expect(s2.milestones.map((m) => m.title)).toEqual([
      'Stage de 3 mois minimum',
      'Mémoire d’environ 50 pages',
    ]);
  });
  it('semicolons win over commas, quotes are kept whole', () => {
    const s = splitLegacySemester(
      'Patrimoines maritime, naturel ; patrimoine immatériel, « de la main et du geste » ; muséologie ; projet tutoré.',
    );
    expect(s.courses.map((c) => c.label)).toEqual([
      'Patrimoines maritime, naturel',
      'Patrimoine immatériel, « de la main et du geste »',
      'Muséologie',
      'Projet tutoré',
    ]);
  });
  it('« · » lists of the university sites, with their figures', () => {
    const s = splitLegacySemester(
      'AI Game Programming (EN) (3 ECTS) · Mineure DS4H (3 ECTS, 4 h) · Stage (30 ECTS)',
    );
    expect(s.courses).toEqual([
      { label: 'AI Game Programming (EN)', ects: 3, hours: null },
      { label: 'Mineure DS4H', ects: 3, hours: 4 },
    ]);
    expect(s.milestones.map((m) => m.title)).toEqual(['Stage']);
    expect(courseOf('Procédure pénale 2 (33h CM + 15h TD) 6C + 2C (48 h)')).toEqual({
      label: 'Procédure pénale 2',
      ects: 8,
      hours: 48,
    });
  });
});

const sem = (o: Partial<OutlineSemester> & { label: string }): OutlineSemester => ({
  id: o.label,
  title: null,
  year: null,
  number: null,
  ects: 30,
  courses: [],
  milestones: [],
  ...o,
});
const ms = (kind: 'INTERNSHIP' | 'THESIS' | 'CERTIFICATION', o: Record<string, unknown> = {}) => ({
  id: `${kind}${Math.random()}`,
  kind,
  title: kind,
  detail: null,
  minMonths: null,
  maxMonths: null,
  pages: null,
  ...o,
});
const course = (label: string, category = 'CORE' as const) => ({
  id: label,
  label,
  ects: null,
  category,
});

const VNP: OutlineSemester[] = [
  sem({
    label: 'M1 · Semestre 1',
    year: 1,
    number: 1,
    courses: [course('Muséologie'), { ...course('Anglais'), category: 'LANGUAGES' }],
  }),
  sem({
    label: 'M1 · Semestre 2',
    year: 1,
    number: 2,
    milestones: [ms('INTERNSHIP', { minMonths: 3 }), ms('THESIS', { pages: 50 })],
  }),
  sem({
    label: 'M2 · Semestre 3',
    year: 2,
    number: 3,
    courses: [course('Certification guide-conférencier')],
  }),
  sem({
    label: 'M2 · Semestre 4',
    year: 2,
    number: 4,
    milestones: [ms('INTERNSHIP', { minMonths: 3, maxMonths: 6 }), ms('THESIS', { pages: 80 })],
  }),
];

describe('facts', () => {
  it('the four facts of the Programme tab', () => {
    expect(programmeFacts(VNP, { entryLevel: 'M1', durationYears: 2, ects: 120 })).toEqual([
      { key: 'duration', value: '2 ans · 120 ECTS', label: '4 semestres' },
      { key: 'internships', value: '2 stages', label: '3 mois minimum en M1, 3 à 6 mois en M2' },
      { key: 'theses', value: '2 mémoires', label: '≈ 50 pages, puis ≈ 80 pages' },
      { key: 'certification', value: 'Guide-conférencier', label: 'Certification préparée en M2' },
    ]);
  });
  it('without internship nor thesis: those facts are left out', () => {
    const f = programmeFacts([VNP[0]!, VNP[2]!], { entryLevel: 'M1', durationYears: 2, ects: 120 });
    expect(f.map((x) => x.key)).toEqual(['duration', 'certification']);
  });
  it('a parcours that starts in M2 only counts and shows M2', () => {
    const f = programmeFacts(VNP, { entryLevel: 'M2', durationYears: 2, ects: 120 });
    expect(f[0]).toEqual({ key: 'duration', value: '1 an · 60 ECTS', label: '2 semestres' });
    expect(f[1]).toEqual({ key: 'internships', value: '1 stage', label: '3 à 6 mois en M2' });
    expect(outlineYears(VNP, 'M2').map((y) => y.label)).toEqual(['M2']);
    expect(outlineYears(VNP, 'M1').map((y) => [y.label, y.semesters.length])).toEqual([
      ['M1', 2],
      ['M2', 2],
    ]);
  });
  it('no programme: no fact at all', () => {
    expect(programmeFacts([], { entryLevel: 'M1', durationYears: 2, ects: 120 })).toEqual([]);
  });
});

describe('theme filter', () => {
  it('only the categories present, never an empty filter', () => {
    const order = COURSE_CATEGORIES.map((c) => c.id);
    expect(presentCategories(VNP, order)).toEqual(['CORE', 'METHODS', 'LANGUAGES', 'PROJECTS']);
    expect(presentCategories([VNP[0]!], order)).toEqual(['CORE', 'LANGUAGES']);
    expect(presentCategories([], order)).toEqual([]);
  });
});

describe('old documents', () => {
  it('more than 2 academic years old', () => {
    const now = new Date('2026-11-16');
    expect(isStaleProgramme('2022-2023', now)).toBe(true);
    expect(isStaleProgramme('2024-2025', now)).toBe(false);
    expect(isStaleProgramme('2025-2026', now)).toBe(false);
    expect(isStaleProgramme(null, now)).toBe(false);
  });
});

describe('university sites: units and the « Stages » rubric', () => {
  it('a unit « Stage » is a milestone, completed by the rubric of its year', async () => {
    const { programmeFromSemesters } = await import('@/lib/domain/program-outline');
    const plan = programmeFromSemesters(
      [
        {
          position: 0,
          label: 'M1 · Semestre 2',
          content: '',
          units: [{ title: 'Droit des contrats', ects: 6, hours: 24 }],
        },
        {
          position: 1,
          label: 'M2 · Semestre 4',
          content: '',
          units: [
            { title: 'Stage', ects: 30, hours: null },
            { title: 'Projet innovation-recherche', ects: 6, hours: null },
          ],
        },
      ],
      'Un stage de 2 mois en M1. En M2, stage de 4 à 6 mois en entreprise.',
    );
    expect(plan[0]!.milestones.map((m) => m.title)).toEqual(['Stage de 2 mois']);
    expect(plan[1]!.courses.map((c) => c.label)).toEqual(['Projet innovation-recherche']);
    expect(plan[1]!.milestones).toHaveLength(1);
    expect(plan[1]!.milestones[0]).toMatchObject({
      title: 'Stage de 4 à 6 mois',
      minMonths: 4,
      maxMonths: 6,
    });
  });
});
