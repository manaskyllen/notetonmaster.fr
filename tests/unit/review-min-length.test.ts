import { describe, expect, it } from 'vitest';
import { REVIEW_MIN_CHARS, reviewEditSchema, reviewStep2, reviewTextHint } from '@/lib/validation';

/** « Ce que tu as aimé » and « Ce que tu n'as pas aimé »: 15 characters at least, trimmed. */
const FIFTEEN = 'Cours concrets.'; // 15 characters
const step2 = (pros: string, cons: string) =>
  reviewStep2.safeParse({ overallRating: 4, pros, cons, scores: {} });

describe('minimum length of the review texts', () => {
  it('is 15 characters', () => {
    expect(REVIEW_MIN_CHARS).toBe(15);
    expect(FIFTEEN).toHaveLength(15);
  });

  it('accepts 15 characters in both fields, refuses 14', () => {
    expect(step2(FIFTEEN, FIFTEEN).success).toBe(true);
    const short = step2(FIFTEEN.slice(0, 14), FIFTEEN.slice(0, 14));
    expect(short.success).toBe(false);
    expect(short.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['pros', '15 caractères minimum.'],
      ['cons', '15 caractères minimum.'],
    ]);
  });

  it('does not count the spaces at both ends, and stores the text trimmed', () => {
    const padded = step2(`   ${FIFTEEN}  `, `\n${FIFTEEN}\t`);
    expect(padded.success).toBe(true);
    expect(padded.data).toMatchObject({ pros: FIFTEEN, cons: FIFTEEN });
    expect(step2(`   ${FIFTEEN.slice(0, 14)}   `, FIFTEEN).success).toBe(false);
  });

  it('is the same when a review is edited from Mon espace', () => {
    const base = {
      overallRating: 4,
      scores: {},
      level: 'M1',
      cohortYear: 2025,
      acceptsQuestions: false,
    };
    expect(reviewEditSchema.safeParse({ ...base, pros: FIFTEEN, cons: FIFTEEN }).success).toBe(
      true,
    );
    expect(
      reviewEditSchema.safeParse({ ...base, pros: FIFTEEN.slice(0, 14), cons: FIFTEEN }).success,
    ).toBe(false);
  });

  it('counts down in the forms, then says it is enough', () => {
    expect(reviewTextHint('')).toEqual({ text: 'Encore 15 caractères au moins', tone: 'muted' });
    expect(reviewTextHint(`  ${FIFTEEN.slice(0, 14)}  `)).toEqual({
      text: 'Encore 1 caractère au moins',
      tone: 'muted',
    });
    expect(reviewTextHint(FIFTEEN)).toEqual({ text: 'C’est bon ✓', tone: 'ok' });
  });
});
