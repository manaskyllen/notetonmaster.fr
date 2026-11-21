/** Brand copy shared by the home hero, metadata and the share image. */

/**
 * Home hero headline and default share image, until there are reviews. `line1` then `line2` on
 * desktop, `highlight` in the lime label, never broken.
 */
export const HOME_HEADLINE = {
  line1: 'Ton master, tu lui',
  line2: 'mets',
  highlight: 'combien\u202f?',
} as const;

/** The headline read in one go (alternative text of the share image). */
export const HOME_HEADLINE_TEXT = `${HOME_HEADLINE.line1} ${HOME_HEADLINE.line2} ${HOME_HEADLINE.highlight}`;

export const SITE_DESCRIPTION =
  'Programmes, admission et vrais retours d’étudiant·es : compare les masters des universités publiques, parcours par parcours.';
