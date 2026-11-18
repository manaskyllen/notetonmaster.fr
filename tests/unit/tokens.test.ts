import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTokensCss } from '@/scripts/build-tokens';

const tokens = JSON.parse(readFileSync('styles/tokens.json', 'utf8'));

describe('buildTokensCss', () => {
  const css = buildTokensCss(tokens);

  it('emits every color token for both themes', () => {
    expect(css).toContain('--violet-500: #5a3bf0;');
    expect(css).toContain('--violet-500: #9c88ff;');
    expect(css).toContain('--lime-400: #d4f75a;');
  });

  it('supports system preference and forced themes', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-theme='light'])");
    expect(css).toContain(":root[data-theme='dark']");
  });

  it('wires next/font variables into font stacks', () => {
    expect(css).toMatch(/--font-display: var\(--nf-display\), "Bricolage Grotesque"/);
  });

  it('is in sync with the committed styles/tokens.css', () => {
    expect(readFileSync('styles/tokens.css', 'utf8')).toBe(css);
  });
});

/** WCAG relative luminance and contrast ratio. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('text tokens on the light backgrounds (WCAG AA, 4.5:1)', () => {
  const value = Object.fromEntries(
    (tokens.color.tokens as { name: string; value: { light: string; dark: string } }[]).map((t) => [
      t.name,
      t.value,
    ]),
  );
  const texts = ['ink', 'ink-muted', 'success', 'warning', 'danger', 'violet-500', 'violet-700'];
  const backgrounds = [
    'surface-0',
    'surface-50',
    'surface-100',
    'surface-subtle',
    'success-bg',
    'success-subtle',
    'warning-bg',
    'danger-bg',
    'violet-100',
  ];
  for (const theme of ['light', 'dark'] as const)
    for (const fg of texts)
      it(`${fg} (${theme})`, () => {
        for (const bg of backgrounds)
          expect(
            contrast(value[fg]![theme], value[bg]![theme]),
            `${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
      });
});
