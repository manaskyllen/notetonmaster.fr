/**
 * Checks the reverse proxy in front of the site, read-only (docs/deploiement.md):
 *
 *   NM_ADMIN_COOKIE=… pnpm proxy:check https://notetonmaster.fr
 *
 * - security headers sent by the app reach the browser, HSTS exactly once (the proxy adds none);
 * - redirects: http → https, www. and .com → https://notetonmaster.fr, same path and query;
 * - the app sees the caller's real address (route /api/admin/diagnostic/ip, admins only), and
 *   ignores an X-Forwarded-For written by the client.
 *
 * NM_ADMIN_COOKIE is the value of the admin session cookie (__Host-nm_admin) of a logged-in admin,
 * copied from the browser: given in the environment, never on the command line. Without it the
 * address check fails. Prints ✅ / ❌ per check and exits with 1 on any failure.
 */
import { inRange } from '../lib/ip';
import { ALIAS_HOSTS, CANONICAL_ORIGIN } from '../lib/seo/rules';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BASE)) {
  console.error('Usage : NM_ADMIN_COOKIE=… pnpm proxy:check https://notetonmaster.fr');
  process.exit(2);
}
const base = new URL(BASE);
const HTTPS = base.protocol === 'https:';

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'notetonmaster-proxy-check/1.0', ...headers },
    signal: AbortSignal.timeout(20_000),
  });

const PRIVATE = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '100.64.0.0/10',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10',
  '::1/128',
];

async function headersChecks() {
  for (const p of ['/', '/admin/login']) {
    const r = await get(BASE + p);
    const h = r.headers;
    check(`${p} répond 200`, r.status === 200, String(r.status));
    const csp = h.get('content-security-policy') ?? '';
    check(`${p} : CSP avec nonce`, /script-src[^;]*'nonce-/.test(csp));
    check(`${p} : X-Frame-Options DENY`, h.get('x-frame-options') === 'DENY');
    check(`${p} : X-Content-Type-Options nosniff`, h.get('x-content-type-options') === 'nosniff');
    check(`${p} : Referrer-Policy`, h.get('referrer-policy') === 'strict-origin-when-cross-origin');
    check(`${p} : Permissions-Policy`, /camera=\(\)/.test(h.get('permissions-policy') ?? ''));
    check(
      `${p} : Cross-Origin-Opener-Policy`,
      h.get('cross-origin-opener-policy') === 'same-origin',
    );
    check(
      `${p} : Cross-Origin-Resource-Policy`,
      h.get('cross-origin-resource-policy') === 'same-origin',
    );
    check(`${p} : X-Powered-By absent`, !h.has('x-powered-by'));
    if (HTTPS) {
      // Two senders (the app and the proxy) show as two comma-separated values.
      const hsts = h.get('strict-transport-security') ?? '';
      check(
        `${p} : un seul HSTS, celui de l'app`,
        hsts === 'max-age=31536000; includeSubDomains',
        hsts || 'absent',
      );
    }
  }
}

async function redirectChecks() {
  const path = '/explorer?q=droit';
  const expectRedirect = async (from: string, to: string) => {
    const r = await get(from);
    const location = r.headers.get('location') ?? '';
    check(
      `${from} → ${to}`,
      [301, 308].includes(r.status) && location === to,
      `${r.status} ${location || '(pas de Location)'}`,
    );
  };
  if (HTTPS) await expectRedirect(`http://${base.host}${path}`, `${BASE}${path}`);
  if (BASE === CANONICAL_ORIGIN)
    for (const host of ALIAS_HOSTS)
      await expectRedirect(`https://${host}${path}`, `${CANONICAL_ORIGIN}${path}`);
  await expectRedirect(`${BASE}/explorer/`, `${BASE}/explorer`);
}

async function ipChecks() {
  const cookie = process.env.NM_ADMIN_COOKIE?.trim();
  if (!cookie) {
    check(
      'adresse vue par l’app',
      false,
      'NM_ADMIN_COOKIE manque : valeur du cookie __Host-nm_admin d’une session admin',
    );
    return;
  }
  const name = HTTPS ? '__Host-nm_admin' : 'nm_admin';
  const seen = async (extra: Record<string, string> = {}) => {
    const r = await get(`${BASE}/api/admin/diagnostic/ip`, {
      cookie: `${name}=${cookie}`,
      ...extra,
    });
    if (r.status !== 200) return { status: r.status, ip: '' };
    return { status: r.status, ip: ((await r.json()) as { ip: string }).ip };
  };
  const plain = await seen();
  check(
    'route de diagnostic accessible avec la session admin',
    plain.status === 200,
    String(plain.status),
  );
  if (plain.status !== 200) return;
  const isPublic = plain.ip !== 'unknown' && !PRIVATE.some((r) => inRange(plain.ip, r));
  check(
    `l’app voit une adresse publique (${plain.ip})`,
    isPublic,
    'adresse interne : le proxy ne transmet pas l’IP du client',
  );
  const expected = process.argv.find((a) => a.startsWith('--expect-ip='))?.split('=')[1];
  if (expected) check(`c’est bien ton adresse (${expected})`, plain.ip === expected, plain.ip);
  const forged = '203.0.113.9';
  const spoofed = await seen({ 'x-forwarded-for': forged });
  check(
    'un X-Forwarded-For écrit par le client est ignoré',
    spoofed.ip === plain.ip && spoofed.ip !== forged,
    spoofed.ip,
  );
}

async function main() {
  const health = await get(`${BASE}/api/health`);
  check('/api/health répond 200', health.status === 200, String(health.status));
  await headersChecks();
  await redirectChecks();
  await ipChecks();
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks)
    console.log(`${c.ok ? '✅' : '❌'} ${c.label}${!c.ok && c.detail ? ` (${c.detail})` : ''}`);
  console.log(
    `\n${BASE} : ${checks.length - failed.length}/${checks.length} vérifications passées.`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${BASE} injoignable : ${(e as Error).message}`);
  process.exit(1);
});
