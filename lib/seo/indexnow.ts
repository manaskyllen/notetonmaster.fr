import { prisma } from '../db';
import { publicIndexing, siteOrigin } from './site';

/**
 * IndexNow (Bing, Yandex, Seznam…): tells the engines that a fiche changed (published, a review
 * published or removed) instead of waiting for their next crawl. Production only, and only with
 * INDEXNOW_KEY (8–128 letters, digits or dashes): the key is served at /<key>.txt by proxy.ts.
 *
 * The site never calls the API itself: it queues the addresses (Job « indexnow »), and the worker
 * sends them at most once a minute, merged and deduplicated (flushIndexNow), so a burst of
 * moderation never floods the engines. Google does not use IndexNow (it reads the sitemap).
 */
export const INDEXNOW_JOB = 'indexnow';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10_000;
const MAX_ATTEMPTS = 5;

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY ?? '';
  return /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null;
}

export function indexNowEnabled(): boolean {
  return publicIndexing() && indexNowKey() !== null;
}

/** Queues the fiches of these programs (public establishments only). Never throws. */
export async function queueIndexNow(programIds: (string | null | undefined)[]): Promise<number> {
  const ids = [...new Set(programIds.filter((x): x is string => !!x))];
  if (!ids.length || !indexNowEnabled()) return 0;
  try {
    const rows = await prisma.program.findMany({
      where: { id: { in: ids }, university: { sector: 'PUBLIC' } },
      select: { slug: true },
    });
    if (!rows.length) return 0;
    const origin = siteOrigin();
    await prisma.job.create({
      data: {
        type: INDEXNOW_JOB,
        payload: { urls: rows.map((r) => `${origin}/parcours/${r.slug}`) },
      },
    });
    return rows.length;
  } catch (e) {
    console.error('[indexnow] queue failed', e);
    return 0;
  }
}

/**
 * Sends every queued address in one request (worker, once a minute). 200 / 202: done; 429 or a
 * network error: kept for the next minute; after 5 failures the jobs are marked failed.
 */
export async function flushIndexNow(
  send: typeof fetch = fetch,
): Promise<{ sent: number; status: number | null }> {
  const key = indexNowKey();
  if (!key || !publicIndexing()) return { sent: 0, status: null };
  const jobs = await prisma.job.findMany({
    where: { type: INDEXNOW_JOB, status: 'QUEUED', runAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { id: true, payload: true, attempts: true },
  });
  if (!jobs.length) return { sent: 0, status: null };
  const urls = [
    ...new Set(
      jobs.flatMap((j) =>
        ((j.payload as { urls?: string[] })?.urls ?? []).filter((u) => typeof u === 'string'),
      ),
    ),
  ].slice(0, MAX_URLS);
  const ids = jobs.map((j) => j.id);
  const origin = siteOrigin();
  let status: number | null = null;
  try {
    const r = await send(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: `${origin}/${key}.txt`,
        urlList: urls,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    status = r.status;
  } catch {
    status = null;
  }
  if (status === 200 || status === 202) {
    await prisma.job.updateMany({
      where: { id: { in: ids } },
      data: { status: 'DONE', attempts: { increment: 1 } },
    });
    return { sent: urls.length, status };
  }
  const error = `IndexNow ${status ?? 'réseau'}`;
  await prisma.job.updateMany({
    where: { id: { in: ids }, attempts: { lt: MAX_ATTEMPTS - 1 } },
    data: { attempts: { increment: 1 }, lastError: error },
  });
  await prisma.job.updateMany({
    where: { id: { in: ids }, attempts: { gte: MAX_ATTEMPTS - 1 } },
    data: { status: 'FAILED', attempts: { increment: 1 }, lastError: error },
  });
  console.error(`[indexnow] ${error} (${urls.length} adresses)`);
  return { sent: 0, status };
}
