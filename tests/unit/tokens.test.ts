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
