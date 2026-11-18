import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { BULK_JOB } from '@/lib/admin/bulk';
import { runNextJob } from '../../../worker/jobs';
import {
  countFiches,
  ficheIds,
  ficheQueryString,
  getFichesPage,
  readFicheQuery,
  readViewCounts,
  VIEWS,
  type ViewKey,
} from '@/lib/admin/fiche-query';
import { FX } from '../fixtures/ids';
import { fixtureAdmin } from '../fixtures/lookup';

/** Fiches: views and their counters, the query in the URL, bulk actions through the queue. */
describe('admin fiches', () => {
  afterAll(() => prisma.$disconnect());

  it('each view returns the count shown next to it', async () => {
    const counts = await readViewCounts();
    for (const view of Object.keys(VIEWS) as ViewKey[]) {
      const q = readFicheQuery({ vue: view });
      expect(await countFiches(q), view).toBe(counts[view]);
      const page = await getFichesPage(q, 0, 50);
      expect(page.total, view).toBe(counts[view]);
      expect(page.rows.length).toBe(Math.min(50, counts[view]));
    }
    // « À traiter »: published fiches with at least one open problem, the most urgent first.
    const todo = await getFichesPage(readFicheQuery({}), 0, 50);
    expect(todo.rows.every((r) => r.publication === 'pub' && r.issues.length > 0)).toBe(true);
  });

  it('filters, sort and view round-trip through the URL', () => {
    const sp = {
      vue: 'sans-programme',
      q: 'droit',
      type: 'parcours',
      ville: 'nantes',
      probleme: 'conflit',
      tri: 'nom',
      page: '3',
    };
    const q = readFicheQuery(sp);
    expect(q).toMatchObject({
      view: 'sans-programme',
      q: 'droit',
      type: 'PROGRAM',
      city: 'nantes',
      problem: 'CONFLICT',
      sort: 'nom',
    });
    expect(readFicheQuery(Object.fromEntries(new URLSearchParams(ficheQueryString(q))))).toEqual(q);
    // Defaults stay out of the URL; unknown values fall back to them.
    expect(ficheQueryString(readFicheQuery({ vue: 'nimporte', tri: '?' }))).toBe('');
  });

  it('a bulk action on 183 fiches goes through the job queue and writes one audit entry', async () => {
    // 183 published fiches of the bulk lot (fixtures), all in the « Publiées » view.
    const lot = await prisma.program.findMany({
      where: { slug: { startsWith: FX.programs.lotPrefix } },
      orderBy: { slug: 'asc' },
      take: 183,
      select: { id: true },
    });
    const published = new Set(
      (await ficheIds(readFicheQuery({ vue: 'publiees', tri: 'nom' }), 10_000)).map((r) => r.id),
    );
    const ids = lot.map((r) => r.id).filter((id) => published.has(id));
    expect(ids).toHaveLength(183);
    const admin = await fixtureAdmin();
    const since = new Date();
    // As startBulk does; the job is run here, as the worker would (no worker in the tests).
    const job = await prisma.job.create({
      data: {
        type: BULK_JOB,
        payload: {
          action: 'publish',
          ids,
          actor: { id: admin.id, name: admin.name, email: admin.email },
        },
        createdById: admin.id,
        total: ids.length,
      },
    });
    while (await runNextJob()) {
      /* until the queue is empty */
    }
    const done = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done?.status).toBe('DONE');
    expect(done?.progress).toBe(183);
    expect(done?.total).toBe(183);
    expect((done?.result as { summary: string }).summary).toMatch(/183 déjà dans cet état/);
    const entries = await prisma.auditLog.findMany({
      where: { actorId: admin.id, at: { gte: since }, detail: { contains: 'Action en lot' } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.targetLabel).toBe('183 fiches');
  }, 90_000);
});
