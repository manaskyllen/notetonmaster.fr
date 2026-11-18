/**
 * Every export of a 'use server' module is a public entry point (POST with its action id).
 * Static checks on the sources: an action that reads personal data checks a session itself.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SESSION =
  /\b(getCurrentStudent|getCurrentAdmin|getCurrentResponder|requireStudent|requireRole|requireAdmin|guard|guardSensitive|consumeToken|consumeCode|peekToken|pendingAdmin|adminSession|studentSession|staffSession)\b/;

function serverModules(): string[] {
  return execSync(`grep -rlE "^'use server'" app lib components`, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

/** Each exported function with its own body (up to the next top-level declaration). */
function exportedFunctions(src: string) {
  const decl = /^(?:export )?(?:async )?(?:function|const|let|type|interface|class) (\w+)/gm;
  const hits = [...src.matchAll(decl)];
  return hits
    .map((h, i) => ({ h, body: src.slice(h.index, hits[i + 1]?.index ?? src.length) }))
    .filter(({ h }) => /^export (?:async )?function/.test(h[0]))
    .map(({ h, body }) => ({ name: h[1]!, body }));
}

describe("'use server' modules", () => {
  it('an exported action that decrypts personal data checks a session or a token first', () => {
    const offenders: string[] = [];
    for (const file of serverModules()) {
      for (const fn of exportedFunctions(readFileSync(file, 'utf8')))
        if (/\bdecrypt\(/.test(fn.body) && !SESSION.test(fn.body))
          offenders.push(`${file} › ${fn.name}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no unauthenticated action reads a whole database row of an admin account', () => {
    const offenders: string[] = [];
    for (const file of serverModules()) {
      for (const fn of exportedFunctions(readFileSync(file, 'utf8')))
        if (
          !SESSION.test(fn.body) &&
          /prisma\.adminUser\.find(Unique|First)\(\{\s*where: \{[^{}]*(\{[^{}]*\}[^{}]*)?\}\s*\}\)/.test(
            fn.body,
          )
        )
          offenders.push(`${file} › ${fn.name}`);
    }
    expect(offenders).toEqual([]);
  });
});
