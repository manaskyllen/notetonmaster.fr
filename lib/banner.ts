import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import type { BannerData } from '@/lib/domain/banner';

/** Cache tag of the banner, expired at each save (Paramètres › Bandeau d'information). */
export const BANNER_TAG = 'banner';

/**
 * The banner row, cached with the tag `banner` and revalidated every 5 minutes: the start and end
 * dates apply without a deploy. Visibility is computed at render time (bannerShownOn).
 */
export const getBanner = unstable_cache(
  async (): Promise<BannerData | null> => {
    const b = await prisma.siteBanner.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!b) return null;
    return {
      id: b.id,
      message: b.message,
      linkLabel: b.linkLabel,
      linkUrl: b.linkUrl,
      tone: b.tone,
      scope: b.scope,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt?.toISOString() ?? null,
      dismissible: b.dismissible,
      active: b.active,
      updatedAt: b.updatedAt.toISOString(),
    };
  },
  ['site-banner'],
  { tags: [BANNER_TAG], revalidate: 300 },
);
