import {
  sitemapEntries,
  SITEMAPS,
  urlsetXml,
  XML_HEADERS,
  type SitemapName,
} from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

/** /sitemaps/parcours.xml, /sitemaps/villes.xml… (lib/seo/sitemap.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const key = name.replace(/\.xml$/, '') as SitemapName;
  if (!name.endsWith('.xml') || !SITEMAPS.includes(key))
    return new Response('Introuvable', { status: 404 });
  return new Response(urlsetXml(await sitemapEntries(key)), { headers: XML_HEADERS });
}
