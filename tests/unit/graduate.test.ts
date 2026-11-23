import { describe, expect, it } from 'vitest';
import { graduateSituationErrors, normalizeSituation, todayLine } from '@/lib/domain/graduate';
import { detectNamedPerson } from '@/lib/domain/names';
import { reviewSchema } from '@/lib/validation';

const base = {
  programSlug: 'valorisation-des-nouveaux-patrimoines',
  cohortYear: 2023,
  overallRating: 4,
  title: 'Le terrain avant tout',
  pros: 'Beaucoup de visites et d’intervenants pros du patrimoine.',
  cons: 'L’emploi du temps change souvent et les salles sont loin.',
  mode: 'none',
  email: 'a@exemple.fr',
  acceptsQuestions: false,
  wantsBadge: false,
  charter: true,
};

describe('graduate situation', () => {
  it('is required for a graduate only', () => {
    expect(graduateSituationErrors({ level: 'M2' })).toEqual({});
    expect(graduateSituationErrors({ level: 'GRADUATE' })).toHaveProperty('employmentStatus');
    expect(graduateSituationErrors({ level: 'GRADUATE', employmentStatus: 'JOB_SEEKING' })).toEqual(
      {},
    );
  });
  it('requires a job title of 3 to 80 characters when employed', () => {
    const employed = { level: 'GRADUATE', employmentStatus: 'EMPLOYED' };
    expect(graduateSituationErrors(employed)).toHaveProperty('jobTitle');
    expect(graduateSituationErrors({ ...employed, jobTitle: 'ab' })).toHaveProperty('jobTitle');
    expect(graduateSituationErrors({ ...employed, jobTitle: 'x'.repeat(81) })).toHaveProperty(
      'jobTitle',
    );
    expect(
      graduateSituationErrors({ ...employed, jobTitle: 'Chargée de médiation, musée' }),
    ).toEqual({});
  });
  it('is enforced by the review schema', () => {
    expect(reviewSchema.safeParse({ ...base, level: 'M1' }).success).toBe(true);
    expect(reviewSchema.safeParse({ ...base, level: 'GRADUATE' }).success).toBe(false);
    expect(
      reviewSchema.safeParse({ ...base, level: 'GRADUATE', employmentStatus: 'EMPLOYED' }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        ...base,
        level: 'GRADUATE',
        employmentStatus: 'EMPLOYED',
        jobTitle: 'chargé de mission patrimoine, collectivité territoriale',
      }).success,
    ).toBe(true);
  });
  it('stores no job title unless employed, nothing for students', () => {
    expect(
      normalizeSituation({ level: 'M1', employmentStatus: 'EMPLOYED', jobTitle: 'x' }),
    ).toEqual({ employmentStatus: null, jobTitle: null });
    expect(
      normalizeSituation({ level: 'GRADUATE', employmentStatus: 'JOB_SEEKING', jobTitle: 'x' }),
    ).toEqual({ employmentStatus: 'JOB_SEEKING', jobTitle: null });
  });
  it('writes the « Aujourd’hui » line', () => {
    expect(todayLine('EMPLOYED', 'chargé de mission patrimoine')).toBe(
      'en poste · chargé de mission patrimoine',
    );
    expect(todayLine('JOB_SEEKING', null)).toBe('en recherche d’emploi');
    expect(todayLine(null, null)).toBe(null);
  });
  it('detects a named person in the job title', () => {
    expect(detectNamedPerson('Assistante de Mme Durand, mairie').found).toBe(true);
    expect(detectNamedPerson('Chargée de médiation, musée municipal').found).toBe(false);
  });
});
