/** Home: the domain of a discipline (bug « SHS : Bientôt »), the guided search, the sections. */
import { describe, expect, it } from 'vitest';
import { domainOfDiscipline } from '@/lib/domain/discipline-domain';
import { domainOf } from '@/lib/connectors/monmaster-opendata/normalize';
import { domainMentionCounts, frequentMentions, shortMentions } from '@/lib/home/data';
import {
  citiesTyped,
  countTable,
  excerpt,
  explorerHref,
  firstReviewCities,
  goLabel,
  highlight,
  NO_QUICK,
  quickMask,
  reviewAge,
} from '@/lib/home/labels';

describe('domain of a Mon Master discipline', () => {
  // Every label of the open data 2023–2025 (dev database, national import).
  const LABELS: [string, string][] = [
    ['Sc. fondamentales et appliquées (dont S.T.A.P.S.)', 'sciences-technologies-sante'],
    ['Sc. fondamentales et appliquées (dont STAPS)', 'sciences-technologies-sante'],
    ['Lettres, langues, art', 'arts-lettres-langues'],
    ['Droit et sc. politiques', 'droit-economie-gestion'],
    ['Economie, gestion et A.E.S.', 'droit-economie-gestion'],
    ['Economie, gestion et AES', 'droit-economie-gestion'],
    // the bug: these two were not recognised, their mentions had no domain
    ['S.H.S.', 'sciences-humaines-et-sociales'],
    ['SHS', 'sciences-humaines-et-sociales'],
    ['M.E.E.F.', 'sciences-humaines-et-sociales'],
    ['MEEF', 'sciences-humaines-et-sociales'],
    ['Sciences humaines et sociales', 'sciences-humaines-et-sociales'],
  ];
  it.each(LABELS)('%s → %s', (label, slug) => {
    expect(domainOfDiscipline(label)).toBe(slug);
    // the importer uses the same rule
    expect(domainOf(label)).toBe(slug);
  });
  it('nothing known: no domain rather than a wrong one', () => {
    expect(domainOfDiscipline('')).toBeNull();
    expect(domainOfDiscipline(null)).toBeNull();
    expect(domainOfDiscipline('Autre')).toBeNull();
  });
});

describe('mentions per domain and per city (tiles « Explorer par domaine »)', () => {
  const entries = [
    { domain: 'shs', zones: ['nantes', 'strasbourg'] },
    { domain: 'shs', zones: ['nantes'] },
    { domain: 'deg', zones: ['strasbourg'] },
    { domain: null, zones: ['nantes'] },
  ];
  it('counts each mention once per city, all the open cities under ""', () => {
    const c = domainMentionCounts(entries);
    expect(c.shs).toEqual({ '': 2, nantes: 2, strasbourg: 1 });
    expect(c.deg).toEqual({ '': 1, strasbourg: 1 });
    // a mention without a domain counts nowhere (reported in the admin)
    expect(Object.keys(c)).toEqual(['shs', 'deg']);
  });
  it('a domain absent from a city is « Bientôt » there (no key)', () => {
    expect(domainMentionCounts(entries).deg!.nantes).toBeUndefined();
  });
  it('frequent searches: the mentions with the most parcours, no tracking', () => {
    const m = [
      { name: 'Psychologie', parcours: 30 },
      { name: 'Métiers de l’enseignement, de l’éducation et de la formation', parcours: 80 },
      { name: 'Droit', parcours: 30 },
    ];
    expect(frequentMentions(m, 2)).toEqual([
      { name: 'Métiers de l’enseignement, de l’éducation et de la formation', parcours: 80 },
      { name: 'Droit', parcours: 30 },
    ]);
    // tries after an empty search: short names only
    expect(shortMentions(m)).toEqual(['Droit', 'Psychologie']);
  });
});

describe('count table of the button (empty « Quoi ? »)', () => {
  const t = countTable([
    { zones: ['nantes'], alt: true, avis: false, m1: true, n: 3 },
    { zones: ['nantes', 'saint-nazaire'], alt: false, avis: true, m1: true, n: 2 },
    { zones: ['strasbourg'], alt: false, avis: false, m1: false, n: 5 },
  ]);
  const at = (city: string, q: Partial<typeof NO_QUICK>) =>
    t[city]![quickMask({ ...NO_QUICK, ...q })];
  it('all the cities, then each one', () => {
    expect(at('', {})).toBe(10);
    expect(at('nantes', {})).toBe(5);
    expect(at('strasbourg', {})).toBe(5);
    expect(at('saint-nazaire', {})).toBe(2);
  });
  it('each filter keeps the rows that satisfy it, filters add up', () => {
    expect(at('', { alt: true })).toBe(3);
    expect(at('', { m1: true })).toBe(5);
    expect(at('nantes', { m1: true, avis: true })).toBe(2);
    expect(at('', { alt: true, avis: true })).toBe(0);
  });
});

describe('guided search', () => {
  it('leads to the Explorer with its own parameters', () => {
    expect(explorerHref({ q: '', city: null, quick: NO_QUICK })).toBe('/explorer');
    expect(
      explorerHref({ q: ' psycho ', city: 'nantes', quick: { alt: true, avis: true, m1: true } }),
    ).toBe('/explorer?q=psycho&lieu=zone%3Anantes&modalite=alternance&avis=avec&entree=M1');
  });
  it('button: the count, « Chercher » when nothing is known', () => {
    expect(goLabel(1234)).toBe('Voir les 1 234 masters');
    expect(goLabel(1)).toBe('Voir le master');
    expect(goLabel(0)).toBe('Chercher');
    expect(goLabel(null)).toBe('Chercher');
  });
  it('highlights the words typed, accents and case aside, keeping the label', () => {
    expect(highlight('Thérapie et Santé', 'THERAPIE sante')).toEqual([
      { text: 'Thérapie', hit: true },
      { text: ' et ', hit: false },
      { text: 'Santé', hit: true },
    ]);
    expect(highlight('Psychologie : psychopathologie', 'psycho')).toEqual([
      { text: 'Psycho', hit: true },
      { text: 'logie : ', hit: false },
      { text: 'psycho', hit: true },
      { text: 'pathologie', hit: false },
    ]);
    expect(highlight('Droit', '')).toEqual([{ text: 'Droit', hit: false }]);
  });
  it('an open city typed in « Quoi ? »', () => {
    const zones = [{ name: 'Nantes' }, { name: 'Montpellier' }];
    expect(citiesTyped(zones, 'nant')).toEqual([{ name: 'Nantes' }]);
    expect(citiesTyped(zones, 'MONTPELLIER')).toEqual([{ name: 'Montpellier' }]);
    expect(citiesTyped(zones, 'na')).toEqual([]); // too short
    expect(citiesTyped(zones, 'droit nantes')).toEqual([]); // a search, not a city
  });
});

describe('latest reviews and the call to give one', () => {
  it('the age is never more precise than the month of the fiche', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    expect(reviewAge(new Date('2026-11-01T00:00:00Z'), now)).toBe('ce mois-ci');
    expect(reviewAge(new Date('2026-10-01T00:00:00Z'), now)).toBe('le mois dernier');
    expect(reviewAge(new Date('2026-06-01T00:00:00Z'), now)).toBe('il y a 5 mois');
    expect(reviewAge(new Date('2025-09-01T00:00:00Z'), now)).toBe('il y a plus d’un an');
  });
  it('excerpt: whole words, about 220 characters, an ellipsis when cut', () => {
    expect(excerpt('Court.')).toBe('Court.');
    const long = 'mot '.repeat(80).trim();
    const e = excerpt(long);
    expect(e.length).toBeLessThanOrEqual(220);
    expect(e.endsWith('mot…')).toBe(true);
  });
  it('the cities of the first review, up to 4', () => {
    expect(firstReviewCities(['Nantes'])).toBe('à Nantes');
    expect(firstReviewCities(['A', 'B', 'C', 'D'])).toBe('à A, B, C ou D');
    expect(firstReviewCities(['A', 'B', 'C', 'D', 'E'])).toBe('dans l’une des villes ouvertes');
  });
});
