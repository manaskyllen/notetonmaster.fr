import { describe, expect, it } from 'vitest';
import { modalityLine, reviewsLine } from '@/lib/domain/program-card';

describe('modality line of a card', () => {
  it('length then the ways of following it', () => {
    expect(modalityLine({ durationYears: 2, entryLevel: 'M1', modalities: ['presentiel'] })).toBe(
      '2 ans · Présentiel',
    );
    expect(modalityLine({ durationYears: 1, entryLevel: 'M2', modalities: ['alternance'] })).toBe(
      'M2 seul · en alternance',
    );
    expect(
      modalityLine({ durationYears: 2, entryLevel: 'M1', modalities: ['presentiel', 'continue'] }),
    ).toBe('2 ans · Présentiel, formation continue');
    expect(modalityLine({ durationYears: 1, entryLevel: 'M1', modalities: [] })).toBe('1 an');
  });
});

describe('reviews line of a card', () => {
  it('count and recommendation, nothing without reviews', () => {
    expect(reviewsLine(12, 83)).toEqual({ count: '12 avis', recommend: '83 % le recommandent' });
    expect(reviewsLine(0, null)).toBeNull();
  });
});
