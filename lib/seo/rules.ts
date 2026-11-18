/**
 * Lengths aimed at for titles and descriptions (docs/seo/audit.md). Google cuts a title around
 * 600 px (≈ 60 characters) and a description around 920 px on a computer (≈ 155 characters):
 * the generators aim at TARGET, the SEO check fails outside [MIN, MAX].
 */
export const TITLE = { min: 25, target: 60, max: 70 } as const;
export const DESCRIPTION = { min: 70, target: 155, max: 170 } as const;

/** The canonical site: production only when APP_URL is exactly this origin. */
export const CANONICAL_ORIGIN = 'https://notetonmaster.fr';

/** Hosts that answer 301 to the canonical origin (same path). */
export const ALIAS_HOSTS = ['www.notetonmaster.fr', 'notetonmaster.com', 'www.notetonmaster.com'];

/** Brand in titles and descriptions: one word, no visual styling. */
export const BRAND = 'notetonmaster';
