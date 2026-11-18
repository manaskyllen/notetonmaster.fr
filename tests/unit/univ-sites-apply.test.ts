/** univ-sites, lot 3: pages of a parcours united, field plans, stale years. */
import { describe, expect, it } from 'vitest';
import { combine, planChanges, stateOf } from '@/lib/connectors/univ-sites/apply';
import type { PageExtraction } from '@/lib/connectors/univ-sites/sections';

const NOW = new Date('2026-11-14T12:00:00Z');
const f = <T>(value: T, year: string | null = '2026-2027') => ({
  value,
  evidence: `preuve ${String(value).slice(0, 20)}`,
  heading: 'h',
  year,
});
const x = (o: Partial<PageExtraction>): PageExtraction => ({
  rubrics: {},
  units: null,
  semesters: null,
  admission: {},
  languages: null,
  facts: {},
  documentYear: null,
  rubricCount: 0,
  piiRemoved: 0,
  ...o,
});

describe('stale documents', () => {
  it('older than the previous academic year is STALE', () => {
    expect(stateOf('2026-2027', NOW)).toBe('OK');
    expect(stateOf('2025-2026', NOW)).toBe('OK');
    expect(stateOf('2024-2025', NOW)).toBe('STALE');
    expect(stateOf('2021-2022', NOW)).toBe('STALE');
    expect(stateOf(null, NOW)).toBe('OK');
  });
});

describe('pages of one parcours (M1 page, M2 page)', () => {
  const m1 = x({
    rubrics: { objectifs: f('Objectifs du M1 et du M2.'), admission: f('Sur dossier.') },
    units: f([{ title: 'Droit A', ects: 6, semester: 1, year: 1, hours: 24 }]),
    rubricCount: 3,
  });
  const m2 = x({
    rubrics: {
      objectifs: f('Objectifs du M2 seulement.'),
      stages: f('Stage de 6 mois en cabinet.'),
    },
    units: f([
      { title: 'Droit B', ects: 30, semester: 4, year: 2, hours: null },
      { title: 'Droit A', ects: 6, semester: 1, year: 1, hours: 24 },
    ]),
    rubricCount: 2,
  });
  const c = combine([
    { url: 'https://a.fr/m2', x: m2 },
    { url: 'https://a.fr/m1', x: m1 },
  ]);

  it('each rubric from the richest page, units united', () => {
    expect(c.rubrics.objectifs!.value).toBe('Objectifs du M1 et du M2.');
    expect(c.rubrics.objectifs!.url).toBe('https://a.fr/m1');
    expect(c.rubrics.stages!.url).toBe('https://a.fr/m2');
    expect(c.units!.value.map((u) => u.title)).toEqual(['Droit A', 'Droit B']);
    expect(c.rubricCount).toBe(4); // objectifs, admission, stages, programme
  });

  it('field changes carry the source, the page, the evidence and the state', () => {
    const changes = planChanges(new Map(), 'PROGRAM', 'p1', c, NOW);
    const by = Object.fromEntries(changes.map((ch) => [ch.field, ch]));
    expect(Object.keys(by).sort()).toEqual([
      'admissionCriteria',
      'internships',
      'objectives',
      'semesters',
    ]);
    expect(by.objectives).toMatchObject({
      entityType: 'PROGRAM',
      entityId: 'p1',
      outcome: 'create',
      sourceUrl: 'https://a.fr/m1',
      state: 'OK',
    });
    expect(by.objectives!.source).toBe('Site de l’université · a.fr · 2026-2027');
    expect(by.semesters!.to).toEqual([
      { label: 'M1 · Semestre 1', content: 'Droit A (6 ECTS, 24 h)' },
      { label: 'M2 · Semestre 4', content: 'Droit B (30 ECTS)' },
    ]);
  });

  it('a mention page fills the common fields of the mention only', () => {
    const changes = planChanges(new Map(), 'MENTION', 'm1', c, NOW);
    expect(changes.map((ch) => ch.field)).toEqual(['description']);
  });

  it('an old document is STALE; a locked field is never overwritten', () => {
    const old = combine([
      {
        url: 'https://a.fr/old',
        x: x({ rubrics: { objectifs: f('Ancien texte.', '2021-2022') }, rubricCount: 1 }),
      },
    ]);
    const prov = new Map([
      [
        'p1\u0000objectives',
        {
          value: 'Saisi à la main',
          sourceKey: null,
          source: 'Saisie manuelle',
          state: 'OK',
          locked: true,
        } as never,
      ],
    ]);
    const [ch] = planChanges(prov, 'PROGRAM', 'p1', old, NOW);
    expect(ch).toMatchObject({ state: 'STALE', outcome: 'locked', from: 'Saisi à la main' });
  });
});
