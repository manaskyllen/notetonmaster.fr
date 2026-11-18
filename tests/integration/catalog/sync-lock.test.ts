import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { syncField } from '@/lib/connectors/provenance';
import { emptyStats, type RunContext } from '@/lib/connectors/types';

/** Integration test on the test database. Each test syncs its own fake entity. */
let n = 0;
let entityId = '';
const logs: string[] = [];
const ctx: RunContext = {
  report: async () => {},
  log: async (level, msg) => void logs.push(`${level} ${msg}`),
};
const base = () => ({
  entityType: 'PROGRAM' as const,
  entityId,
  entityLabel: 'Parcours test',
  field: 'capacity',
  label: 'Places',
  sourceKey: 'monmaster-opendata',
});

describe('mock sync and field locking', () => {
  beforeEach(() => {
    n += 1;
    entityId = `test-sync-${process.pid}-${n}`;
  });
  afterEach(async () => {
    await prisma.fieldProvenance.deleteMany({ where: { entityId } });
    await prisma.dataConflict.deleteMany({ where: { entityId } });
  });

  it('creates, then never overwrites a locked field', async () => {
    const stats = emptyStats();
    await syncField({ ...base(), value: 22, source: 'Mon Master' }, ctx, stats);
    expect(stats.created).toBe(1);

    await prisma.fieldProvenance.update({
      where: { entityType_entityId_field: { entityType: 'PROGRAM', entityId, field: 'capacity' } },
      data: { value: 30, locked: true, source: 'Saisi à la main' },
    });
    await syncField({ ...base(), value: 22, source: 'Mon Master' }, ctx, stats);
    expect(stats.skippedLocked).toBe(1);
    const row = await prisma.fieldProvenance.findFirstOrThrow({
      where: { entityId, field: 'capacity' },
    });
    expect(row.value).toBe(30);
    expect(logs.some((l) => l.startsWith('SKIP') && l.includes('verrouillé'))).toBe(true);
  });

  it('opens a conflict when another source disagrees, and then leaves the field alone', async () => {
    const stats = emptyStats();
    await syncField({ ...base(), value: 22, source: 'Mon Master' }, ctx, stats);
    await syncField(
      { ...base(), value: 24, source: 'Site université', sourceKey: 'univ-sites' },
      ctx,
      stats,
    );
    expect(stats.conflicts).toBe(1);
    expect(await prisma.dataConflict.count({ where: { entityId, resolvedAt: null } })).toBe(1);
    await syncField({ ...base(), value: 23, source: 'Mon Master' }, ctx, stats);
    const row = await prisma.fieldProvenance.findFirstOrThrow({
      where: { entityId, field: 'capacity' },
    });
    expect(row.value).toBe(22);
    expect(row.state).toBe('CONFLICT');
  });
});
