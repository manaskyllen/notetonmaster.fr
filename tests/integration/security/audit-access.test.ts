/**
 * Audit log: the Légal category is shown only to the roles that handle legal requests (Admin,
 * Légal), and only they can export the log.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let role: 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL' = 'ADMIN';
vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/auth/admin', async () => {
  const { can } = await import('@/lib/domain/permissions');
  const mod = {
    guard: async (permission: string, fn: (a: object) => unknown) =>
      can(role as never, permission as never)
        ? fn({ id: 'test-audit', name: 'Test', email: 't@x', role })
        : { ok: false, error: 'refusé' },
    guardSensitive: (...a: unknown[]) => (mod.guard as (...x: unknown[]) => unknown)(...a),
  };
  return mod;
});

const { prisma } = await import('@/lib/db');
const { loadAuditPage, startAuditExport } = await import('@/app/admin/(panel)/audit/actions');
const { can } = await import('@/lib/domain/permissions');

const marker = `test-audit-legal-${Date.now()}`;

beforeAll(async () => {
  await prisma.auditLog.create({
    data: {
      actorLabel: 'Test',
      category: 'LEGAL',
      targetLabel: marker,
      detail: `Réquisition ${marker}`,
      actorId: null,
    },
  });
});
afterAll(async () => {
  await prisma.job.deleteMany({ where: { createdById: 'test-audit' } }).catch(() => {});
});

const legalShown = async () => {
  const r = (await loadAuditPage(`q=${marker}&auto=1&periode=30`, '')) as {
    entries?: { detail?: string }[];
  };
  return JSON.stringify(r).includes(marker);
};

describe('audit log', () => {
  it.each(['MODERATOR', 'DATA_EDITOR'] as const)('%s does not see the Légal entries', async (r) => {
    role = r;
    expect(await legalShown()).toBe(false);
  });

  it.each(['ADMIN', 'LEGAL'] as const)('%s sees them', async (r) => {
    role = r;
    expect(await legalShown()).toBe(true);
  });

  it('only Admin and Légal can export it', async () => {
    for (const r of ['MODERATOR', 'DATA_EDITOR'] as const) {
      role = r;
      expect(await startAuditExport('')).toMatchObject({ ok: false });
    }
    expect(can('ADMIN', 'audit.export' as never)).toBe(true);
    expect(can('LEGAL', 'audit.export' as never)).toBe(true);
  });
});
