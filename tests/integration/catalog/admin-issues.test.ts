import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { computeIssues, oldProgramThreshold } from '@/lib/admin/issues';
import { sourceFamily } from '@/lib/admin/source-family';
import { FX } from '../fixtures/ids';
import { programBySlug, fixtureAdmin } from '../fixtures/lookup';

/** DataIssue: computed in SQL after a sync or a change, scoped to the fiches touched. */
describe('data issues', () => {
  afterAll(() => prisma.$disconnect());

  it('a parcours without programme has NO_PROGRAM; adding a semester resolves it, removing it reopens it', async () => {
    const p = await programBySlug(FX.programs.questions);
    await computeIssues({ programIds: [p.id] }, null);
    const open = () =>
      prisma.dataIssue.findUnique({
        where: {
          kind_targetType_targetId_field: {
            kind: 'NO_PROGRAM',
            targetType: 'PROGRAM',
            targetId: p.id,
            field: '',
          },
        },
      });
    expect((await open())?.resolvedAt).toBeNull();

    const admin = await fixtureAdmin();
    const sem = await prisma.programSemester.create({
      data: { programId: p.id, position: 0, label: 'M1 · Semestre 1', sourceYear: '2025-2026' },
    });
    try {
      await computeIssues({ programIds: [p.id] }, admin.id);
      const solved = await open();
      expect(solved?.resolvedAt).not.toBeNull();
      expect(solved?.resolvedById).toBe(admin.id);
    } finally {
      await prisma.programSemester.delete({ where: { id: sem.id } });
    }
    await computeIssues({ programIds: [p.id] }, null);
    const back = await open();
    expect(back?.resolvedAt).toBeNull();
    expect(back?.resolvedById).toBeNull();
  });

  it('a booklet more than two academic years old is OLD_PROGRAM', () => {
    // November 2026: academic year 2026-2027, booklets from 2023-2024 and before are old.
    expect(oldProgramThreshold(new Date('2026-11-17'))).toBe(2024);
    expect(oldProgramThreshold(new Date('2027-03-01'))).toBe(2024);
    expect(oldProgramThreshold(new Date('2027-09-01'))).toBe(2025);
  });

  it('a scoped recompute leaves the other fiches alone', async () => {
    const before = await prisma.dataIssue.count({ where: { resolvedAt: null } });
    const p = await programBySlug(FX.programs.vnp);
    await computeIssues({ programIds: [p.id] }, null);
    expect(await prisma.dataIssue.count({ where: { resolvedAt: null } })).toBe(before);
  });

  it('source family of a conflict option', () => {
    expect(sourceFamily({ source: 'Mon Master · données ouvertes, session 2025 (lieu)' })).toBe(
      'monmaster-opendata',
    );
    expect(sourceFamily({ source: 'Livret pédagogique 2022-2023' })).toBe('univ-sites');
    expect(sourceFamily({ source: 'Site de l’université · formation.cyu.fr' })).toBe('univ-sites');
    expect(sourceFamily({ source: 'whatever', sourceKey: 'rncp' })).toBe('rncp');
  });
});
