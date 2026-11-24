import { describe, expect, it } from 'vitest';
import {
  cursusKind,
  detectVariantSuffix,
  groupKey,
  labelCursus,
  placeName,
  planGroups,
  splitSubtitle,
  variantLabel,
  type CursusUnit,
  type PlanFiche,
} from '@/lib/catalog/variants';
import { specificPlaces } from '@/lib/connectors/monmaster-opendata/normalize';
import { splitMonMasterPlaces } from '@/lib/data/normalize';

/** Cursus of one parcours (issue #21). */

const LEA = 'RNCP39263';
const UNISTRA = '0673021V';
const OPEN_DATA_TITLE =
  'Projets de coopération et intelligence collective (tronc commun menant vers les M2 : « Management de projets de coopération internationaux et multilingues » et « Intelligence collective et écosystèmes innovants en Europe »)';

/** The three Strasbourg numbers as the Mon Master open data publishes them (session 2025). */
const STRASBOURG: CursusUnit[] = [
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
  id: f.id,
  title: OPEN_DATA_TITLE,
  workStudy: false,
  places: specificPlaces({
    places: splitMonMasterPlaces(f.lieux),
    etaName: 'Université de Strasbourg',
  }),
}));

const unit = (id: string, title: string, over: Partial<CursusUnit> = {}): CursusUnit => ({
  id,
  title,
  places: [],
  workStudy: false,
  ...over,
});
const place = (commune: string) => ({ label: 'UFR', commune, department: null });
const labels = (units: CursusUnit[]) => [...labelCursus(units).values()];

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
    [
      'Management de projet (apprentissage et contrat pro)',
      'Management de projet',
      'En alternance',
    ],
    ['Management de projet (formation continue)', 'Management de projet', 'Formation continue'],
    ['Management de projet (à distance)', 'Management de projet', 'À distance'],
    ['Management de projet (A distance)', 'Management de projet', 'À distance'],
    ['Management de projet (FOAD)', 'Management de projet', 'À distance'],
    [
      'Communication des organisations - en apprentissage',
      'Communication des organisations',
      'En apprentissage',
    ],
    ['Retailing supply chain - En alternance', 'Retailing supply chain', 'En alternance'],
    [
      'Ingénierie des Systèmes Mécaniques - Formation par Apprentissage',
      'Ingénierie des Systèmes Mécaniques',
      'En apprentissage',
    ],
    ['Finance - Formation initiale', 'Finance', 'Formation initiale'],
  ])('%s → %s · %s', (title, base, label) => {
    const d = detectVariantSuffix(title);
    expect(d.base).toBe(base);
    expect(d.label).toBe(label);
  });

  it('cuts two rhythms in a row', () => {
    expect(
      detectVariantSuffix(
        'Management de l’innovation - M1 Tronc commun - En Alternance (apprentissage et contrat pro)',
      ),
    ).toMatchObject({
      base: 'Management de l’innovation - M1 Tronc commun',
      label: 'En alternance',
    });
  });

  it('never cuts on a dash without one of the keywords', () => {
    for (const t of [
      'Management - Marketing',
      'Biologie-Santé - Plateforme Microbiologie',
      'Droit - Sites et sols pollués',
      'Physique - Campus',
      'Chimie - Cursus',
      'Comptabilité - Contrôle - Audit',
      'Professeur des écoles - Parcours classique',
      'Chimie - M1 Tronc commun',
      'Arts plastiques - 1ère année',
    ])
      expect(detectVariantSuffix(t)).toEqual({ base: t, suffix: null, label: null });
  });

  it('keeps parentheses that are not a rhythm, or not at the end', () => {
    for (const t of [
      'Tourisme et Développement (TD)',
      OPEN_DATA_TITLE,
      'Management (alternance) des organisations',
      'Espagnol (CAPES)',
      'Politiques publiques (M1)',
    ])
      expect(detectVariantSuffix(t).suffix).toBeNull();
  });

  it('cuts only the last suffix when it is not two rhythms', () => {
    expect(detectVariantSuffix('Gestion - Site de Troyes (alternance)')).toMatchObject({
      base: 'Gestion - Site de Troyes',
      label: 'En alternance',
    });
  });
});

describe('variantLabel', () => {
  it('is « Cursus principal » without a suffix', () => {
    expect(variantLabel(null)).toBe('Cursus principal');
  });
});

describe('splitSubtitle', () => {
  it('moves a final « tronc commun menant vers… » to a subtitle', () => {
    expect(splitSubtitle(OPEN_DATA_TITLE)).toEqual({
      title: 'Projets de coopération et intelligence collective',
      subtitle:
        'Tronc commun menant vers les M2 : « Management de projets de coopération internationaux et multilingues » et « Intelligence collective et écosystèmes innovants en Europe »',
    });
    expect(splitSubtitle('Chimie (menant au M2 Chimie verte)').title).toBe('Chimie');
    expect(splitSubtitle('Chimie (donnant accès au M2 X)').title).toBe('Chimie');
    expect(splitSubtitle('Chimie (Mène vers 3 M2)').title).toBe('Chimie');
  });

  it('keeps the other parentheses', () => {
    for (const t of [
      'Europe (LLCER : albanais, bosniaque-croate-serbe, bulgare)',
      'Tourisme et Développement (TD)',
      'Chimie (accessibilité numérique)',
    ])
      expect(splitSubtitle(t)).toEqual({ title: t, subtitle: null });
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

  it('ignores case, accents and repeated spaces', () => {
    const k = (title: string) => groupKey({ uai: '0673021v', mention: 'rncp 39263', title });
    expect(k('Études  européennes - Cursus Kehl')).toBe(k('etudes européennes - cursus Passau'));
    expect(k('Études européennes (Alternance)')).toBe(k('Etudes europeennes'));
  });
});

describe('planGroups', () => {
  const fiche = (id: string, title: string, over: Partial<PlanFiche> = {}): PlanFiche => ({
    id,
    title,
    uai: UNISTRA,
    mention: LEA,
    inmps: [],
    places: 10,
    slug: id,
    ...over,
  });
  const slug = () => 'wanted';

  it('groups a suffixed title whatever the inmp (rule 1)', () => {
    const g = planGroups(
      [
        fiche('a', 'Droit - Site Evry', { inmps: ['1'] }),
        fiche('b', 'Droit - Site Sceaux', { inmps: ['2'] }),
      ],
      slug,
    );
    expect(g).toHaveLength(1);
    expect(g[0]!.bySuffix).toBe(true);
  });

  it('groups identical titles only with the same or a missing inmp (rule 2)', () => {
    expect(
      planGroups(
        [fiche('a', 'Lettres', { inmps: ['1'] }), fiche('b', 'Lettres', { inmps: ['2'] })],
        slug,
      ),
    ).toEqual([]);
    expect(
      planGroups(
        [fiche('a', 'Lettres', { inmps: ['1'] }), fiche('b', 'Lettres', { inmps: ['1'] })],
        slug,
      ),
    ).toHaveLength(1);
    expect(
      planGroups([fiche('a', 'Lettres', { inmps: ['1'] }), fiche('b', 'Lettres')], slug),
    ).toHaveLength(1);
  });

  it('keeps an existing parcours, then the wanted slug, then the most places', () => {
    const a = fiche('a', 'X', { places: 5 });
    const b = fiche('b', 'X', { places: 30 });
    expect(planGroups([a, b], slug)[0]!.keeperId).toBe('b');
    expect(
      planGroups([a, { ...b, slug: 'other' }, { ...fiche('c', 'X'), slug: 'wanted' }], slug)[0]!
        .keeperId,
    ).toBe('c');
    expect(planGroups([{ ...a, isParcours: true }, b], slug)[0]!.keeperId).toBe('a');
  });
});

describe('labelCursus', () => {
  it('names the Strasbourg numbers by their own teaching place', () => {
    expect(labels(STRASBOURG)).toEqual(['Strasbourg', 'Kehl', 'Passau']);
    expect(cursusKind(labels(STRASBOURG))).toBe('named');
  });

  it('names a pair by its rhythm', () => {
    const l = labels([unit('a', 'Finance'), unit('b', 'Finance', { workStudy: true })]);
    expect(l).toEqual(['Formation initiale', 'En alternance']);
    expect(cursusKind(l)).toBe('rhythm');
    expect(labels([unit('a', 'Finance'), unit('b', 'Finance (apprentissage)')])).toEqual([
      'Formation initiale',
      'En apprentissage',
    ]);
  });

  it('calls « En présentiel » the one next to a distance one', () => {
    expect(labels([unit('a', 'Droit pénal'), unit('b', 'Droit pénal (FOAD)')])).toEqual([
      'En présentiel',
      'À distance',
    ]);
  });

  it('uses the city of the former fiche when the places do not tell them apart', () => {
    const p = [place('PARIS')];
    expect(
      labels([
        unit('a', 'Marketing', { places: p, hint: 'DIJON' }),
        unit('b', 'Marketing', { places: p, hint: 'Évry' }),
        unit('c', 'Marketing', { places: p, hint: 'Cholet' }),
      ]),
    ).toEqual(['Dijon', 'Évry', 'Cholet']);
  });

  it('gives nothing when nothing tells them apart (« fiches Mon Master »)', () => {
    const p = [place('PARIS')];
    const l = labels([
      unit('a', 'Professeurs', { places: p, hint: 'Paris' }),
      unit('b', 'Professeurs', { places: p, hint: 'Paris' }),
      unit('c', 'Professeurs', { places: p, hint: 'Paris' }),
    ]);
    expect(l).toEqual([null, null, null]);
    expect(cursusKind(l)).toBe('unnamed');
  });

  it('keeps « Cursus principal » for a last one only', () => {
    expect(labels([unit('a', 'Chimie'), unit('b', 'Chimie - Cursus international')])).toEqual([
      'Cursus principal',
      'International',
    ]);
  });

  it('removes « Site » when every label has it, keeps it otherwise', () => {
    expect(labels([unit('a', 'Droit - Site Evry'), unit('b', 'Droit - Site de Sceaux')])).toEqual([
      'Evry',
      'Sceaux',
    ]);
    expect(labels([unit('a', 'Droit - Site Evry'), unit('b', 'Droit (alternance)')])).toEqual([
      'Site Evry',
      'En alternance',
    ]);
  });

  it('gives no label to a parcours with one cursus', () => {
    expect(labels([unit('a', 'Chimie')])).toEqual([null]);
    expect(cursusKind([null])).toBe('single');
  });
});

describe('placeName', () => {
  it.each([
    ['STRASBOURG CEDEX', 'Strasbourg'],
    ['Rennes Cédex 9', 'Rennes'],
    ['KEHL', 'Kehl'],
    ['LE MANS', 'Le Mans'],
    ['La Roche sur Yon', 'La Roche-sur-Yon'],
    ['La Roche-sur Yon', 'La Roche-sur-Yon'],
    ['BONNEUIL SUR MARNE', 'Bonneuil-sur-Marne'],
    ["VILLENEUVE D'ASCQ", "Villeneuve-d'Ascq"],
    ['SAINT -ETIENNE', 'Saint-Etienne'],
    ['SAINT-DIE-DES-VOSGES', 'Saint-Die-des-Vosges'],
    ['Les Abymes (guadeloupe)', 'Les Abymes'],
    ['Évry', 'Évry'],
  ])('%s → %s', (raw, name) => expect(placeName(raw)).toBe(name));
});
