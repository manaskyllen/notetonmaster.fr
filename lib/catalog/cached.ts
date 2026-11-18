import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { browsePrograms, facetCounts, type BrowseContext } from './browse';
import type { Filters } from './filters';

/**
 * Public lists cached per combination of parameters: 60 seconds, expired with the
 * catalogue (tag « catalog »: publication of a sync, review published or removed, fiche edited).
 * The answer is the same for every visitor (no session data in it).
 */
const OPTS = { revalidate: 60, tags: [TAGS.catalog] };
const key = (...parts: unknown[]) => JSON.stringify(parts);

export function cachedBrowse(
  f: Filters,
  ctx: BrowseContext,
  page: { offset: number; limit: number },
) {
  return unstable_cache(() => browsePrograms(f, ctx, page), ['browse', key(f, ctx, page)], OPTS)();
}

export function cachedFacets(f: Filters, ctx: BrowseContext, opts: { fuzzy?: boolean } = {}) {
  return unstable_cache(() => facetCounts(f, ctx, opts), ['facets', key(f, ctx, opts)], OPTS)();
}
