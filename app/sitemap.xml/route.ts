import { latest, sitemapEntries, sitemapIndexXml, SITEMAPS, XML_HEADERS } from '@/lib/seo/sitemap';
import { sitemapsWithheld } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

/** Sitemap index: one sitemap per kind of page (lib/seo/sitemap.ts); empty while indexing is off. */
export async function GET() {
  const items = sitemapsWithheld()
    ? []
    : await Promise.all(
        SITEMAPS.map(async (name) => ({ name, lastmod: latest(await sitemapEntries(name)) })),
      );
  return new Response(sitemapIndexXml(items), { headers: XML_HEADERS });
}
