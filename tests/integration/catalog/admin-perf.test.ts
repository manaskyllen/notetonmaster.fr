import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { readCounts, readOverview } from '@/lib/admin/counts';
import { getFichesPage, readFicheQuery, readViewCounts } from '@/lib/admin/fiche-query';
import { getFicheDrawer } from '@/lib/admin/fiche-drawer';
import { getFicheForEdit } from '@/lib/admin/fiche-edit';
import { getFicheEditExtras } from '@/lib/admin/fiche-edit-extras';
import { conflictGroups } from '@/lib/admin/conflict-groups';
import {
  collectErrors,
  etablissementsPage,
  noProfileUniversities,
  runsPage,
} from '@/lib/admin/recuperation';
import { countAudit, getAuditPage, readAuditQuery } from '@/lib/admin/audit-query';
import { toEntries } from '@/lib/admin/audit-entries';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

/**
 * Budget of the admin screens on the national data: each screen's server reads take less than
 * 300 ms (warm, without the 5-minute cache of the counters), and the number of SQL queries does
 * not grow with the page size (no N+1). Queries are counted through Prisma's query events.
 */
let n = 0;
(prisma as unknown as { $on: (e: 'query', cb: () => void) => void }).$on('query', () => {
  n++;
});

async function measure(fn: () => Promise<unknown>) {
  await fn(); // warm-up (connection, plans)
  n = 0;
  const t = performance.now();
  await fn();
  return { ms: performance.now() - t, queries: n };
}

const BUDGET_MS = 300;

describe('admin screens: under 300 ms, no N+1', () => {
  afterAll(() => prisma.$disconnect());

  it('Vue d’ensemble', async () => {
    const r = await measure(() => Promise.all([readCounts(), readOverview()]));
    expect(r.ms).toBeLessThan(BUDGET_MS);
  });

  it('Fiches: a page of 50 or of 200 costs the same queries; views, drawer', async () => {
    const q = readFicheQuery({ vue: 'toutes' });
    const small = await measure(() => getFichesPage(q, 0, 50));
    const big = await measure(() => getFichesPage(q, 0, 200));
    expect(big.queries).toBe(small.queries);
    const screen = await measure(() =>
      Promise.all([getFichesPage(readFicheQuery({}), 0, 50), readViewCounts()]),
    );
    expect(screen.ms).toBeLessThan(BUDGET_MS);
    const p = await programBySlug(FX.programs.vnp);
    expect((await measure(() => getFicheDrawer(p.id))).ms).toBeLessThan(BUDGET_MS);
  });

  it('Modifier une fiche', async () => {
    const p = await prisma.program.findFirstOrThrow({
      where: { slug: 'valorisation-des-nouveaux-patrimoines' },
      select: { id: true },
    });
    const r = await measure(() =>
      Promise.all([getFicheForEdit(p.id), getFicheEditExtras(p.id, 'PROGRAM')]),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
  });

  it('Récupération: every tab; establishments by 50 or 200 cost the same queries', async () => {
    const todo = await measure(() =>
      Promise.all([collectErrors(), conflictGroups(), noProfileUniversities()]),
    );
    expect(todo.ms).toBeLessThan(BUDGET_MS);
    const o = { q: '', profile: null, state: null, zoneOnly: false };
    const small = await measure(() => etablissementsPage({ ...o, offset: 0, limit: 50 }));
    const big = await measure(() => etablissementsPage({ ...o, offset: 0, limit: 200 }));
    expect(big.queries).toBe(small.queries);
    expect(small.ms).toBeLessThan(BUDGET_MS);
    const journal = await measure(() => runsPage({ source: null, level: null, days: null }));
    expect(journal.ms).toBeLessThan(BUDGET_MS);
    expect(journal.queries).toBeLessThanOrEqual(3);
  });

  it('Journal d’audit: 50 or 200 entries cost the same queries', async () => {
    const q = readAuditQuery({ periode: '365', auto: '1' });
    const small = await measure(async () => toEntries((await getAuditPage(q, null, 50)).rows));
    const big = await measure(async () => toEntries((await getAuditPage(q, null, 200)).rows));
    expect(big.queries).toBe(small.queries);
    const screen = await measure(() =>
      Promise.all([getAuditPage(readAuditQuery({})), countAudit(readAuditQuery({}))]),
    );
    expect(screen.ms).toBeLessThan(BUDGET_MS);
  });
});
