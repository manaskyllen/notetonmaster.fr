import 'server-only';
import type { getProgram } from '@/lib/queries/catalog';
import { ficheUrl, reviewFormUrl, type ShareData } from '@/lib/domain/share';
import { splitParcoursTitle } from '@/lib/domain/titles';
import { ogImagePath } from '@/lib/seo/og-path';
import { siteOrigin } from '@/lib/seo/site';

type Program = NonNullable<Awaited<ReturnType<typeof getProgram>>>;

/** Share image of the review form set on a parcours (app/og/[kind]/[file]/route.tsx). */
export const reviewFormOgPath = (slug: string, parcours: string) =>
  ogImagePath('avis', slug, [parcours]);

/** What « Partager » needs for a parcours: its facts and its two links, without any tracker. */
export function shareDataFor(p: Program): ShareData {
  const origin = siteOrigin();
  return {
    parcours: splitParcoursTitle(p.title).title,
    university: p.university.shortName ?? p.university.name,
    city: p.city,
    reviewCount: p.reviewCount,
    links: { decouvrir: ficheUrl(origin, p.slug), promo: reviewFormUrl(origin, p.slug) },
  };
}
