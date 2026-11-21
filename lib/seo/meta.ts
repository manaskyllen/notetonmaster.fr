import type { Metadata } from 'next';
import { HOME_HEADLINE_TEXT } from '@/lib/brand/copy';
import { pageHref, type Params } from '@/lib/pagination';
import { absoluteUrl } from './site';

/**
 * Default share image (app/og/site-v2.png). A new name when its content changes: Discord, LinkedIn…
 * keep an image by its address.
 */
export const SITE_OG_IMAGE = {
  path: '/og/site-v2.png',
  alt: `notetonmaster · ${HOME_HEADLINE_TEXT}`,
};

/**
 * Metadata of a public page, built the same way everywhere: absolute title (already ending in
 * « | notetonmaster »), description, absolute canonical, robots, and the Open Graph / Twitter
 * tags (Next.js replaces `openGraph` as a whole: every page gives all of it).
 */
export function seoMetadata(o: {
  title: string;
  description: string;
  /** Canonical path (« /parcours/x », « /mentions/droit?page=2 »). */
  canonical: string;
  /** noindex, follow (filtered or search variants). */
  noindex?: boolean;
  /** Path of the Open Graph image (1200×630); the site image when absent. */
  image?: { path: string; alt: string };
  type?: 'website' | 'article';
}): Metadata {
  const url = absoluteUrl(o.canonical);
  const image = o.image ?? SITE_OG_IMAGE;
  const images = [{ url: absoluteUrl(image.path), width: 1200, height: 630, alt: image.alt }];
  return {
    title: { absolute: o.title },
    description: o.description,
    alternates: { canonical: url },
    ...(o.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: o.type ?? 'website',
      siteName: 'notetonmaster',
      locale: 'fr_FR',
      url,
      title: o.title,
      description: o.description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: o.title,
      description: o.description,
      images: images.map((i) => i.url),
    },
  };
}

/** Pages never indexed (account, forms, tokens): noindex, and disallowed in robots.txt. */
export const PRIVATE_ROBOTS: Metadata['robots'] = { index: false, follow: false };

/** Path prefixes of those pages (robots.txt and the X-Robots-Tag header of proxy.ts). */
export const PRIVATE_PREFIXES = [
  '/espace',
  '/admin',
  '/connexion',
  '/avis',
  '/signaler',
  '/reponse',
  '/reponse-formation',
  '/messages',
  '/api',
] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Indexing of a list page from its query string:
 * - only `page` (or nothing): indexable, its own canonical (page 2 → « ?page=2 »);
 * - any other parameter (filter, sort, search, page size): noindex, follow, canonical to the
 *   list without filters (at the same page when `keepPage`).
 * `strict`: only the bare address is indexable (Explorer, the home results): even « ?page=2 »
 * is noindex there, with its own canonical.
 */
export function listIndexing(
  pathname: string,
  sp: Params,
  opts: { strict?: boolean; ignore?: string[] } = {},
): { canonical: string; noindex: boolean; page: number } {
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));
  const others = Object.entries(sp).filter(
    ([k, v]) => k !== 'page' && !opts.ignore?.includes(k) && v !== undefined && v !== '',
  );
  if (others.length) return { canonical: pathname, noindex: true, page };
  const canonical = pageHref(pathname, {}, page);
  return { canonical, noindex: !!opts.strict && page > 1, page };
}
