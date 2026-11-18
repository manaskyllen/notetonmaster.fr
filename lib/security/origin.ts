/**
 * Origin of the requests that change something (Server Actions, API routes that write): the
 * site's own address (APP_URL) only, checked in proxy.ts before Next.js runs the action. The
 * dev stack also accepts the addresses Playwright and the browser use there.
 */
type Env = Record<string, string | undefined>;

const DEV_HOSTS = new Set(['localhost:3000', '127.0.0.1:3000', 'web:3000']);

export function isAllowedOrigin(origin: string | null, env: Env = process.env): boolean {
  if (!origin || origin === 'null') return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  try {
    if (env.APP_URL && o.origin === new URL(env.APP_URL).origin) return true;
  } catch {
    /* invalid APP_URL: refused below */
  }
  return env.NODE_ENV !== 'production' && DEV_HOSTS.has(o.host);
}
