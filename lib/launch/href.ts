/** Explorer on a zone (the « Lieu » facet: the city and its intercommunality). */
export const zoneHref = (slug: string) => `/explorer?lieu=${encodeURIComponent(`zone:${slug}`)}`;

/** The landing page of an open city (app/(public)/masters/[ville]). */
export const cityPageHref = (slug: string) => `/masters/${slug}`;
