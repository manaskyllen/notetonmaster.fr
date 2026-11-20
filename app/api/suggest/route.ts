import { NextResponse, type NextRequest } from 'next/server';
import { readFilters } from '@/lib/catalog/filters';
import { NO_QUICK, QUICK_FILTERS, type Quick } from '@/lib/home/labels';
import { suggest, suggestCount } from '@/lib/home/suggest';
import { MINUTE, rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { cachedSearch, SEARCH_PER_MINUTE } from '@/lib/search-guard';
import { SESSION_COOKIE_RE } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

/**
 * Suggestions of the home search (« Quoi ? »), with the Explorer parameters of the form:
 * GET /api/suggest?q=…[&lieu=zone:nantes][&modalite=alternance][&avis=avec][&entree=M1]
 * [&mode=count]. `mode=count`: the number of masters only (the button). Public data only, the
 * same answer for everyone: kept 60 s in the bounded memory cache of /api/search
 * (lib/search-guard.ts) and by the CDN for visitors without a session, limited per IP like it.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f = readFilters(Object.fromEntries(sp.entries()));
  const city =
    f.lieux
      .find((l) => l.startsWith('zone:'))
      ?.slice(5)
      .slice(0, 80) || null;
  const quick: Quick = { ...NO_QUICK };
  for (const qf of QUICK_FILTERS) {
    const vals = qf.param === 'modalite' ? f.modalites : qf.param === 'avis' ? f.avis : f.entrees;
    quick[qf.key] = (vals as string[]).includes(qf.value);
  }
  const q = f.q.trim();
  const countOnly = sp.get('mode') === 'count';
  if (!q) return NextResponse.json({ error: 'q manquant' }, { status: 400, headers: NO_STORE });
  if (!(await rateLimit(`search:${await clientIp()}`, SEARCH_PER_MINUTE, MINUTE)))
    return NextResponse.json(
      { error: 'Trop de recherches, réessaie dans une minute.' },
      { status: 429, headers: { 'Retry-After': '60', ...NO_STORE } },
    );
  const query = { q, city, quick };
  const key = `h:${countOnly ? 'c' : 's'}:${q.toLowerCase()}:${city ?? ''}:${JSON.stringify(quick)}`;
  const body = countOnly
    ? { q, count: await cachedSearch(key, () => suggestCount(query)) }
    : await cachedSearch(key, () => suggest(query));
  const anonymous = !req.cookies.getAll().some((c) => SESSION_COOKIE_RE.test(c.name));
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': anonymous
        ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
        : 'private, no-store',
    },
  });
}

const NO_STORE = { 'Cache-Control': 'no-store' };
