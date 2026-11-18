import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { establishmentShort, splitParcoursTitle } from '@/lib/domain/titles';

describe('titles: « Parcours : M2 Spécialité »', () => {
  afterAll(() => prisma.$disconnect());
  it('splits the parent parcours from the speciality, case untouched', () => {
    expect(splitParcoursTitle('Droit des affaires : M2 Droit des affaires approfondi')).toEqual({
      title: 'Droit des affaires approfondi',
      parent: 'Droit des affaires',
      entersInM2: true,
    });
    expect(splitParcoursTitle('Valorisation des nouveaux patrimoines')).toEqual({
      title: 'Valorisation des nouveaux patrimoines',
      parent: null,
      entersInM2: false,
    });
    expect(splitParcoursTitle('MEEF : M1 ou M2 ?').parent).toBeNull();
  });
  it('works on 5 real titles of the national data, as the index does', async () => {
    const rows = await prisma.program.findMany({
      where: { title: { contains: ' : M2 ' } },
      take: 5,
      select: {
        title: true,
        entryLevel: true,
        searchIndex: { select: { title: true, parentTitle: true } },
      },
    });
    if (rows.length < 5) return; // pilot seed only: no such title
    for (const r of rows) {
      const s = splitParcoursTitle(r.title);
      expect(s.entersInM2, r.title).toBe(true);
      expect(r.entryLevel, r.title).toBe('M2');
      if (r.searchIndex) expect(r.searchIndex).toEqual({ title: s.title, parentTitle: s.parent });
      expect(`${s.parent} : M2 ${s.title}`).toBe(r.title);
    }
  });
  it('shortens only the long establishment names', () => {
    expect(establishmentShort({ name: 'Université de Bordeaux', shortName: 'UBx' })).toBe(
      'Université de Bordeaux',
    );
    expect(
      establishmentShort({ name: 'Université de Reims Champagne-Ardenne', shortName: 'URCA' }),
    ).toBe('Université de Reims Champagne-Ardenne');
    expect(
      establishmentShort({
        name: 'Université de Versailles Saint-Quentin-en-Yvelines',
        shortName: 'UVSQ',
      }),
    ).toBe('UVSQ');
  });
});
