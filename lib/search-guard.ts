import 'server-only';

/**
 * /api/search, searched at each keystroke: a limit per IP (rate-limit table, shared by every
 * instance) and a small in-memory cache, bounded (LRU) and short (60 s, like the CDN), instead of
 * one server data-cache entry per distinct query sent, which anyone could grow without end.
 */
export const SEARCH_PER_MINUTE = 120;
export const SEARCH_CACHE_MAX = 500;
const TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: unknown }>();

export async function cachedSearch<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    cache.delete(key);
    cache.set(key, hit); // most recently used last
    return hit.value as T;
  }
  const value = await compute();
  cache.set(key, { at: Date.now(), value });
  while (cache.size > SEARCH_CACHE_MAX) cache.delete(cache.keys().next().value!);
  return value;
}

export const searchCacheSize = () => cache.size;
export const clearSearchCache = () => cache.clear();
