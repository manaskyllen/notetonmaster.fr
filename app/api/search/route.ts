import { NextResponse, type NextRequest } from 'next/server';
import { SEARCH_TYPES, type SearchType } from '@/lib/domain/search';
import { searchPage } from '@/lib/domain/search.server';
import { notYetPlace } from '@/lib/launch/places';
import { MINUTE, rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { cachedSearch, SEARCH_PER_MINUTE } from '@/lib/search-guard';
import { SESSION_COOKIE_RE } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

/**
 * Search as you type (home page, Explorer, ⌘K palette, review form): GET /api/search?q=…
 * &types=program,mention&limit=20&limits=city:4,program:7[&prive=1]. Public data only, never an
 * address. Light answer (display fields only) with the totals per type, cached 60 s by the CDN for
 * visitors without a session (the answer is the same for everyone).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').slice(0, 120);
  const types = (sp.get('types') ?? '')
    .split(',')
    .filter((t): t is SearchType => (SEARCH_TYPES as string[]).includes(t));
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 20));
  const limits: Partial<Record<SearchType, number>> = {};
  for (const part of (sp.get('limits') ?? '').split(',')) {
    const [t, n] = part.split(':');
    if ((SEARCH_TYPES as string[]).includes(t ?? '') && Number(n) > 0)
      limits[t as SearchType] = Math.min(100, Number(n));
  }
  if (!(await rateLimit(`search:${await clientIp()}`, SEARCH_PER_MINUTE, MINUTE)))
    return NextResponse.json(
      { error: 'Trop de recherches, réessaie dans une minute.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
    );
  const opts = { types, limit, limits, includePrivate: sp.get('prive') === '1' };
  // Same answer for everyone: kept 60 s in a bounded memory cache (the CDN keeps it for
  // anonymous visitors), lib/search-guard.ts.
  const key = q.trim().toLowerCase();
  const [page, notYet] = await Promise.all([
    cachedSearch(`s:${key}:${JSON.stringify(opts)}`, () => searchPage(q, opts)),
    cachedSearch(`n:${key}`, () => notYetPlace(q)),
  ]);
  const anonymous = !req.cookies.getAll().some((c) => SESSION_COOKIE_RE.test(c.name));
  return NextResponse.json(
    {
      q,
      results: page.results.map((r) => ({ ...r, score: undefined })),
      totals: page.totals,
      hiddenPrivate: page.hiddenPrivate,
      notYet,
    },
    {
      headers: {
        'Cache-Control': anonymous
          ? 'public, s-maxage=60, stale-while-revalidate=300'
          : 'private, no-store',
      },
    },
  );
}
