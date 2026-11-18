/**
 * Names of the integration fixtures (tests/integration/fixtures/load.ts). A test finds its data
 * through these slugs and codes, never through « the first row that happens to match ».
 */
export const FX = {
  universities: {
    /** From the demo seed; the fixtures give it its official mail domain. */
    nantes: 'nantes-universite',
    strasbourg: 'it-universite-de-strasbourg',
    /** 190 fiches for the bulk actions and the source rules. */
    lot: 'it-universite-du-lot',
  },
  mentions: {
    droit: 'droit',
    saintNazaire: 'it-genie-maritime',
    civilisations: 'civilisations-cultures-et-societes',
    lot: 'it-mention-du-lot',
  },
  programs: {
    /** Illkirch-Graffenstaden (Eurométropole de Strasbourg, open): work-study, M1, selective. */
    illkirch: 'it-droit-des-affaires-illkirch',
    /** Colmar (closed city). */
    colmar: 'it-droit-public-colmar',
    /** Saint-Nazaire (outside Nantes Métropole, closed). */
    saintNazaire: 'it-genie-maritime-saint-nazaire',
    /** A published parcours without any question (Q&A tests create theirs). */
    questions: 'it-questions-parcours',
    /** Demo seed: history across two Mon Master numbers (fixtures add 2023 and 2024). */
    vnp: 'valorisation-des-nouveaux-patrimoines',
    /** Demo seed: two Mon Master numbers (fixtures add the origins of the admitted). */
    acpci: 'administration-culturelle-projets-culturels-internationaux',
    lotPrefix: 'it-lot-',
  },
  lotSize: 190,
  insee: {
    nantes: '44109',
    saintNazaire: '44184',
    strasbourg: '67482',
    illkirch: '67218',
    colmar: '68066',
    mulhouse: '68224',
  },
  /** Official staff domain of Nantes Université (droit de réponse). */
  nantesMailDomain: 'univ-nantes.fr',
} as const;
