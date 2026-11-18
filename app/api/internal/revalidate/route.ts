import { NextResponse } from 'next/server';
import { z } from 'zod';
import { expireTags } from '@/lib/cache/next';
import { TAGS, verifySignature } from '@/lib/cache/tags';
import { cachedBrowse, cachedFacets } from '@/lib/catalog/cached';
import { EMPTY_FILTERS } from '@/lib/catalog/filters';

/** Cache invalidation asked by the worker after a publication (lib/cache/tags.ts). */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get('x-nm-signature')))
    return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = z
    .object({ tags: z.array(z.string().max(100)).max(50), at: z.number() })
    .safeParse(JSON.parse(body));
  // Signed requests older than 5 minutes are refused (replay).
  if (!parsed.success || Math.abs(Date.now() - parsed.data.at) > 300_000)
    return NextResponse.json({ ok: false }, { status: 400 });
  expireTags(parsed.data.tags);
  // Warm the most visited combinations again (Explorer and home page without filters).
  if (parsed.data.tags.includes(TAGS.catalog))
    void Promise.all([
      cachedFacets(EMPTY_FILTERS, {}),
      cachedBrowse(EMPTY_FILTERS, {}, { offset: 0, limit: 24 }),
    ]).catch(() => {});
  return NextResponse.json({ ok: true });
}
