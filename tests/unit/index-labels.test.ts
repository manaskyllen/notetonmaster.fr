import { describe, expect, it } from 'vitest';
import {
  byName,
  byRating,
  citiesLabel,
  countLabel,
  groupByLetter,
  letterOf,
  matchesWords,
  monogram,
  tileOf,
  TILES,
} from '@/lib/catalog/index-labels';
import { openCitiesLine } from '@/lib/launch/line';

/** Indexes /mentions and /universites, and the line of the home (MentionsIndex, UniversitesIndex, Main). */
describe('indexes', () => {
  it('groups by letter, accents ignored: « Économie » under E, next to « Droit » and « Europe »', () => {
    const rows = ['Économie appliquée', 'Droit', 'Europe', 'Électronique', 'Arts']
      .map((name) => ({ name }))
      .sort(byName);
    expect(rows.map((r) => r.name)).toEqual([
      'Arts',
      'Droit',
      'Économie appliquée',
      'Électronique',
      'Europe',
    ]);
    expect(groupByLetter(rows).map((g) => [g.letter, g.items.length])).toEqual([
      ['A', 1],
      ['D', 1],
      ['E', 3],
    ]);
    expect(letterOf('« Ingénierie »')).toBe('I');
    expect(letterOf('3D')).toBe('#');
  });

  it('cities of a card: two named, beyond « et n autres villes », the filtered city first', () => {
    expect(citiesLabel(['Strasbourg'])).toBe('Strasbourg');
    expect(citiesLabel(['Strasbourg', 'Nantes'])).toBe('Nantes et Strasbourg');
    expect(citiesLabel(['Strasbourg', 'Nantes'], 'Strasbourg')).toBe('Strasbourg et Nantes');
    expect(citiesLabel(['Rennes', 'Lyon', 'Nantes', 'Marseille', 'Mulhouse'])).toBe(
      'Lyon, Marseille et 3 autres villes',
    );
    expect(citiesLabel(['Rennes', 'Lyon', 'Nantes'], 'Rennes')).toBe(
      'Rennes, Lyon et 1 autre ville',
    );
  });

  it('counter: « 30 mentions », « 12 mentions sur 214 » with a filter', () => {
    expect(countLabel(30, 30, 'mention', 'mentions')).toBe('30 mentions');
    expect(countLabel(12, 214, 'mention', 'mentions')).toBe('12 mentions sur 214');
    expect(countLabel(1, 8, 'établissement', 'établissements')).toBe('1 établissement sur 8');
  });

  it('« Mieux notées »: best average first, then the most reviews, without reviews last', () => {
    const rows = [
      { name: 'Sans avis', avg: null, reviews: 0 },
      { name: 'B', avg: 4.1, reviews: 2 },
      { name: 'A', avg: 4.1, reviews: 9 },
      { name: 'C', avg: 4.6, reviews: 1 },
      { name: 'Autre sans avis', avg: null, reviews: 0 },
    ].sort(byRating);
    expect(rows.map((r) => r.name)).toEqual(['C', 'A', 'B', 'Autre sans avis', 'Sans avis']);
  });

  it('text filter: every word, accents and case ignored', () => {
    expect(matchesWords('Économie appliquée', 'ECONOMIE')).toBe(true);
    expect(matchesWords('Économie appliquée', 'appli eco')).toBe(true);
    expect(matchesWords('Économie appliquée', 'droit')).toBe(false);
    expect(matchesWords('Droit', '  ')).toBe(true);
  });

  it('tile of an establishment: its usual short name, a stable colour', () => {
    const m = (name: string, shortName: string | null, keywords: string[] = []) =>
      monogram({ name, shortName, keywords });
    expect(m('Université de Strasbourg', null, ['unistra'])).toBe('Unistra');
    expect(m('Université de Haute-Alsace', null, ['uha'])).toBe('UHA');
    expect(m('Nantes Université', null, ['nantes', 'pays de la loire', 'nu'])).toBe('NU');
    expect(
      m('Institut national des sciences appliquées de Lyon', 'INSA de Lyon', ['insa lyon']),
    ).toBe('INSA');
    expect(m('Université Jean Moulin - Lyon 3', 'Lyon III')).toBe('Lyon III');
    expect(m('Université de Rennes', 'UNIVRENNES')).toBe('UR');
    expect(m('Université Rennes 2', null)).toBe('UR2');
    expect(m('Oniris VetAgroBio', null)).toBe('Oniris');
    const id = 'c6e5614d-deb2-40dd-bd57-9b8183b8613d';
    expect(tileOf(id)).toBe(tileOf(id));
    expect(tileOf(id)).toBeGreaterThanOrEqual(0);
    expect(tileOf(id)).toBeLessThan(TILES.length);
  });
});

describe('home: one line, whatever the number of open cities', () => {
  const z = (names: string[]) => names.map((name) => ({ slug: name.toLowerCase(), name }));
  const text = (l: ReturnType<typeof openCitiesLine<{ name: string }>>) =>
    `${l.intro} ${l.shown.map((c, i) => c.name + l.seps[i]).join('')}${l.rest} · ${l.link} →`;

  it('three cities: « Déjà ouvert à Strasbourg, Nantes et Mulhouse »', () => {
    expect(text(openCitiesLine(z(['Strasbourg', 'Nantes', 'Mulhouse'])))).toBe(
      'Déjà ouvert à Strasbourg, Nantes et Mulhouse · Voir les universités →',
    );
    expect(text(openCitiesLine(z(['Strasbourg'])))).toBe(
      'Déjà ouvert à Strasbourg · Voir les universités →',
    );
  });

  it('ten cities: three names, then « et 7 autres »', () => {
    const ten = z([
      'Lyon',
      'Marseille',
      'Strasbourg',
      'Rennes',
      'Nantes',
      'Lille',
      'Nice',
      'Tours',
      'Metz',
      'Pau',
    ]);
    const l = openCitiesLine(ten);
    expect(l.shown).toHaveLength(3);
    expect(text(l)).toBe(
      'Déjà ouvert dans 10 villes : Lyon, Marseille, Strasbourg et 7 autres · Voir toutes les villes →',
    );
  });
});
