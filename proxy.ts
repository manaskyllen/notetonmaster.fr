import { NextResponse, type NextRequest } from 'next/server';
import { isPrivatePath } from '@/lib/seo/meta';
import { canonicalRedirect, publicIndexing } from '@/lib/seo/site';
import { getIronSession } from 'iron-session';
import { isAllowedOrigin } from '@/lib/security/origin';
import { SESSION_COOKIE_RE, staffSessionOptions, studentSessionOptions } from '@/lib/auth/cookies';

const isDev = process.env.NODE_ENV !== 'production';
const isHttps = (process.env.APP_URL ?? '').startsWith('https://');

const TURNSTILE = 'https://challenges.cloudflare.com';
/**
 * Pages that may show a Turnstile widget (live mode only): the public site and the admin login.
 * Not only the pages that have a form: after a client-side navigation the browser keeps the
 * CSP of the first document, so a form reached through a link would lose its widget.
 */
function allowsTurnstile(pathname: string) {
  if (process.env.TURNSTILE_MODE !== 'live') return false;
  return !pathname.startsWith('/admin') || pathname === '/admin/login';
}

/** Strict Content-Security-Policy with a per-request nonce (Next.js applies it to its own scripts). */
function csp(nonce: string, turnstile: boolean) {
  const cf = turnstile ? ` ${TURNSTILE}` : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${cf}${isDev ? " 'unsafe-eval'" : ''}`,
    // React style props and next/font need inline styles; no third-party stylesheet is allowed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    `frame-src 'self'${cf}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * A fiche parcours is answered here before the page streams (its loading screen would commit a
 * 200 first): a former slug (renamed homonym, cursus merged into its parcours: ProgramSlugRedirect)
 * → 301 to the new one; an
 * unknown or unpublished slug → a real 404. One indexed lookup by slug.
 */
async function parcoursGate(
  pathname: string,
): Promise<{ moved: string } | { missing: true } | { notYet: string } | null> {
  const m = /^\/parcours\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]!);
  } catch {
    return { missing: true };
  }
  const { prisma } = await import('@/lib/db');
  const p = await prisma.program.findUnique({
    where: { slug },
    select: { isPublished: true, inOpenZone: true, status: true },
  });
  // A cursus merged into its parcours (issue #21) answers 301 like a former slug.
  if (p && p.status !== 'MERGED') {
    if (p.isPublished) return p.inOpenZone ? null : { notYet: slug };
    return { missing: true };
  }
  const r = await prisma.programSlugRedirect.findUnique({
    where: { slug },
    select: { programId: true },
  });
  const target = r
    ? await prisma.program.findUnique({ where: { id: r.programId }, select: { slug: true } })
    : null;
  return target ? { moved: `/parcours/${target.slug}` } : { missing: true };
}

/**
 * A guide (/guides/{slug}), answered here like the fiches: public (online, its date passed, its
 * city open) → the page; a former slug of a public guide → 301; anything else (draft, scheduled,
 * closed city, unknown) → a real 404, never indexed.
 */
async function guideGate(pathname: string): Promise<{ moved: string } | { missing: true } | null> {
  const m = /^\/guides\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]!);
  } catch {
    return { missing: true };
  }
  const { prisma } = await import('@/lib/db');
  const live = async (where: { slug: string } | { id: string }) => {
    const a = await prisma.article.findUnique({
      where,
      select: { slug: true, city: true, online: true, publishedAt: true },
    });
    if (!a?.online || !a.publishedAt || a.publishedAt > new Date()) return null;
    if (a.city) {
      const z = await prisma.launchZone.findUnique({
        where: { slug: a.city },
        select: { open: true },
      });
      if (!z?.open) return null;
    }
    return a.slug;
  };
  if (await live({ slug })) return null;
  const r = await prisma.articleSlugRedirect.findUnique({ where: { slug } });
  const target = r ? await live({ id: r.articleId }) : null;
  return target && target !== slug ? { moved: `/guides/${target}` } : { missing: true };
}

/**
 * Pages removed in November 2026: a permanent redirect rather than a bare 404
 * (`keepQuery`: the filters of the old address are carried over).
 */
const REMOVED: Record<string, { to: string; keepQuery: boolean }> = {
  '/carte': { to: '/explorer', keepQuery: true },
  '/espace/voeux': { to: '/espace', keepQuery: false },
  '/espace/voeux/export': { to: '/espace', keepQuery: false },
  '/calendrier': { to: '/', keepQuery: false },
  '/espace/calendrier': { to: '/espace', keepQuery: false },
  '/rappels/desactives': { to: '/', keepQuery: false },
  '/rappels/desinscription': { to: '/', keepQuery: false },
};

/**
 * Mention, university and city pages, answered here like the fiches (before the page streams,
 * so the 404 page is rendered on the server):
 * - unknown or unpublished mention / university → 404;
 * - published but with nothing in an open city → 404 « Pas encore sur notetonmaster »
 *   (/pas-encore), the address kept;
 * - /masters/{ville}: an open city with at least one public parcours, else 404;
 * - /masters/{ville}/{mention}: at least 2 public parcours of the mention there
 *   (lib/catalog/cities.ts, MIN_CITY_MENTION), else 404.
 * Indexed lookups by slug, on ProgramSearchIndex (published parcours only).
 */
async function catalogGate(
  pathname: string,
): Promise<{ missing: true } | { notYet: { type: string; slug: string } } | null> {
  const m = /^\/(mentions|universites|masters)\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!m || (m[3] && m[1] !== 'masters')) return null;
  let slug: string;
  let sub: string | null;
  try {
    slug = decodeURIComponent(m[2]!);
    sub = m[3] ? decodeURIComponent(m[3]) : null;
  } catch {
    return { missing: true };
  }
  const { prisma } = await import('@/lib/db');
  if (m[1] === 'masters') {
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ProgramSearchIndex" i
        JOIN "LaunchZone" z ON z.slug = ${slug} AND z.open
       WHERE i."isPublicSector" AND ${slug} = ANY(i."zoneSlugs")
         AND (${sub}::text IS NULL OR i."mentionSlug" = ${sub})`;
    return (row?.n ?? 0) >= (sub ? 2 : 1) ? null : { missing: true };
  }
  if (m[1] === 'mentions') {
    const x = await prisma.mention.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    });
    if (!x?.isPublished) return { missing: true };
    const listed = await prisma.programSearchIndex.findFirst({
      where: { mentionId: x.id },
      select: { programId: true },
    });
    return listed ? null : { notYet: { type: 'mention', slug } };
  }
  const u = await prisma.university.findUnique({
    where: { slug },
    select: { id: true, isPublished: true, children: { select: { id: true } } },
  });
  if (!u?.isPublished) return { missing: true };
  const listed = await prisma.programSearchIndex.findFirst({
    where: { universityId: { in: [u.id, ...u.children.map((c) => c.id)] } },
    select: { programId: true },
  });
  return listed ? null : { notYet: { type: 'universite', slug } };
}

/**
 * Indexing headers: while indexing is off (PUBLIC_INDEXING, local, CI, any host but
 * https://notetonmaster.fr) every answer is noindex, nofollow; once it is on, the private areas
 * still are (account, forms, API).
 */
function robotsHeader(res: NextResponse, pathname: string): NextResponse {
  if (!publicIndexing() || isPrivatePath(pathname))
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

/** IndexNow ownership file (/<key>.txt at the root, lib/seo/indexnow.ts). */
function indexNowKeyFile(pathname: string): NextResponse | null {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key) || pathname !== `/${key}.txt`) return null;
  return new NextResponse(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

/**
 * Sliding 30 days for the student and teaching-team cookies: renewed at most once a day while
 * the site is used (page loads only, never during a Server Action that may set the cookie
 * itself). Inactivity (14 days) and revocation are checked on the server (lib/auth/session.ts).
 */
async function renewSlidingCookies(req: NextRequest, res: NextResponse) {
  if (req.method !== 'GET' || req.headers.has('next-action')) return;
  const names = req.cookies.getAll().map((c) => c.name);
  const store = {
    get: (n: string) => req.cookies.get(n),
    set: (n: string, v: string, o: object) => res.cookies.set(n, v, o),
  };
  for (const options of [studentSessionOptions, staffSessionOptions]) {
    const o = options();
    if (!names.includes(o.cookieName)) continue;
    const s = await getIronSession<{ sid?: string; refreshedAt?: number }>(store as never, o);
    if (!s.sid || (s.refreshedAt && Date.now() - s.refreshedAt < 86_400_000)) continue;
    s.refreshedAt = Date.now();
    await s.save();
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Requests that change something come from the site itself (APP_URL), never from another
  // origin: Server Actions and the API routes that write. The internal revalidation route is
  // called by the worker, without Origin, and checks its own signature.
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    (req.headers.has('next-action') ||
      (pathname.startsWith('/api/') && pathname !== '/api/internal/revalidate')) &&
    !isAllowedOrigin(req.headers.get('origin'))
  )
    return new NextResponse('Origine refusée.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });

  // One address per page: canonical host (www, .com, http → https://notetonmaster.fr in
  // production), lower case, no trailing slash. 301, the query string kept.
  const canonical = canonicalRedirect({
    host: req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host,
    proto: (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol)
      .split(',')[0]!
      .replace(':', '')
      .trim(),
    pathname,
    search: req.nextUrl.search,
  });
  if (canonical) return robotsHeader(NextResponse.redirect(canonical, 301), pathname);

  const keyFile = indexNowKeyFile(pathname);
  if (keyFile) return keyFile;

  // The Mon Master calendar feed is gone for good: 410 so that subscribed calendars stop asking.
  if (pathname === '/calendrier.ics')
    return robotsHeader(
      new NextResponse('Ce calendrier n’existe plus.', {
        status: 410,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      }),
      pathname,
    );
  const removed = REMOVED[pathname.replace(/\/$/, '') || '/'];
  if (removed) {
    const url = new URL(removed.to + (removed.keepQuery ? req.nextUrl.search : ''), req.url);
    return robotsHeader(NextResponse.redirect(url, 301), pathname);
  }

  const gate =
    (await parcoursGate(pathname).catch(() => null)) ??
    (await guideGate(pathname).catch(() => null));
  if (gate && 'moved' in gate) {
    const url = new URL(gate.moved + req.nextUrl.search, req.url);
    return robotsHeader(NextResponse.redirect(url, 301), pathname);
  }

  // Cheap gate for /admin: no admin session cookie → login page. Real checks happen in every page and action.
  if (pathname.startsWith('/admin')) {
    const open = pathname === '/admin/login' || pathname.startsWith('/admin/invitation/');
    if (!open && !req.cookies.getAll().some((c) => /^(__Host-)?nm_admin$/.test(c.name)))
      return robotsHeader(NextResponse.redirect(new URL('/admin/login', req.url)), pathname);
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce, allowsTurnstile(pathname));
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);

  // Unknown or unpublished fiche, mention, university or city page: the site's 404 page, with a
  // real 404 status, rendered on the server.
  const other = gate ? null : await catalogGate(pathname).catch(() => null);
  if ((gate && 'missing' in gate) || (other && 'missing' in other)) {
    const res = NextResponse.rewrite(new URL('/_introuvable', req.url), {
      request: { headers },
      status: 404,
    });
    res.headers.set('Content-Security-Policy', policy);
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }

  const notYet =
    pathname === '/pas-encore'
      ? { type: '', slug: '' }
      : gate && 'notYet' in gate
        ? { type: 'parcours', slug: gate.notYet }
        : other && 'notYet' in other
          ? other.notYet
          : null;
  if (notYet) {
    const url = new URL('/pas-encore', req.url);
    if (notYet.slug) {
      url.searchParams.set('type', notYet.type);
      url.searchParams.set('slug', notYet.slug);
    } else url.search = req.nextUrl.search;
    const res = NextResponse.rewrite(url, { request: { headers }, status: 404 });
    res.headers.set('Content-Security-Policy', policy);
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }

  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', policy);
  robotsHeader(res, pathname);
  await renewSlidingCookies(req, res).catch(() => {});
  // Cloudflare: anonymous public pages may be cached at the edge (60 s, served stale
  // 5 min while refreshed). Never with a session cookie, never /espace, /admin, the API or a
  // Server Action. Opt-in (CDN_CACHE_PUBLIC=true): a cached HTML page serves the same CSP nonce
  // to every visitor, so turning it on means hashes in the CSP or a nonce shared for 60 s.
  if (
    process.env.CDN_CACHE_PUBLIC === 'true' &&
    req.method === 'GET' &&
    !req.headers.has('next-action') &&
    // /q/: the short links of the QR codes are counted at each scan, never cached.
    !/^\/(espace|admin|api|connexion|avis|messages|reponse|q\/|_next)/.test(pathname) &&
    !req.cookies.getAll().some((c) => SESSION_COOKIE_RE.test(c.name))
  )
    res.headers.set(
      'Cloudflare-CDN-Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );
  return res;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|icons/|icon.svg|apple-icon|manifest.webmanifest|opengraph-image|og/|mail/).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
