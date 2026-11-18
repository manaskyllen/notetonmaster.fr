/**
 * Generic extractor by sections (lib/connectors/univ-sites/sections.ts), on fictional pages built
 * on the templates of the university CMS (Ametys, K-Sup, Drupal) in fixtures/live/univ-sites/:
 * same markup and course structure, invented text, no content of a real university.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inlineText, parseHtml, query, queryAll, textOf } from '@/lib/connectors/univ-sites/html';
import {
  academicYears,
  extractSections,
  rubricOf,
  semestersOf,
  unitsFromLines,
  unitsFromTable,
  yearFromUrl,
  type ExtractOptions,
  type PageExtraction,
} from '@/lib/connectors/univ-sites/sections';

const AMETYS: ExtractOptions = {
  headings: [
    { selector: 'h2.ametys-section-title', level: 2 },
    { selector: 'h2.ametys-section-sub-title', level: 3 },
    { selector: 'h3', level: 4 },
  ],
  ignoreHeadings: '[class*=benefits]',
  facts: '.ametys-benefits-alt__item-title',
};

function page(path: string, o: ExtractOptions = {}): PageExtraction {
  const html = readFileSync(`fixtures/live/univ-sites/${path}`, 'utf8');
  const url = /<!-- (\S+)/.exec(html)?.[1];
  return extractSections(html, { url, ...o });
}

const PII = /@|(?:\+33|\b0[1-9])(?:[\s.]?\d{2}){4}/;
const allText = (r: PageExtraction) => JSON.stringify(r);

describe('HTML parser', () => {
  it('implied end tags, void elements, entities, raw text', () => {
    const doc = parseHtml(
      '<ul><li>a<li>b &amp; c<br>d</ul><p>x<p>y&nbsp;z &eacute;t&#233; &#x2019;<script>if (a<b) {}</script>',
    );
    expect(queryAll(doc, 'li').map((l) => inlineText(l))).toEqual(['• a', '• b & c d']);
    expect(queryAll(doc, 'p').map((p) => inlineText(p))).toEqual(['x', 'y z été ’']);
    expect(textOf(doc)).not.toContain('if (a');
  });

  it('table cells close each other; stray end tags are ignored', () => {
    const doc = parseHtml(
      '<table><tr><th>Matières<th>ECTS<tr><td>Droit</span><td>6</table><p>après</div>fin',
    );
    expect(queryAll(doc, 'tr')).toHaveLength(2);
    expect(queryAll(doc, 'td').map((c) => inlineText(c))).toEqual(['Droit', '6']);
    expect(inlineText(query(doc, 'p')!)).toBe('aprèsfin'); // a stray </div> adds no space, as in a browser
  });

  it('selectors: tag, class, id, attributes, descendant and child', () => {
    const doc = parseHtml(
      '<div id="a" class="x y"><section><h2 class="t" data-k="v-1">T</h2></section><p class="t">P</p></div>',
    );
    expect(queryAll(doc, '#a .t').map((e) => e.tag)).toEqual(['h2', 'p']);
    expect(queryAll(doc, 'div > .t').map((e) => e.tag)).toEqual(['p']);
    expect(queryAll(doc, 'h2[data-k^="v-"], p.t').map((e) => e.tag)).toEqual(['h2', 'p']);
    expect(query(doc, '[class*=nope]')).toBeNull();
  });
});

describe('synonyms of the rubrics', () => {
  it.each([
    ['Objectifs', 'objectifs'],
    ['Présentation', 'objectifs'],
    ['La formation', 'objectifs'],
    ['Compétences visées', 'competences'],
    ['Savoir-faire et compétences', 'competences'],
    ["Conditions d'accès", 'admission'],
    ['Candidater', 'admission'],
    ['Public visé et prérequis', 'admission'],
    ['Attendus', 'admission'],
    ['Modalités de sélection', 'admission'],
    ['Débouchés professionnels', 'debouches'],
    ['Insertion professionnelle', 'debouches'],
    ['Métiers visés', 'debouches'],
    ['Et après ?', 'debouches'],
    ['Programme', 'programme'],
    ['Contenu de la formation', 'programme'],
    ['Maquette', 'programme'],
    ['Enseignements', 'programme'],
    ['Organisation', 'programme'],
    ['Stage / Alternance', 'stages'],
    ['Rythme', 'stages'],
    ["Poursuite d'études", 'poursuite'],
    ['Poursuites d’études', 'poursuite'],
    ["Langue(s) d'enseignement", 'langues'],
    ['Droits de scolarité', 'frais'],
    ['Frais de formation', 'frais'],
    ['2. Admission', 'admission'],
  ])('%s → %s', (heading, rubric) => {
    expect(rubricOf(heading)?.rubric).toBe(rubric);
  });

  it('generic headings weigh less than the rubric name; unrelated headings match nothing', () => {
    expect(rubricOf('Présentation')?.weight).toBe(1);
    expect(rubricOf('Objectifs')?.weight).toBe(2);
    expect(rubricOf('Et après')?.weight).toBe(1);
    expect(rubricOf('Contacts')).toBeNull();
    expect(rubricOf('Lieu(x) de formation')).toBeNull();
    expect(rubricOf('Les + de la formation')).toBeNull();
  });
});

describe('years', () => {
  it('academic years in a text and in a catalogue URL', () => {
    expect(academicYears('Effectif 2025-2026, résultats 2024/25, 2020-2023')).toEqual([
      '2025-2026',
      '2024-2025',
    ]);
    expect(
      yearFromUrl(
        'https://formations.parisnanterre.fr/fr/formations-2026-2027/les-formations/x.html',
      ),
    ).toBe('2026-2027');
    expect(
      yearFromUrl('https://formations.univ-grenoble-alpes.fr/fr/catalogue-2021/master-XB/x.html'),
    ).toBe('2021-2022');
    expect(yearFromUrl('https://www.u-pec.fr/fr/formation/master-x')).toBeNull();
  });
});

describe('course units', () => {
  it('free lines with ECTS and hours under « Semestre N » (Orléans)', () => {
    const u = unitsFromLines([
      'Master 1 (année 1 - year 1) mandatory for all students',
      'Semestre 1',
      'Mécanique quantique (6 ECTS) - 22 h (C) - 20 h (TD)',
      'Projet (2 ECTS) - 10 h (TD)',
      'Semestre 3',
      'Matière molle/ Soft Matter (3 ECTS) - 10 h (C) - 10 h (TD)',
    ]);
    expect(u).toEqual([
      { title: 'Mécanique quantique', ects: 6, semester: 1, year: 1, hours: 42 },
      { title: 'Projet', ects: 2, semester: 1, year: 1, hours: 10 },
      { title: 'Matière molle/ Soft Matter', ects: 3, semester: 3, year: 2, hours: 20 },
    ]);
  });

  it('a tree UE / EC / CM-TD: only the units, with their metadata line (Tours)', () => {
    const u = unitsFromLines([
      'Semestre 7 DM1BTD24',
      'UE 1 Fondamentaux et compétences transversales S7 DM1BTD24',
      '(UE)100 h - 13 Crédits ECTS',
      '• Anglais TD S7 DM1BTD24',
      '(Élément Constitutif)20 h - 3 Crédits ECTS',
      '• Gestion de projet CM DM1BTD24',
      '(Cours Magistral)10 h',
    ]);
    expect(u).toEqual([
      {
        title: 'Fondamentaux et compétences transversales',
        ects: 13,
        semester: 7,
        year: 1,
        hours: 100,
      },
    ]);
  });

  it('« UE 701 / code / intitulé » on three lines, choices skipped (Toulouse Jean Jaurès)', () => {
    const u = unitsFromLines([
      'Semestre 9',
      'UE 901',
      'ES00901T',
      'Méthodologie des études romanes II',
      'UE 906 au choix : Langue vivante | option',
    ]);
    expect(u).toEqual([
      {
        title: 'Méthodologie des études romanes II',
        ects: null,
        semester: 9,
        year: 2,
        hours: null,
      },
    ]);
  });

  it('ECUE lines are elements, « Master 1 - Semestre 1 » is a context line (UPEC)', () => {
    const u = unitsFromLines([
      'Master 1 - Semestre 1',
      'UE 1 : Transformations et mutations éducatives et sociales (15 ECTS)',
      '- ECUE 1.1 Cycle de vie (4 ECTS) (18h CM - )',
    ]);
    expect(u).toEqual([
      {
        title: 'Transformations et mutations éducatives et sociales',
        ects: 15,
        semester: 1,
        year: 1,
        hours: null,
      },
    ]);
  });

  it('a course table with named columns (Paris-Saclay, cours chargés en AJAX)', () => {
    const cmds = JSON.parse(
      readFileSync(
        'fixtures/live/univ-sites/paris-saclay/node-942813-program-courses-ajax.json',
        'utf8',
      ),
    ) as { data?: unknown }[];
    const html = cmds.map((c) => (typeof c.data === 'string' ? c.data : '')).join('');
    const units = unitsFromTable(query(parseHtml(html), 'table')!, { semester: null, year: null });
    expect(units[0]).toEqual({
      title: 'Approches historiques et perspectives des politiques culturelles',
      ects: 4,
      semester: 1,
      year: 1,
      hours: 24,
    });
    expect(units[1]).toMatchObject({ title: 'Anglais professionnel', ects: 2, hours: 15 });
    expect(units.every((u) => u.title.length > 3)).toBe(true); // detail rows (colspan) skipped
  });

  it('a table whose first header names the semester (Picardie)', () => {
    const doc = parseHtml(readFileSync('fixtures/live/univ-sites/drupal/picardie-ee.html', 'utf8'));
    const units = unitsFromTable(queryAll(doc, 'table')[0]!, { semester: null, year: null });
    expect(units).toHaveLength(9);
    expect(units[3]).toEqual({
      title: 'Ressources Humaines',
      ects: 3,
      semester: 2,
      year: 1,
      hours: 20,
    });
  });

  it('« Semestre 1 : 9 UE (30 ECTS) » is a summary of the semester, not a unit (Clermont)', () => {
    expect(unitsFromLines(['Semestre 1 : 9 UE (30 ECTS)', 'Imagerie médicale (6 ECTS)'])).toEqual([
      { title: 'Imagerie médicale', ects: 6, semester: 1, year: 1, hours: null },
    ]);
  });

  it('« Débouchés » ends the previous section but its content is not collected', () => {
    const r = extractSections(
      '<h2>Objectifs</h2><p>Former des spécialistes de la médiation culturelle.</p><h2>Débouchés</h2><ul><li>Ingénieur(e)s d’études</li><li>Chef(fe)s de projet</li></ul>',
    );
    expect(r.rubrics.objectifs!.value).toBe('Former des spécialistes de la médiation culturelle.');
    expect(r.rubrics.debouches).toBeUndefined();
    expect(r).not.toHaveProperty('jobs');
  });

  it('semesters are labelled and ordered', () => {
    const s = semestersOf([
      { title: 'B', ects: 3, semester: 2, year: 1, hours: null },
      { title: 'A', ects: 6, semester: 1, year: 1, hours: 24 },
      { title: 'C', ects: null, semester: null, year: 2, hours: null },
    ]);
    expect(s.map((x) => [x.position, x.label, x.content])).toEqual([
      [0, 'M1 · Semestre 1', 'A (6 ECTS, 24 h)'],
      [1, 'M1 · Semestre 2', 'B (3 ECTS)'],
      [2, 'M2', 'C'],
    ]);
  });
});

describe('pages built on the CMS templates', () => {
  it('Ametys (Orléans): rubrics, 30 units over 4 semesters, exam mode', () => {
    const r = page('ametys/orleans-physique-mr.html', AMETYS);
    expect(Object.keys(r.rubrics).sort()).toEqual([
      'admission',
      'frais',
      'objectifs',
      'poursuite',
      'programme',
    ]);
    expect(r.units!.value).toHaveLength(30);
    expect(r.units!.value[0]).toEqual({
      title: 'Mécanique quantique',
      ects: 6,
      semester: 1,
      year: 1,
      hours: 42,
    });
    expect(r.semesters!.value.map((s) => s.label)).toEqual([
      'M1 · Semestre 1',
      'M1 · Semestre 2',
      'M2 · Semestre 3',
      'M2 · Semestre 4',
    ]);
    expect(r.admission.examModes!.value).toEqual(['Dossier']);
    expect(r.rubricCount).toBeGreaterThanOrEqual(5);
  });

  it('Ametys (Lille): specific heading wins over « Présentation »', () => {
    const r = page('ametys/lille-emgals.html', AMETYS);
    expect(r.rubrics.competences!.heading).toBe('Savoir-faire et compétences');
    expect(r.rubrics.poursuite!.value).toMatch(/doctorat/);
    expect(r.languages!.value).toEqual(['Anglais']);
  });

  it('Ametys (Montpellier): units without ECTS nor semester stay MISSING; testimonials never read', () => {
    const r = page('ametys/montpellier-economie-idil.html', AMETYS);
    expect(r.units).toBeNull();
    expect(r.rubrics.objectifs!.heading).toBe('Objectifs');
    expect(r.rubrics.frais!.heading).toBe('Droits de scolarité');
    expect(allText(r)).not.toMatch(/Ils en parlent/);
  });

  it('K-Sup (Tours): 14 units S7–S10, the page year, the languages', () => {
    const r = page('ksup/tours-biotech-droit.html');
    expect(r.units!.value).toHaveLength(14);
    expect(r.units!.value[0]).toEqual({
      title: 'Fondamentaux et compétences transversales',
      ects: 13,
      semester: 7,
      year: 1,
      hours: 100,
    });
    expect(r.units!.value.map((u) => u.title)).not.toContain('Anglais TD');
    expect(r.documentYear).toBe('2025-2026');
    expect(r.languages!.value).toEqual(['Français', 'Anglais']);
    expect(r.admission.examModes!.value).toContain('Entretien');
  });

  it('K-Sup (UPEC, Toulouse Jean Jaurès): units with semesters, ECUE and choices left out', () => {
    const upec = page('ksup/upec-education-populaire.html');
    expect(upec.units!.value).toHaveLength(13);
    expect(upec.units!.value.some((u) => /ECUE/.test(u.title))).toBe(false);
    const ut2j = page('ksup/ut2j-etudes-hispaniques.html');
    expect(ut2j.semesters!.value.map((s) => s.label)).toEqual([
      'M1 · Semestre 7',
      'M1 · Semestre 8',
      'M2 · Semestre 9',
      'M2 · Semestre 10',
    ]);
    expect(ut2j.units!.value.some((u) => /choix/i.test(u.title))).toBe(false);
  });

  it('K-Sup (Clermont): a reference to the RNCP sheet is not a rubric content', () => {
    const r = page('ksup/uca-mae.html');
    expect(r.rubrics.competences!.value).not.toMatch(/^URL Fiche RNCP/);
    expect(r.admission.examModes!.value).toEqual(['Dossier', 'Entretien']);
  });

  it('Drupal (Picardie): tabs and tables, 38 units', () => {
    const r = page('drupal/picardie-ee.html');
    expect(r.units!.value).toHaveLength(38);
    expect(r.rubrics.objectifs!.value).toMatch(/^L'objectif de la formation/);
  });

  it('Drupal (Paris-Saclay): courses loaded in AJAX are MISSING from the page itself', () => {
    const r = page('drupal/saclay-biologie-genomes.html');
    expect(r.units).toBeNull();
    expect(r.rubrics.admission!.heading).toBe('Public visé et prérequis');
  });

  it('every field keeps an evidence of 300 characters at most, without personal data', () => {
    for (const [path, o] of [
      ['ametys/lille-emgals.html', AMETYS],
      ['ametys/orleans-physique-mr.html', AMETYS],
      ['ametys/uha-risques-ieen.html', AMETYS],
      ['ksup/tours-biotech-droit.html', {}],
      ['ksup/uca-mae.html', {}],
      ['drupal/rennes-geodynamique.html', {}],
    ] as const) {
      const r = page(path, o);
      for (const f of Object.values(r.rubrics)) {
        expect(f!.evidence.length).toBeLessThanOrEqual(300);
        expect(f!.evidence).not.toMatch(PII);
      }
      expect(allText(r)).not.toMatch(PII);
    }
  });

  it('a person named in a rubric is removed before anything is returned', () => {
    const r = extractSections(
      '<h2>Admission</h2><p>Sélection sur dossier puis entretien.</p><p><strong>Responsable du parcours :</strong> Marie DUPONT, marie.dupont@exemple.fr, 02 61 91 10 10</p>',
    );
    expect(r.rubrics.admission!.value).toMatch(/Sélection sur dossier/);
    expect(allText(r)).not.toMatch(/DUPONT|@|02 61/);
    expect(r.piiRemoved).toBeGreaterThan(0);
  });
});
