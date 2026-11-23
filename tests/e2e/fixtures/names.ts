/** Names of the end-to-end fixtures (./extras.ts), for the tests: no database import here. */
export const E2E_EXTRAS = {
  /** Droit, taught in Nantes and in Phnom Penh: « À l'étranger ». */
  abroad: 'e2e-droit-international-phnom-penh',
  /** Droit, with its programme (law courses and others). */
  programme: 'e2e-droit-des-affaires-nantes',
  /** A mention with a single parcours. */
  single: { mention: 'e2e-etudes-nordiques', program: 'e2e-etudes-nordiques-nantes' },
  /** The new Mon Master number of the merge proposal (a sibling of 2000144GJ2FE). */
  mergeIfc: '2000144GZ9XQ',
};

/** Cursus of one parcours (issue #21, ./cursus.ts): slugs before and after the grouping. */
export const E2E_CURSUS = {
  strasbourg: {
    parcours: 'projets-de-cooperation-et-intelligence-collective-universite-de-strasbourg-fixtu',
    olds: ['e2e-pcic-strasbourg', 'e2e-pcic-kehl', 'e2e-pcic-passau'],
    codes: ['2400012P6SQF', '2400012PGW1S', '2400012PISGY'],
  },
  /** Initial / work-study pair. */
  pair: { parcours: 'management-de-projets-fixtures-cursus-universite-de-strasbourg-fixtures', olds: ['e2e-mdp-initiale', 'e2e-mdp-alternance'] },
  /** 25 numbers that nothing tells apart (as « Professeurs des Lycées et Collèges » of the ICP). */
  icp: { parcours: 'enseignement-du-second-degre-fixtures-universite-de-strasbourg-fixtures', count: 25 },
  /** 26 cursus named by their city (as « Marketing intégré » of the CNAM). */
  cnam: { parcours: 'marketing-integre-dans-un-monde-digitalise-fixtures-universite-de-strasbourg-fix', count: 26 },
};

