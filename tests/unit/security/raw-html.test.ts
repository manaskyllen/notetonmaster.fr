/**
 * Texts written by people (reviews, questions, messages, replies, banner) are rendered as text.
 * Raw HTML only in the places below, each with an `html-safe:` comment saying why.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ALLOWED = [
  'app/layout.tsx',
  'app/(public)/legal/[doc]/page.tsx',
  'components/seo/JsonLd.tsx',
  'components/public/ArticleHtml.tsx',
];

describe('dangerouslySetInnerHTML', () => {
  const files = execSync(
    `grep -rl dangerouslySetInnerHTML app components --include=*.tsx || true`,
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  it('only in the known places', () => {
    expect(files.sort()).toEqual([...ALLOWED].sort());
  });

  it('each use is justified', () => {
    const missing: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (
          l.includes('dangerouslySetInnerHTML') &&
          !lines.slice(Math.max(0, i - 4), i + 1).some((x) => x.includes('html-safe:'))
        )
          missing.push(`${f}:${i + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
