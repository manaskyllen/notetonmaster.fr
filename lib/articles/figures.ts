/**
 * Figures of the guides: what the tokens and the data blocks read, for one scope (a city, or
 * « toutes » for a guide about every city). Built from the search index (published parcours of
 * public establishments, the same rows and the same access rate as the city pages and Explorer:
 * offers / applications × 100 of the latest Mon Master session of the parcours, lib/catalog/
 * program-index.ts), stored in ArticleFigures after each sync (figures.server.ts). Pure here.
 */

export type Band = 'tres-selectif' | 'selectif' | 'accessible' | 'nc';

/** One parcours of the scope. */
export interface FigureRow {
  slug: string;
  title: string;
  university: string;
  universitySlug: string;
  mention: string;
  /** Domain slug (arts-lettres-langues…), null when unknown. */
  domain: string | null;
  /** presentiel | alternance | continue | distance */
  modalities: string[];
  places: number | null;
  applications: number | null;
  offers: number | null;
  /** Percentage, 0–100. */
  accessRate: number | null;
  band: Band;
  /** Session of its figures (the latest one of the parcours). */
  session: number | null;
}

export interface FigureUniversity {
  slug: string;
  name: string;
  /** Other names of a token: its short name and keywords, slugified (« cnam », « institut-agro »). */
  aliases: string[];
}

export interface Figures {
  /** « ville:nantes » or « toutes ». */
  scope: string;
  city: { slug: string; name: string } | null;
  /** Latest Mon Master session of the database. */
  session: number | null;
  rows: FigureRow[];
  /** Published reviews of the parcours of the scope. */
  reviews: number;
  universities: FigureUniversity[];
  /** Totals of the site: public parcours in the open cities, open cities with a parcours. */
  site: { programs: number; cities: number };
  /** Open cities, most furnished first (block « villes »). */
  cities: { slug: string; name: string; programs: number }[];
  /** ISO date of the computation. */
  computedAt: string;
  /** Last successful Mon Master sync (ISO), « base mise à jour le ». */
  dataUpdatedAt: string | null;
}

export const SCOPE_ALL = 'toutes';
export const cityScope = (slug: string | null | undefined) => (slug ? `ville:${slug}` : SCOPE_ALL);

/** Token codes of the domains → domain slugs of the site. */
export const DOMAIN_CODES: Record<string, { slug: string; label: string }> = {
  all: { slug: 'arts-lettres-langues', label: 'Arts, lettres, langues' },
  shs: { slug: 'sciences-humaines-et-sociales', label: 'Sciences humaines et sociales' },
  deg: { slug: 'droit-economie-gestion', label: 'Droit, économie, gestion' },
  sts: { slug: 'sciences-technologies-sante', label: 'Sciences, technologies, santé' },
};

export interface CityCounts {
  programs: number;
  establishments: number;
  mentions: number;
  veryselective: number;
  selective: number;
  accessible: number;
  workStudy: number;
  remote: number;
}

export function counts(f: Figures): CityCounts {
  const r = f.rows;
  return {
    programs: r.length,
    establishments: new Set(r.map((x) => x.universitySlug)).size,
    mentions: new Set(r.map((x) => x.mention)).size,
    veryselective: r.filter((x) => x.band === 'tres-selectif').length,
    selective: r.filter((x) => x.band === 'selectif').length,
    accessible: r.filter((x) => x.band === 'accessible').length,
    workStudy: r.filter((x) => x.modalities.includes('alternance')).length,
    remote: r.filter((x) => x.modalities.includes('distance')).length,
  };
}

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** The university of an `etablissement.<x>` token: slug first, then short names and keywords. */
export function findUniversity(f: Figures, key: string): FigureUniversity | null {
  return (
    f.universities.find((u) => u.slug === key) ??
    f.universities.find((u) => u.aliases.includes(key)) ??
    null
  );
}
