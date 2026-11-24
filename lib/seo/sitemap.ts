import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { cityMentionPairs, getCityOverview } from '@/lib/catalog/cities';
import { publishedGuides } from '@/lib/articles/queries';
import { prisma } from '@/lib/db';
import { cachedOpenZones } from '@/lib/launch/cached';
import { LEGAL_DOCS, readLegalDoc } from '@/lib/legal';
import { absoluteUrl } from './site';

/**
 * Sitemaps: an index (/sitemap.xml), then one file per kind of page (/sitemaps/<name>.xml).
 * Only indexable, canonical addresses (public establishments, open cities), each with a real
 * lastmod: the last change of the parcours or the last review published, never the build date.
 * Cached one hour, expired with the catalogue and the zones.
 */
export const SITEMAPS = [
  'pages',
  'villes',
  'guides',
  'mentions',
  'universites',
  'parcours',
] as const;
export type SitemapName = (typeof SITEMAPS)[number];

export interface SitemapEntry {
  path: string;
  lastmod: Date | string | null;
}

/**
 * Last change of a parcours: the row itself or its last published review, the latter rounded to
 * the month (the exact time of a review is never public).
 */
const LASTMOD = `greatest(p."updatedAt", (SELECT date_trunc('month', max(r."publishedAt")) FROM "Review" r
                   WHERE r."programId" = p.id AND r.status = 'PUBLISHED'))`;

async function compute(name: SitemapName): Promise<SitemapEntry[]> {
  switch (name) {
    case 'parcours':
      // raw-sql: constant LASTMOD expression; no value from a request.
      return prisma.$queryRawUnsafe<SitemapEntry[]>(
        `SELECT '/parcours/' || i.slug AS path, ${LASTMOD} AS lastmod
           FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"
          WHERE i."isPublicSector" ORDER BY i.slug`,
      );
    case 'mentions':
      // raw-sql: constant LASTMOD expression; no value from a request.
      return prisma.$queryRawUnsafe<SitemapEntry[]>(
        `SELECT '/mentions/' || i."mentionSlug" AS path, max(${LASTMOD}) AS lastmod
           FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"
          WHERE i."isPublicSector" GROUP BY i."mentionSlug" ORDER BY 1`,
      );
    case 'universites':
      // An établissement-composante's parcours also make its parent's page change.
      // raw-sql: constant LASTMOD expression; no value from a request.
      return prisma.$queryRawUnsafe<SitemapEntry[]>(
        `SELECT '/universites/' || u.slug AS path, max(${LASTMOD}) AS lastmod
           FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"
           JOIN "University" u ON u.id = i."universityId" OR u.id = i."universityParentId"
          WHERE i."isPublicSector" AND u."isPublished" AND u.sector = 'PUBLIC'
          GROUP BY u.slug ORDER BY 1`,
      );
    case 'villes': {
      const [zones, pairs] = await Promise.all([cachedOpenZones(), cityMentionPairs()]);
      const cities = await Promise.all(zones.map((z) => getCityOverview(z.slug)));
      return [
        ...cities.flatMap((c) =>
          c ? [{ path: `/masters/${c.zone.slug}`, lastmod: c.updatedAt }] : [],
        ),
        ...pairs.map((p) => ({ path: `/masters/${p.city}/${p.mention}`, lastmod: p.updatedAt })),
      ];
    }
    case 'guides': {
      // Published guides only (their city open): drafts are never listed, never indexed.
      const guides = await publishedGuides();
      return [
        {
          path: '/guides',
          lastmod:
            guides
              .map((g) => g.updatedAt)
              .sort()
              .at(-1) ?? null,
        },
        ...guides.map((g) => ({ path: `/guides/${g.slug}`, lastmod: g.updatedAt })),
      ];
    }
    case 'pages': {
      const [[last], legal] = await Promise.all([
        // raw-sql: constant LASTMOD expression; no value from a request.
        prisma.$queryRawUnsafe<{ lastmod: Date | null }[]>(
          `SELECT max(${LASTMOD}) AS lastmod FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"`,
        ),
        Promise.all(
          LEGAL_DOCS.map(async (d) => ({ slug: d.slug, doc: await readLegalDoc(d.slug) })),
        ),
      ]);
      const catalog = last?.lastmod ?? null;
      return [
        { path: '/', lastmod: catalog },
        { path: '/explorer', lastmod: catalog },
        { path: '/mentions', lastmod: catalog },
        { path: '/universites', lastmod: catalog },
        { path: '/masters', lastmod: catalog },
        // No reliable date for the About page: no lastmod rather than a false one.
        { path: '/a-propos', lastmod: null },
        ...legal.map((l) => ({ path: `/legal/${l.slug}`, lastmod: l.doc.updated })),
      ];
    }
  }
}

export const sitemapEntries = (name: SitemapName) =>
  unstable_cache(() => compute(name), ['sitemap', name], {
    revalidate: 3600,
    tags: [TAGS.catalog, TAGS.zones, TAGS.articles],
  })();

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

function day(d: Date | string | null): string | null {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const rows = entries.map((e) => {
    const lm = day(e.lastmod);
    return `<url><loc>${esc(absoluteUrl(e.path))}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

export function sitemapIndexXml(items: { name: string; lastmod: Date | string | null }[]): string {
  const rows = items.map((i) => {
    const lm = day(i.lastmod);
    return `<sitemap><loc>${esc(absoluteUrl(`/sitemaps/${i.name}.xml`))}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`;
}

/** The most recent lastmod of a list. */
export function latest(entries: SitemapEntry[]): Date | null {
  let best: number | null = null;
  for (const e of entries) {
    const t = e.lastmod ? new Date(e.lastmod).getTime() : NaN;
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best);
}

export const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
};
