/**
 * A fake request for Server Actions run in Vitest: a cookie jar shared with iron-session, request
 * headers (client IP, origin), `redirect()` that throws like Next.js, a pass-through cache.
 *
 * Each test file mocks the Next.js modules with these factories (vi.mock is hoisted per file):
 *
 *   vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
 *   vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
 *   vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
 */

type Cookie = { name: string; value: string; options?: Record<string, unknown> };

const jar = new Map<string, Cookie>();
const reqHeaders = new Map<string, string>();

export const request = {
  /** Starts a new visitor: no cookie, a fresh client IP. */
  reset(ip = randomIp()) {
    jar.clear();
    reqHeaders.clear();
    reqHeaders.set('x-forwarded-for', ip);
    reqHeaders.set('user-agent', 'vitest');
  },
  setHeader(name: string, value: string | null) {
    if (value === null) reqHeaders.delete(name.toLowerCase());
    else reqHeaders.set(name.toLowerCase(), value);
  },
  cookie(name: string) {
    return jar.get(name);
  },
  cookieNames() {
    return [...jar.keys()];
  },
  /** Copies the cookies of this visitor (to replay a stolen session, for instance). */
  snapshot(): Cookie[] {
    return [...jar.values()].map((c) => ({ ...c }));
  },
  restore(cookies: Cookie[]) {
    jar.clear();
    for (const c of cookies) jar.set(c.name, { ...c });
  },
};

let ipCounter = 0;
export function randomIp() {
  ipCounter += 1;
  return `203.0.${Math.floor(Math.random() * 200)}.${(ipCounter % 250) + 1}`;
}

request.reset();

const cookieStore = {
  get: (name: string) => {
    const c = jar.get(name);
    return c ? { name: c.name, value: c.value } : undefined;
  },
  getAll: () => [...jar.values()].map((c) => ({ name: c.name, value: c.value })),
  has: (name: string) => jar.has(name),
  set: (
    name: string | { name: string; value: string },
    value?: string,
    options?: Record<string, unknown>,
  ) => {
    if (typeof name === 'object') {
      jar.set(name.name, { name: name.name, value: name.value, options: name as never });
      return;
    }
    if (
      options &&
      (options.maxAge === 0 ||
        (options.expires instanceof Date && options.expires.getTime() <= Date.now()))
    )
      jar.delete(name);
    else jar.set(name, { name, value: value ?? '', options });
  },
  delete: (name: string) => void jar.delete(name),
};

const headerList = {
  get: (name: string) => reqHeaders.get(name.toLowerCase()) ?? null,
  has: (name: string) => reqHeaders.has(name.toLowerCase()),
  forEach: (fn: (v: string, k: string) => void) => reqHeaders.forEach(fn),
};

export const nextHeaders = {
  cookies: async () => cookieStore,
  headers: async () => headerList,
};

/** `redirect()` throws an error carrying the target, like Next.js (NEXT_REDIRECT). */
export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

export const nextNavigation = {
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  permanentRedirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
};

export const nextCache = {
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
  updateTag: () => {},
  unstable_expireTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
};

/** Runs an action that may redirect; returns its result or the redirect target. */
export async function run<T>(fn: () => Promise<T>): Promise<T | { redirect: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RedirectError) return { redirect: e.url };
    throw e;
  }
}
