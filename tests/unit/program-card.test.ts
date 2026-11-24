import { describe, expect, it } from 'vitest';
import { cursusLine, modalityLine, reviewsLine, rhythmPill } from '@/lib/domain/program-card';

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

describe('cursus of a card (issue #21)', () => {
  it('« 3 cursus » and the names, « 4 cursus » alone, nothing for one cursus', () => {
    expect(
      cursusLine({
        cursusCount: 3,
        cursusKind: 'named',
        cursusLabels: ['Strasbourg', 'Kehl', 'Passau'],
      }),
    ).toEqual({ count: '3 cursus', names: ['Strasbourg', 'Kehl', 'Passau'] });
    expect(
      cursusLine({ cursusCount: 4, cursusKind: 'named', cursusLabels: ['A', 'B', 'C', 'D'] }),
    ).toEqual({ count: '4 cursus', names: [] });
    expect(cursusLine({ cursusCount: 1, cursusKind: 'single', cursusLabels: [] })).toBeNull();
    expect(cursusLine({})).toBeNull();
  });

  it('a rhythm pair says « Initiale ou alternance », numbers without labels say nothing', () => {
    expect(cursusLine({ cursusCount: 2, cursusKind: 'rhythm' })).toBeNull();
    expect(rhythmPill(['presentiel', 'alternance'], { cursusKind: 'rhythm' })).toBe(
      'Initiale ou alternance',
    );
    expect(rhythmPill(['alternance'], { cursusKind: 'single' })).toBe('Alternance');
    expect(rhythmPill(['presentiel'], {})).toBeNull();
    expect(cursusLine({ cursusCount: 25, cursusKind: 'unnamed' })).toBeNull();
  });
});
