import { describe, expect, it } from 'vitest';
import { computeSelectivity } from '@/lib/domain/selectivity';
import { formatInt, formatRating } from '@/lib/format';

describe('computeSelectivity', () => {
  it('rounds applications / offers', () => {
    // Valorisation des nouveaux patrimoines: 320 candidatures, 47 propositions -> 6.8
    expect(computeSelectivity(320, 47)).toMatchObject({
      ratio: 7,
      text: '≈ 1 proposition pour 7 candidatures',
    });
    // EMAS: 850 / 12 -> 70.8
    expect(computeSelectivity(850, 12).ratio).toBe(71);
  });

  it('never calls it an admission rate', () => {
    expect(computeSelectivity(95, 34).text).not.toMatch(/admission|taux/i);
  });

  it('handles missing data without inventing a 0', () => {
    expect(computeSelectivity(null, 12)).toEqual({
      ratio: null,
      percent: null,
      text: 'Données non publiées',
    });
    expect(computeSelectivity(100, 0).ratio).toBeNull();
  });

  it('uses singular when ratio is 1', () => {
    expect(computeSelectivity(10, 12).text).toBe('≈ 1 proposition pour 1 candidature');
  });
});

describe('format', () => {
  it('formats ratings with one decimal and a French comma', () => {
    expect(formatRating(4.25)).toBe('4,3');
    expect(formatRating(4)).toBe('4,0');
  });
  it('shows n.c. for missing numbers', () => {
    expect(formatInt(null)).toBe('n.c.');
    expect(formatInt(1590)).toBe('1\u202f590');
  });
});
