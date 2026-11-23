import { describe, expect, it } from 'vitest';
import { graduateSituationErrors, normalizeSituation, todayLine } from '@/lib/domain/graduate';
import { alumniWho } from '@/lib/domain/questions';
import { authorWho, LEVEL_LABEL, LEVEL_SHORT } from '@/lib/domain/rating';
import { LEVEL_SUFFIX, visibleReviewFilters } from '@/lib/domain/review-filters';
import { LEAVE_REASON_MAX, reviewEditSchema, reviewSchema } from '@/lib/validation';

/** « J'ai arrêté en cours » (issue #18). */
const base = {
  programSlug: 'valorisation-des-nouveaux-patrimoines',
  level: 'LEFT',
  cohortYear: 2025,
  overallRating: 2,
  pros: 'Les cours d’histoire du patrimoine sont solides et l’équipe disponible.',
  cons: 'Très peu de numérique alors que la brochure le met en avant partout.',
  mode: 'none',
  email: 'a@exemple.fr',
  acceptsQuestions: false,
  wantsBadge: false,
  charter: true,
};

describe('status « J’ai arrêté en cours »', () => {
  it('is a valid status, without « Et aujourd’hui ? » nor reason', () => {
    expect(reviewSchema.safeParse(base).success).toBe(true);
    expect(reviewSchema.safeParse({ ...base, employmentStatus: '' }).success).toBe(true);
    expect(reviewSchema.safeParse({ ...base, level: 'OTHER' }).success).toBe(false);
  });

  it('takes an optional situation, never a job title', () => {
    expect(graduateSituationErrors({ level: 'LEFT' })).toEqual({});
    expect(graduateSituationErrors({ level: 'LEFT', employmentStatus: 'FURTHER_STUDY' })).toEqual(
      {},
    );
    expect(graduateSituationErrors({ level: 'LEFT', employmentStatus: 'EMPLOYED' })).toEqual({});
    expect(graduateSituationErrors({ level: 'LEFT', employmentStatus: 'RETIRED' })).toHaveProperty(
      'employmentStatus',
    );
    expect(
      normalizeSituation({ level: 'LEFT', employmentStatus: 'EMPLOYED', jobTitle: 'Chargée' }),
    ).toEqual({ employmentStatus: 'EMPLOYED', jobTitle: null });
    expect(normalizeSituation({ level: 'LEFT', employmentStatus: '' })).toEqual({
      employmentStatus: null,
      jobTitle: null,
    });
  });

  it('accepts an optional reason, up to its maximum', () => {
    expect(reviewSchema.safeParse({ ...base, leaveReason: '' }).success).toBe(true);
    expect(
      reviewSchema.safeParse({ ...base, leaveReason: 'Je voulais faire de la médiation.' }).success,
    ).toBe(true);
    expect(
      reviewSchema.safeParse({ ...base, leaveReason: 'x'.repeat(LEAVE_REASON_MAX + 1) }).success,
    ).toBe(false);
    expect(
      reviewEditSchema.safeParse({ ...base, title: '', scores: {}, leaveReason: 'Réorientation.' })
        .success,
    ).toBe(true);
  });

  it('never shows a year', () => {
    expect(authorWho('LEFT', 2025)).toBe('A quitté le master en cours');
    expect(authorWho('M2', 2025)).toBe('M2 · promo 2025');
    expect(authorWho('GRADUATE', 2023)).toBe('Diplômé·e · promo 2023');
    expect(alumniWho('LEFT', 2025)).toBe('A quitté le master en cours');
    expect(alumniWho(null, null)).toBe('Ancien·ne du parcours');
    expect(LEVEL_SHORT.LEFT).toBe('Ex');
    expect(LEVEL_LABEL.LEFT).not.toMatch(/\d/);
  });

  it('words « Aujourd’hui : … » with the choices of someone who left', () => {
    expect(todayLine('FURTHER_STUDY', null, 'LEFT')).toBe('dans une autre formation');
    expect(todayLine('EMPLOYED', 'ignoré', 'LEFT')).toBe('en emploi');
    expect(todayLine(null, null, 'LEFT')).toBeNull();
    expect(todayLine('EMPLOYED', 'Chargée de mission', 'GRADUATE')).toBe(
      'en poste · Chargée de mission',
    );
  });

  it('shows the « Parti·es en cours » filter only with one review of that kind', () => {
    const ids = (byLevel: Record<string, number>, current = 'all') =>
      visibleReviewFilters(byLevel, current).map((f) => f.id);
    expect(ids({ M1: 2, GRADUATE: 1 })).toEqual(['all', 'M1', 'M2', 'GRADUATE']);
    expect(ids({ M1: 2, LEFT: 1 })).toEqual(['all', 'M1', 'M2', 'GRADUATE', 'LEFT']);
    // Still listed when it is the filter in the address (no dead end).
    expect(ids({}, 'LEFT')).toContain('LEFT');
    expect(LEVEL_SUFFIX.LEFT).toBe(' · parti·es en cours');
  });
});
