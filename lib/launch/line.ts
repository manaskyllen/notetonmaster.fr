/** Cities named on the line of the home before « et n autres ». */
export const LINE_MAX = 3;

/**
 * The one line of the home under the search, whatever the number of open cities:
 * - 3 or fewer: « Déjà ouvert à Strasbourg, Nantes et Mulhouse · Voir les universités → »;
 * - beyond: « Déjà ouvert dans 6 villes : Lyon, Marseille, Strasbourg et 3 autres · Voir toutes
 *   les villes → », to /masters.
 * The zones come sorted and filtered (getOpenZones: most masters first, never a city without
 * one). `seps[i]` follows `shown[i]`.
 */
export function openCitiesLine<Z>(zones: Z[]) {
  const n = zones.length;
  const shown = zones.slice(0, LINE_MAX);
  const few = n <= LINE_MAX;
  const seps = shown.map((_, i) =>
    i === shown.length - 1 ? '' : few && i === shown.length - 2 ? ' et ' : ', ',
  );
  const more = n - shown.length;
  return {
    intro: few ? 'Déjà ouvert à' : `Déjà ouvert dans ${n} villes :`,
    shown,
    seps,
    rest: more > 0 ? ` et ${more} autre${more > 1 ? 's' : ''}` : '',
    link: few ? 'Voir les universités' : 'Voir toutes les villes',
    href: few ? '/universites' : '/masters',
  };
}
