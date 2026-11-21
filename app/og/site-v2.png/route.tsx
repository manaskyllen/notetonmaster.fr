import { ogSite } from '@/lib/seo/og-card';

export const dynamic = 'force-static';

/** Default share image (pages without their own). */
export async function GET() {
  const img = await ogSite();
  img.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return img;
}
