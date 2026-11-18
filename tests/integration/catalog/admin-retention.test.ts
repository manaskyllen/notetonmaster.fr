import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { purgeSyncJournal } from '@/lib/admin/retention';

describe('sync journal retention', () => {
  afterAll(() => prisma.$disconnect());

  it('passes are kept 90 days, log lines 30 days, the last pass of each source always', async () => {
    const source = await prisma.dataSource.create({
      data: {
        key: `test-retention-${Date.now()}`,
        name: 'Test rétention',
        host: 'test.invalid',
        method: 'test',
      },
    });
    try {
      const day = 86_400_000;
      const old = await prisma.syncRun.create({
        data: {
          sourceId: source.id,
          status: 'SUCCEEDED',
          queuedAt: new Date(Date.now() - 120 * day),
        },
      });
      // The last pass of the source, older than 90 days too: kept.
      const last = await prisma.syncRun.create({
        data: { sourceId: source.id, status: 'FAILED', queuedAt: new Date(Date.now() - 100 * day) },
      });
      const recent = await prisma.syncLog.create({
        data: {
          runId: last.id,
          level: 'INFO',
          message: 'récente',
          at: new Date(Date.now() - 10 * day),
        },
      });
      const stale = await prisma.syncLog.create({
        data: {
          runId: last.id,
          level: 'INFO',
          message: 'ancienne',
          at: new Date(Date.now() - 40 * day),
        },
      });

      const r = await purgeSyncJournal();
      expect(r.runs).toBeGreaterThanOrEqual(1);
      expect(await prisma.syncRun.findUnique({ where: { id: old.id } })).toBeNull();
      expect(await prisma.syncRun.findUnique({ where: { id: last.id } })).not.toBeNull();
      expect(await prisma.syncLog.findUnique({ where: { id: stale.id } })).toBeNull();
      expect(await prisma.syncLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
    } finally {
      await prisma.dataSource.delete({ where: { id: source.id } });
    }
  });
});
