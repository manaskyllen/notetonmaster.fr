import { describe, expect, it } from 'vitest';
import {
  detectVariantSuffix,
  groupKey,
  placeLabels,
  placeName,
  variantLabel,
} from '@/lib/catalog/variants';
import { specificPlaces } from '@/lib/connectors/monmaster-opendata/normalize';
import { splitMonMasterPlaces } from '@/lib/data/normalize';

/** Cursus of one parcours (issue #21). */

const LEA = 'RNCP39263';
const UNISTRA = '0673021V';
const OPEN_DATA_TITLE =
  'Projets de coopération et intelligence collective (tronc commun menant vers les M2 : « Management de projets de coopération internationaux et multilingues » et « Intelligence collective et écosystèmes innovants en Europe »)';

/** The three Strasbourg numbers as the Mon Master open data publishes them (session 2025). */
const STRASBOURG = [
  {
    id: '2400012P6SQF',
    lieux: 'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)',
  },
  {
    id: '2400012PGW1S',
    lieux:
      'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)|Hochschule für öffentliche Verwaltung - KEHL',
  },
  {
    id: '2400012PISGY',
    lieux:
      'Université de Strasbourg - STRASBOURG CEDEX (67)|Faculté des Langues - STRASBOURG (67)|Universität Passau - PASSAU',
  },
].map((f) => ({
  ...f,
  workStudy: false,
  places: specificPlaces({
    places: splitMonMasterPlaces(f.lieux),
    etaName: 'Université de Strasbourg',
  }),
}));

describe('detectVariantSuffix', () => {
  it.each([
    ['Chimie - Site Orsay', 'Chimie', 'Site Orsay'],
    ['MEEF 1er degré - Site de Niort', 'MEEF 1er degré', 'Site de Niort'],
    [
      'Tourisme et Développement (TD) - site de Foix',
      'Tourisme et Développement (TD)',
      'Site de Foix',
    ],
    ['Droit des affaires – Site Evry', 'Droit des affaires', 'Site Evry'],
    ['Biochimie et biotechnologies-Site Evry', 'Biochimie et biotechnologies', 'Site Evry'],
    [
      'Comptabilité, contrôle, audit - Campus de Grenoble',
      'Comptabilité, contrôle, audit',
      'Campus de Grenoble',
    ],
    [
      'Ingénierie des systèmes complexes - Voie industrie',
      'Ingénierie des systèmes complexes',
      'Voie industrie',
    ],
    ['Projets de coopération — cursus Kehl', 'Projets de coopération', 'Kehl'],
    ['Projets de coopération - Cursus Passau', 'Projets de coopération', 'Passau'],
    ['Management de projet (alternance)', 'Management de projet', 'En alternance'],
    ['Management de projet (Apprentissage)', 'Management de projet', 'En apprentissage'],
    ['Management de projet (formation continue)', 'Management de projet', 'Formation continue'],
    ['Management de projet (à distance)', 'Management de projet', 'À distance'],
    ['Management de projet (A distance)', 'Management de projet', 'À distance'],
    ['Management de projet (FOAD)', 'Management de projet', 'À distance (FOAD)'],
  ])('%s → %s · %s', (title, base, label) => {
    const d = detectVariantSuffix(title);
    expect(d.base).toBe(base);
    expect(d.label).toBe(label);
  });

  it('never cuts on a dash without one of the keywords', () => {
    for (const t of [
      'Management - Marketing',
      'Biologie-Santé - Plateforme Microbiologie',
      'Droit - Sites et sols pollués', // « Sites et » is not « site X »: no name after the keyword
      'Physique - Campus', // keyword without a name
      'Chimie - Cursus',
    ])
      expect(detectVariantSuffix(t)).toEqual({ base: t, suffix: null, label: null });
  });

  it('keeps parentheses that are not a rhythm, or not at the end', () => {
    for (const t of [
      'Tourisme et Développement (TD)',
      OPEN_DATA_TITLE,
      'Management (alternance) des organisations',
    ])
      expect(detectVariantSuffix(t).suffix).toBeNull();
  });

  it('cuts only the last suffix', () => {
    expect(detectVariantSuffix('Gestion - Site de Troyes (alternance)')).toMatchObject({
      base: 'Gestion - Site de Troyes',
      label: 'En alternance',
    });
  });
});

describe('variantLabel', () => {
  it('is « Cursus principal » without a suffix', () => {
    expect(variantLabel(null)).toBe('Cursus principal');
    expect(variantLabel(detectVariantSuffix('Chimie').suffix)).toBe('Cursus principal');
  });
});

describe('groupKey', () => {
  it('groups the three Strasbourg numbers, as published in the open data (same title)', () => {
    const keys = STRASBOURG.map(() =>
      groupKey({ uai: UNISTRA, mention: LEA, title: OPEN_DATA_TITLE }),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('groups them too with the suffixes of the candidate site', () => {
    const titles = ['cursus Strasbourg', 'cursus Kehl', 'Cursus Passau'].map(
      (s) => `Projets de coopération et intelligence collective - ${s}`,
    );
    expect(
      new Set(titles.map((title) => groupKey({ uai: UNISTRA, mention: LEA, title }))).size,
    ).toBe(1);
    expect(titles.map((t) => detectVariantSuffix(t).label)).toEqual([
      'Strasbourg',
      'Kehl',
      'Passau',
    ]);
  });

  it('labels the Strasbourg numbers by their own teaching place', () => {
    const labels = placeLabels(STRASBOURG);
    expect(STRASBOURG.map((f) => labels.get(f.id))).toEqual(['Strasbourg', 'Kehl', 'Passau']);
  });

  it('does not group another mention, nor another establishment', () => {
    const a = groupKey({ uai: UNISTRA, mention: LEA, title: 'Traduction - Site de Colmar' });
    expect(
      groupKey({ uai: UNISTRA, mention: 'RNCP39264', title: 'Traduction - Site de Mulhouse' }),
    ).not.toBe(a);
    expect(
      groupKey({ uai: '0681166Y', mention: LEA, title: 'Traduction - Site de Mulhouse' }),
    ).not.toBe(a);
    expect(groupKey({ uai: UNISTRA, mention: LEA, title: 'Traduction - Site de Mulhouse' })).toBe(
      a,
    );
  });

  it('does not group a title cut on a dash without keyword', () => {
    expect(groupKey({ uai: UNISTRA, mention: LEA, title: 'Management - Marketing' })).not.toBe(
      groupKey({ uai: UNISTRA, mention: LEA, title: 'Management - Finance' }),
    );
  });

  it('ignores case, accents and repeated spaces', () => {
    const k = (title: string) => groupKey({ uai: '0673021v', mention: 'rncp 39263', title });
    expect(k('Études  européennes - Cursus Kehl')).toBe(k('etudes européennes - cursus Passau'));
    expect(k('Études européennes - Site de Colmar')).toBe(
      k('ETUDES EUROPEENNES - site de Mulhouse'),
    );
    expect(k('Études européennes (Alternance)')).toBe(k('Etudes europeennes'));
  });
});

describe('placeLabels', () => {
  const place = (commune: string) => ({ label: 'UFR', commune, department: null });

  it('falls back on the rhythm when the places are the same', () => {
    const labels = placeLabels([
      { id: 'a', places: [place('NANTES')], workStudy: false },
      { id: 'b', places: [place('NANTES')], workStudy: true },
    ]);
    expect([...labels.values()]).toEqual(['Cursus principal', 'En alternance']);
  });

  it('gives nothing when nothing tells them apart', () => {
    const labels = placeLabels([
      { id: 'a', places: [place('NANTES')], workStudy: false },
      { id: 'b', places: [place('NANTES')], workStudy: false },
    ]);
    expect([...labels.values()]).toEqual([null, null]);
  });

  it('writes place names in title case', () => {
    expect(placeName('SAINT-DIE-DES-VOSGES')).toBe('Saint-Die-des-Vosges');
    expect(placeName('KEHL')).toBe('Kehl');
    expect(placeName('LE MANS')).toBe('Le Mans');
    expect(placeName('BONNEUIL SUR MARNE')).toBe('Bonneuil sur Marne');
    expect(placeName('Kehl')).toBe('Kehl');
  });
});
