import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { audit, change, truncateIp } from '@/lib/audit';
import { toEntries } from '@/lib/admin/audit-entries';
import { getAuditPage, readAuditQuery } from '@/lib/admin/audit-query';
import { purgeAuditLog } from '@/lib/admin/retention';
import { FX } from '../fixtures/ids';
import { programBySlug, fixtureAdmin } from '../fixtures/lookup';

describe('audit log', () => {
  afterAll(() => prisma.$disconnect());

  it('a fiche change: a full sentence, a link to the fiche, the before / after of each field', async () => {
    const admin = await fixtureAdmin();
    const p = await programBySlug(FX.programs.vnp);
    const since = new Date();
    await audit(admin, 'DATA', p.title, 'Modifié à la main : Composante', {
      action: 'a modifié',
      target: { type: 'PROGRAM', id: p.id },
      diff: [
        change('Composante', 'Fac. des langues', 'UFR Histoire'),
        change('Publication', 'Publiée', 'Brouillon'),
      ],
    });
    const { rows } = await getAuditPage(readAuditQuery({ objet: p.id }));
    const row = rows.find((r) => r.at >= since && r.action === 'a modifié')!;
    expect(row.category).toBe('FICHES');
    const [e] = await toEntries([row]);
    expect(e).toMatchObject({
      who: admin.name,
      action: 'a modifié',
      target: p.title,
      href: `/admin/fiches/${p.id}`,
      category: 'Fiches',
      diff: [
        { field: 'Composante', before: 'Fac. des langues', after: 'UFR Histoire' },
        { field: 'Publication', before: 'Publiée', after: 'Brouillon' },
      ],
    });
    expect(e!.initials).toMatch(/^[A-Z]{1,2}$/);
    // Search by the object and by the person.
    expect(
      (await getAuditPage(readAuditQuery({ q: p.title.split(' ')[0]! }))).rows.some(
        (r) => r.id === row.id,
      ),
    ).toBe(true);
    expect(
      (await getAuditPage(readAuditQuery({ personne: admin.id }))).rows.some(
        (r) => r.id === row.id,
      ),
    ).toBe(true);
    // Automatic actions are hidden by default.
    expect((await getAuditPage(readAuditQuery({}))).rows.every((r) => r.actorId)).toBe(true);
  });

  it('insert only: an update or a deletion is refused by the database', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow({ orderBy: { at: 'desc' } });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { detail: 'falsifié' } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`UPDATE "AuditLog" SET detail = 'falsifié' WHERE id = ${entry.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
      /append-only/,
    );
    // The retention purge only removes what is past it: nothing recent.
    const before = await prisma.auditLog.count();
    await purgeAuditLog();
    expect(await prisma.auditLog.count()).toBeGreaterThanOrEqual(
      before -
        (await prisma.auditLog.count({
          where: { at: { lt: new Date(Date.now() - 365 * 86_400_000) } },
        })),
    );
    expect(await prisma.auditLog.findUnique({ where: { id: entry.id } })).not.toBeNull();
  });

  it('IPs are truncated', () => {
    expect(truncateIp('203.0.113.7')).toBe('203.0.x.x');
    expect(truncateIp('::ffff:198.51.100.2')).toBe('198.51.x.x');
    expect(truncateIp('2001:db8:1234::1')).toBe('2001:db8:x');
    expect(truncateIp(null)).toBeNull();
  });
});
