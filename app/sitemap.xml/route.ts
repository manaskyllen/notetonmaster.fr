import { latest, sitemapEntries, sitemapIndexXml, SITEMAPS, XML_HEADERS } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

/** Sitemap index: one sitemap per kind of page (lib/seo/sitemap.ts). */
export async function GET() {
  const items = await Promise.all(
    SITEMAPS.map(async (name) => ({ name, lastmod: latest(await sitemapEntries(name)) })),
  );
  return new Response(sitemapIndexXml(items), { headers: XML_HEADERS });
}
