import { describe, expect, it } from 'vitest';
import type { AdminCounts } from '@/lib/admin/counts';
import { buildSubjects } from '@/lib/admin/overview';

/** « À traiter » of the overview: one row per subject, by urgency then number, filtered by role. */
function counts(over: Partial<AdminCounts> = {}): AdminCounts {
  return {
    issues: [
      { kind: 'CONFLICT', targetType: 'PROGRAM', severity: 'HIGH', published: true, n: 12 },
      { kind: 'NO_PROGRAM', targetType: 'PROGRAM', severity: 'LOW', published: true, n: 164 },
      { kind: 'NO_PROGRAM', targetType: 'PROGRAM', severity: 'LOW', published: false, n: 6000 },
      { kind: 'OLD_PROGRAM', targetType: 'PROGRAM', severity: 'LOW', published: true, n: 88 },
      { kind: 'NO_UAI', targetType: 'PROGRAM', severity: 'LOW', published: true, n: 6 },
    ],
    fichesToHandle: 183,
    collectErrors: {
      sources: ['France Compétences · RNCP'],
      universities: ['Université de Haute-Alsace'],
      total: 2,
    },
    noProgramByCity: [{ city: 'Strasbourg', n: 71 }],
    moderation: {
      reviews: 4,
      documents: 0,
      messages: 0,
      reports: 0,
      legal: 1,
      responses: 0,
      questions: 0,
      total: 5,
    },
    oldestReviewHours: 31,
    legalDeadlineDays: 2,
    conflictGroups: { groups: 3, fields: ['places', 'composante', 'frais'], isolated: 1 },
    noProfile: { n: 3, names: ['ENGEES', 'Oniris VetAgroBio', 'IMT Atlantique'] },
    computedAt: new Date().toISOString(),
    ...over,
  };
}

describe('overview subjects', () => {
  it('sorted by urgency, then by number', () => {
    const s = buildSubjects(counts(), 'ADMIN');
    expect(s.map((x) => x.key)).toEqual([
      'collect', // block, 2
      'legal', // block, 1
      'conflicts', // high, 12
      'moderation', // high, 4
      'no-program', // low, 164
      'old-program',
      'no-uai',
      'no-profile',
    ]);
    const conflicts = s.find((x) => x.key === 'conflicts')!;
    expect(conflicts.title).toBe('conflits de données sur des fiches publiées');
    expect(conflicts.detail).toBe('Regroupés en 3 règles : places, composante, frais');
    expect(conflicts.href).toBe('/admin/fiches?vue=conflits');
    // Only the published fiches count.
    expect(s.find((x) => x.key === 'no-program')!.n).toBe(164);
  });

  it('a subject with nothing left disappears', () => {
    const solved = counts({
      issues: counts().issues.filter((i) => i.kind !== 'CONFLICT'),
      moderation: { ...counts().moderation, reviews: 0, total: 1 },
    });
    const keys = buildSubjects(solved, 'ADMIN').map((x) => x.key);
    expect(keys).not.toContain('conflicts');
    expect(keys).not.toContain('moderation');
    expect(
      buildSubjects(
        counts({
          issues: [],
          collectErrors: { sources: [], universities: [], total: 0 },
          moderation: { ...counts().moderation, reviews: 0, legal: 0, total: 0 },
          noProfile: { n: 0, names: [] },
        }),
        'ADMIN',
      ),
    ).toEqual([]);
  });

  it('each role sees its subjects: Modération does not see the data ones', () => {
    expect(buildSubjects(counts(), 'MODERATOR').map((x) => x.key)).toEqual(['moderation']);
    expect(buildSubjects(counts(), 'LEGAL').map((x) => x.key)).toEqual(['legal']);
    const data = buildSubjects(counts(), 'DATA_EDITOR').map((x) => x.role);
    expect(new Set(data)).toEqual(new Set(['Données']));
  });
});
