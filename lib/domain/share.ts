/**
 * Sharing a fiche parcours (issue #13): the fiche itself, or its review form already set on the
 * parcours. Plain addresses only: no `utm_*`, nothing about the person who shares.
 */
export interface ShareTarget {
  id: 'fiche' | 'avis';
  label: string;
  hint: string;
  url: string;
  /** For navigator.share. */
  title: string;
  text: string;
}

export interface ShareInput {
  origin: string;
  slug: string;
  /** Name of the parcours (without « Master »). */
  parcours: string;
  /** Establishment (short name when it has one). */
  university: string;
}

/** The canonical address of a fiche, and its review form set on the parcours. */
export function ficheUrl(origin: string, slug: string): string {
  return `${origin}/parcours/${encodeURIComponent(slug)}`;
}
export function reviewFormUrl(origin: string, slug: string): string {
  return `${origin}/avis/nouveau?parcours=${encodeURIComponent(slug)}`;
}

/** Title of the review form set on a parcours (page title and link previews). */
export const reviewFormTitle = (parcours: string) => `Donne ton avis sur ${parcours}`;

export function shareTargets(i: ShareInput): ShareTarget[] {
  return [
    {
      id: 'fiche',
      label: 'Partager ce master',
      hint: 'Le lien de cette fiche',
      url: ficheUrl(i.origin, i.slug),
      title: `${i.parcours} — ${i.university}, sur notetonmaster`,
      text: `${i.parcours} — ${i.university}, sur notetonmaster`,
    },
    {
      id: 'avis',
      label: 'Inviter ma promo à donner son avis',
      hint: 'Le formulaire d’avis, déjà réglé sur ce parcours',
      url: reviewFormUrl(i.origin, i.slug),
      title: reviewFormTitle(i.parcours),
      text: `Tu as fait le master ${i.parcours} ? Donne ton avis, c’est anonyme et ça aide les suivant·es.`,
    },
  ];
}
