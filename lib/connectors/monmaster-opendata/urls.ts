/** Mon Master open data: dataset names and public pages. No dependency (pages import it). */
export const ESR_DATA_HOST = 'data.enseignementsup-recherche.gouv.fr';
export const DATASETS = { main: 'fr-esr-mon_master', y2023: 'fr-esr-mon_master_2023' } as const;
export const datasetUrl = (session: number) =>
  `https://${ESR_DATA_HOST}/explore/dataset/${session === 2023 ? DATASETS.y2023 : DATASETS.main}/`;
