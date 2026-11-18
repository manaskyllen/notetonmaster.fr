import { describe, expect, it } from 'vitest';
import { gradeColor } from '@/lib/domain/rating';

/** Relative luminance (WCAG) of an `rgb(r, g, b)` string. */
function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.map((c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe('gradeColor', () => {
  it('maps each whole rating to its stop, from red to green', () => {
    expect(gradeColor(1)).toBe('rgb(255, 176, 161)'); // #FFB0A1
    expect(gradeColor(2)).toBe('rgb(255, 199, 154)'); // #FFC79A
    expect(gradeColor(3)).toBe('rgb(255, 224, 122)'); // #FFE07A
    expect(gradeColor(4)).toBe('rgb(212, 240, 117)'); // #D4F075
    expect(gradeColor(5)).toBe('rgb(155, 224, 168)'); // #9BE0A8
  });
  it('interpolates an average in RGB', () => {
    // 4,1 → 10 % of the way from vert-lime to vert.
    expect(gradeColor(4.1)).toBe('rgb(206, 238, 122)');
    expect(gradeColor(4.5)).toBe('rgb(184, 232, 143)');
  });
  it('clamps out-of-range values and scales by max', () => {
    expect(gradeColor(0)).toBe(gradeColor(1));
    expect(gradeColor(9)).toBe(gradeColor(5));
    expect(gradeColor(NaN)).toBe(gradeColor(1));
    expect(gradeColor(10, 10)).toBe(gradeColor(5));
  });
  it('keeps ink text at 10:1 or more on every tint', () => {
    const ink = luminance('rgb(22, 19, 31)'); // #16131F
    for (let v = 1; v <= 5; v += 0.1) {
      const ratio = (luminance(gradeColor(v)) + 0.05) / (ink + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(10);
    }
  });
});
