/** IndexNow: queued by the site, sent by the worker at most once a minute (lib/seo/indexnow.ts). */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { flushIndexNow, INDEXNOW_JOB, queueIndexNow } from '@/lib/seo/indexnow';
import { FX } from '../fixtures/ids';

const saved = { url: process.env.APP_URL, key: process.env.INDEXNOW_KEY };
let programId = '';
let slug = '';

beforeAll(async () => {
  await prisma.job.deleteMany({ where: { type: INDEXNOW_JOB } });
  const p = await prisma.programSearchIndex.findFirstOrThrow({
    where: { slug: FX.programs.vnp },
    select: { programId: true, slug: true },
  });
  programId = p.programId;
  slug = p.slug;
});
afterAll(async () => {
  process.env.APP_URL = saved.url;
  process.env.INDEXNOW_KEY = saved.key;
  await prisma.job.deleteMany({ where: { type: INDEXNOW_JOB } });
});

describe('IndexNow', () => {
  // Each test starts from an empty queue and a production configuration with a key.
  beforeEach(async () => {
    await prisma.job.deleteMany({ where: { type: INDEXNOW_JOB } });
    process.env.APP_URL = 'https://notetonmaster.fr';
    process.env.INDEXNOW_KEY = 'cle-de-test-1234';
  });
  it('does nothing outside production or without a key', async () => {
    process.env.APP_URL = 'http://localhost:3002';
    process.env.INDEXNOW_KEY = 'cle-de-test-1234';
    expect(await queueIndexNow([programId])).toBe(0);
    process.env.APP_URL = 'https://notetonmaster.fr';
    process.env.INDEXNOW_KEY = '';
    expect(await queueIndexNow([programId])).toBe(0);
    expect(await prisma.job.count({ where: { type: INDEXNOW_JOB } })).toBe(0);
  });

  it('merges the queued addresses into one request; 202 → done', async () => {
    process.env.APP_URL = 'https://notetonmaster.fr';
    process.env.INDEXNOW_KEY = 'cle-de-test-1234';
    expect(await queueIndexNow([programId])).toBe(1);
    expect(await queueIndexNow([programId, null])).toBe(1);
    const calls: {
      url: string;
      body: { host: string; key: string; keyLocation: string; urlList: string[] };
    }[] = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    expect(await flushIndexNow(send)).toEqual({ sent: 1, status: 202 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      host: 'notetonmaster.fr',
      key: 'cle-de-test-1234',
      keyLocation: 'https://notetonmaster.fr/cle-de-test-1234.txt',
      urlList: [`https://notetonmaster.fr/parcours/${slug}`],
    });
    expect(await prisma.job.count({ where: { type: INDEXNOW_JOB, status: 'QUEUED' } })).toBe(0);
    // nothing left: no request
    expect(await flushIndexNow(send)).toEqual({ sent: 0, status: null });
    expect(calls).toHaveLength(1);
  });

  it('429: kept for the next minute', async () => {
    await queueIndexNow([programId]);
    const send = (async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
    expect((await flushIndexNow(send)).status).toBe(429);
    expect(await prisma.job.count({ where: { type: INDEXNOW_JOB, status: 'QUEUED' } })).toBe(1);
  });
});
