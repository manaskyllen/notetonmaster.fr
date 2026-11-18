import 'server-only';
import { revalidateTag } from 'next/cache';
import { refreshProgramIndexRows } from '@/lib/catalog/program-index';
import { refreshProgramRatings } from '@/lib/catalog/program-ratings';
import { queueIndexNow } from '@/lib/seo/indexnow';
import { TAGS } from './tags';

/** Inside Next.js (server actions, route handlers): expire these tags now. */
export function expireTags(tags: string[]) {
  for (const t of new Set(tags))
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
      // Outside a request (unit tests, scripts): nothing is cached there.
    }
}

/** A review was published, hidden, edited or removed: its program, the lists and the footer. */
export async function afterReviewChange(programIds: (string | null | undefined)[]) {
  const ids = programIds.filter((x): x is string => !!x);
  // Ratings denormalised on Program, then the copy of the lists (cards and sorts).
  await refreshProgramRatings(ids);
  await refreshProgramIndexRows(ids);
  expireTags([TAGS.footer, TAGS.catalog, ...ids.map((id) => TAGS.program(id))]);
  // Bing & co. (production with INDEXNOW_KEY only): the fiche changed.
  await queueIndexNow(ids);
}
