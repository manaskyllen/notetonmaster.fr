import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { FX } from '../fixtures/ids';
import { fixtureAdmin, universityBySlug } from '../fixtures/lookup';
import { applySourceRule } from '@/lib/admin/conflicts';
import { conflictGroups, groupOfConflict } from '@/lib/admin/conflict-groups';
import { applyFieldChange, decideMerge } from '@/lib/data/merge';
import { FIELD_PRIORITY } from '@/lib/data/priorities';

/**
 * Arbitration by group: « Toujours : le site de l'université » on 7 fiches of one establishment
 * creates a SourceRule, settles the 7 conflicts, removes the group from « À traiter », and the
 * next sync follows the rule instead of opening a new conflict.
 */
const A = 'UFR Histoire (test règle)';
const B = 'Faculté des langues (test règle)';

describe('source rules', () => {
  afterAll(() => prisma.$disconnect());

  it('a rule settles the 7 fiches of the group and the next sync follows it', async () => {
    // 7 fiches of one establishment: the bulk lot of the fixtures.
    const uni = await universityBySlug(FX.universities.lot);
    const programs = await prisma.program.findMany({
      where: { universityId: uni.id },
      select: { id: true, title: true, componentId: true },
      orderBy: { id: 'asc' },
      take: 7,
    });
    const ids = programs.map((p) => p.id);
    const before = await prisma.fieldProvenance.findMany({
      where: { entityId: { in: ids }, field: 'component' },
    });
    const admin = await fixtureAdmin();
    try {
      await prisma.fieldProvenance.deleteMany({
        where: { entityId: { in: ids }, field: 'component' },
      });
      for (const p of programs) {
        await prisma.fieldProvenance.create({
          data: {
            entityType: 'PROGRAM',
            entityId: p.id,
            field: 'component',
            label: 'Composante',
            value: B,
            source: 'Mon Master · données ouvertes 2025',
            sourceKey: 'monmaster-opendata',
            state: 'CONFLICT',
          },
        });
        await prisma.dataConflict.create({
          data: {
            key: `test-rule:${p.id}`,
            entityType: 'PROGRAM',
            entityId: p.id,
            field: 'component',
            title: `Composante · ${p.title}`,
            detail: 'test',
            options: [
              {
                id: 'current',
                label: B,
                value: B,
                source: 'Mon Master · données ouvertes 2025',
                sourceKey: 'monmaster-opendata',
              },
              {
                id: 'incoming',
                label: A,
                value: A,
                source: 'Site de l’université · test.fr',
                sourceKey: 'univ-sites',
              },
            ],
          },
        });
      }
      const first = await prisma.dataConflict.findUniqueOrThrow({
        where: { key: `test-rule:${ids[0]}` },
      });
      const group = await groupOfConflict(first.id);
      expect(group?.count).toBe(7);
      expect((await conflictGroups()).groups.some((g) => g.key === group!.key)).toBe(true);

      const r = await applySourceRule(group!.key, 'univ-sites', admin);
      expect(r).toMatchObject({ ok: true, count: 7, rule: 'toujours le site de l’université' });
      expect(
        await prisma.dataConflict.count({
          where: { key: { startsWith: 'test-rule:' }, resolvedAt: null },
        }),
      ).toBe(0);
      expect((await conflictGroups()).groups.some((g) => g.key === group!.key)).toBe(false);
      const rule = await prisma.sourceRule.findUniqueOrThrow({
        where: { universityId_field: { universityId: uni.id, field: 'component' } },
      });
      expect(rule.sourceKey).toBe('univ-sites');
      const comps = await prisma.program.findMany({
        where: { id: { in: ids } },
        select: { component: { select: { name: true } } },
      });
      expect(comps.every((c) => c.component?.name === A)).toBe(true);
      // Not locked: the rule decides, the sync keeps running.
      const prov = await prisma.fieldProvenance.findMany({
        where: { entityId: { in: ids }, field: 'component' },
      });
      expect(prov.every((p) => !p.locked && p.state === 'OK' && p.sourceKey === 'univ-sites')).toBe(
        true,
      );

      // Next sync: Mon Master still says something else, for every fiche of the group: no conflict.
      const counters = { created: 0, updated: 0, unchanged: 0, skippedLocked: 0, conflicts: 0 };
      for (const id of ids) {
        const v = await applyFieldChange(
          {
            entityType: 'PROGRAM',
            entityId: id,
            field: 'component',
            label: 'Composante',
            from: A,
            to: B,
            source: 'Mon Master · données ouvertes 2026',
            outcome: 'update',
          },
          id,
          'monmaster-opendata',
          counters,
        );
        expect(v).toBe(A);
      }
      expect(counters.conflicts).toBe(0);
      expect(
        await prisma.dataConflict.count({
          where: { entityId: { in: ids }, field: 'component', resolvedAt: null },
        }),
      ).toBe(0);
    } finally {
      await prisma.dataConflict.deleteMany({ where: { key: { startsWith: 'test-rule:' } } });
      await prisma.sourceRule.deleteMany({
        where: { universityId: uni.id, field: 'component' },
      });
      await prisma.fieldProvenance.deleteMany({
        where: { entityId: { in: ids }, field: 'component' },
      });
      for (const p of before)
        await prisma.fieldProvenance.create({
          data: { ...p, value: p.value as never, previousValue: p.previousValue as never },
        });
      for (const p of programs)
        await prisma.program.update({ where: { id: p.id }, data: { componentId: p.componentId } });
      await prisma.component.deleteMany({
        where: { name: { in: [A, B] }, programs: { none: {} } },
      });
      const { computeIssues } = await import('@/lib/admin/issues');
      await computeIssues({ programIds: ids }, null);
    }
  }, 60_000);

  it('the preferred source wins a disagreement in both directions', () => {
    const cur = {
      value: 'X',
      sourceKey: 'univ-sites',
      source: 'Site de l’université',
      state: 'OK',
      locked: false,
    };
    const inc = { value: 'Y', sourceKey: 'monmaster-opendata', source: 'Mon Master' };
    expect(decideMerge('component', cur, inc).outcome).toBe('conflict');
    expect(decideMerge('component', cur, inc, FIELD_PRIORITY, 'monmaster-opendata')).toEqual({
      outcome: 'update',
      value: 'Y',
    });
    expect(decideMerge('component', cur, inc, FIELD_PRIORITY, 'univ-sites')).toEqual({
      outcome: 'unchanged',
      value: 'X',
    });
  });
});
