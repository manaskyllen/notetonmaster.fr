/** Page ↔ parcours matching of the university sites (lib/connectors/univ-sites/match.ts). */
import { describe, expect, it } from 'vitest';
import {
  matchPage,
  splitTitle,
  type Candidate,
  type PageClues,
} from '@/lib/connectors/univ-sites/match';

const c = (
  id: string,
  title: string,
  mentionName: string,
  o: Partial<Candidate> = {},
): Candidate => ({
  id,
  title,
  city: 'Tours',
  mentionId: `m:${mentionName}`,
  mentionName,
  rncp: null,
  ifcs: [],
  ...o,
});
const page = (title: string, o: Partial<PageClues> = {}): PageClues => ({
  title,
  mentionHint: '',
  rncp: [],
  ifc: [],
  cities: [],
  level: null,
  ...o,
});

describe('titles', () => {
  it.each([
    [
      'MASTER Sciences, Technologies, Santé MENTION Sciences du vivant PARCOURS Biotechnologies et droit',
      'Sciences du vivant',
      'Biotechnologies et droit',
    ],
    [
      'MASTER Physique fondamentale et applications - Parcours Matière et Rayonnements (MR)',
      'Physique fondamentale et applications',
      'Matière et Rayonnements (MR)',
    ],
    [
      'Master Risques et Environnement parcours Ingénierie environnementale et énergies nouvelles',
      'Risques et Environnement',
      'Ingénierie environnementale et énergies nouvelles',
    ],
    ['Master mention Droit public', 'Droit public', ''],
  ])('%s', (title, mention, parcours) => {
    expect(splitTitle(title)).toMatchObject({ mention, parcours });
  });

  it('the Ametys parent title gives the mention of a parcours page', () => {
    expect(
      splitTitle('European Master of Governance (M1-M2)', 'Master STAPS : Management du sport'),
    ).toMatchObject({
      mention: 'STAPS : Management du sport',
      parcours: 'European Master of Governance',
    });
  });
});

describe('matching', () => {
  const tours = [
    c('bio', 'Biotechnologies et droit', 'Sciences du vivant', { rncp: 'RNCP38194' }),
    c('bio-alt', 'Biotechnologies et droit', 'Sciences du vivant', { rncp: 'RNCP38194' }), // work-study version
    c('gen', 'Génétique et génomique', 'Sciences du vivant', { rncp: 'RNCP38194' }),
    c('dp', 'Droit public des affaires', 'Droit public', { city: 'Blois' }),
    c('dp2', 'Droit et gestion publique locale', 'Droit public'),
  ];

  it('a Mon Master number cited in the page wins', () => {
    const m = matchPage(page('Page sans titre utile', { ifc: ['2500101KDKQN'] }), [
      c('x', 'X', 'M', { ifcs: ['2500101KDKQN'] }),
      ...tours,
    ]);
    expect(m).toMatchObject({ status: 'LINKED', programIds: ['x'], score: 1 });
  });

  it('mention + parcours in the title: both modalities of the parcours', () => {
    const m = matchPage(
      page(
        'MASTER Sciences, Technologies, Santé MENTION Sciences du vivant PARCOURS Biotechnologies et droit',
      ),
      tours,
    );
    expect(m.status).toBe('LINKED');
    expect(m.level).toBe('PARCOURS');
    expect(m.programIds.sort()).toEqual(['bio', 'bio-alt']);
  });

  it('establishment + city + title when the page names no mention', () => {
    const m = matchPage(page('Droit public des affaires', { cities: ['Blois'] }), tours);
    expect(m).toMatchObject({ status: 'LINKED', programIds: ['dp'] });
  });

  it('a close title is only a proposal; a far one is nothing', () => {
    expect(
      matchPage(page('Parcours Génétique, génomique et biologie des systèmes'), tours).status,
    ).toBe('PROPOSED');
    expect(matchPage(page('Master Physique des particules'), tours).status).toBe('NEW');
  });

  it('a mention page listing several parcours fills the mention only', () => {
    const m = matchPage(page('Master mention Sciences du vivant', { rncp: ['RNCP38194'] }), tours);
    expect(m).toMatchObject({
      status: 'LINKED',
      level: 'MENTION',
      mentionId: 'm:Sciences du vivant',
      programIds: [],
    });
  });

  it('a mention with a single parcours: the mention page is the parcours page', () => {
    const one = [
      c('only', 'Histoire de l’art', 'Histoire de l’art', { rncp: 'RNCP40000' }),
      ...tours,
    ];
    const m = matchPage(page('Master Histoire de l’art', { rncp: ['RNCP40000'] }), one);
    expect(m).toMatchObject({ status: 'LINKED', level: 'PARCOURS', programIds: ['only'] });
  });

  it('two parcours with the same title in two mentions: never linked automatically', () => {
    const twins = [
      c('a', 'Management de projets', 'Management'),
      c('b', 'Management de projets', 'Gestion de projets'),
    ];
    expect(matchPage(page('Management de projets'), twins).status).toBe('PROPOSED');
    expect(
      matchPage(page('Master Management - Parcours Management de projets'), twins),
    ).toMatchObject({ status: 'LINKED', programIds: ['a'] });
  });

  it('a page about the internships of a parcours is not its fiche', () => {
    expect(
      matchPage(page('Stage Master Sciences du vivant - Parcours Biotechnologies et droit'), tours)
        .status,
    ).toBe('NEW');
  });

  it('an Ametys parcours page (two levels) is never taken for a mention page', () => {
    const m = matchPage(page('Sciences du vivant', { level: 'PARCOURS' }), tours);
    expect(m.level).not.toBe('MENTION');
  });
});
