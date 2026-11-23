import { describe, expect, it } from 'vitest';
import { cursusView } from '@/lib/catalog/cursus-view';

/** What the fiche shows of the cursus of a parcours (issue #21). */
const entry = (id: string, label: string | null, lastSession = 2025) => ({
  id,
  code: `CODE${id}`,
  cursusLabel: label,
  lastSession,
});
const stat = (
  id: string,
  capacity: number,
  applications: number,
  offers: number,
  session = 2025,
) => ({
  monMasterEntryId: id,
  session,
  capacity,
  applications,
  offers,
});

describe('cursusView', () => {
  const strasbourg = cursusView(
    [entry('k', 'Kehl'), entry('s', 'Strasbourg'), entry('p', 'Passau'), entry('old', null, 2024)],
    [
      stat('s', 30, 338, 59),
      stat('k', 10, 53, 26),
      stat('p', 2, 42, 2),
      stat('s', 53, 243, 113, 2024),
    ],
    new Map(),
    '0673021V',
  );

  it('the cursus of the latest session, the most places first, with the site’s figures', () => {
    expect(strasbourg.kind).toBe('named');
    expect(strasbourg.items.map((i) => [i.label, i.places, i.applications, i.rate])).toEqual([
      ['Strasbourg', 30, 338, 17],
      ['Kehl', 10, 53, 49],
      ['Passau', 2, 42, 5],
    ]);
    expect(strasbourg).toMatchObject({ totalPlaces: 42, rateMin: 5, rateMax: 49, session: 2025 });
    expect(strasbourg.chip).toBe('3 cursus : Strasbourg, Kehl, Passau ↓');
    expect(strasbourg.items[0]!.url).toBe(
      'https://monmaster.gouv.fr/formation/0673021V/CODEs/detail',
    );
    expect(strasbourg.m2).toBeNull();
  });

  it('« 4 cursus ↓ » beyond three', () => {
    const v = cursusView(
      ['a', 'b', 'c', 'd'].map((x) => entry(x, x.toUpperCase())),
      [],
      new Map(),
      null,
    );
    expect(v.chip).toBe('4 cursus ↓');
  });

  it('a rhythm pair: « Aussi en alternance ↓ »; numbers without label: no chip', () => {
    const pair = cursusView(
      [entry('a', 'Formation initiale'), entry('b', 'En alternance')],
      [],
      new Map(),
      null,
    );
    expect(pair).toMatchObject({ kind: 'rhythm', chip: 'Aussi en alternance ↓' });
    const none = cursusView([entry('a', null), entry('b', null)], [], new Map(), null);
    expect(none).toMatchObject({ kind: 'unnamed', chip: null });
    const one = cursusView([entry('a', null)], [], new Map(), null);
    expect(one).toMatchObject({ kind: 'single', chip: null });
  });

  it('the M2 banner only when the M2 differs from one cursus to another', () => {
    const same = cursusView(
      [entry('a', 'Kehl'), entry('b', 'Passau')],
      [],
      new Map([
        ['CODEa', 'M2 A'],
        ['CODEb', 'M2 A'],
      ]),
      null,
    );
    expect(same.m2).toBeNull();
    const differs = cursusView(
      [entry('a', 'Kehl'), entry('b', 'Passau')],
      [],
      new Map([
        ['CODEa', 'M2 franco-allemand'],
        ['CODEb', 'M2 B'],
      ]),
      null,
    );
    expect(differs.m2).toEqual({ label: 'Kehl', leadsTo: 'M2 franco-allemand' });
  });
});
