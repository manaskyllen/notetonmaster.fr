import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { getOpenZones } from './zones';

/**
 * Open cities and their published masters: cached 10 min, expired when a zone is opened or
 * closed (tag `zones`) and with the catalogue (a sync changes the counts).
 */
export const cachedOpenZones = unstable_cache(() => getOpenZones(), ['open-zones'], {
  revalidate: 600,
  tags: [TAGS.zones, TAGS.catalog],
});
