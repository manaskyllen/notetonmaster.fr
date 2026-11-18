/**
 * Raw SQL: no `$queryRawUnsafe` / `$executeRawUnsafe` without a `raw-sql:` comment just above
 * that says why it is safe (only constants interpolated, values passed as $n parameters).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('raw SQL', () => {
  it('every unsafe raw query is justified in a comment', () => {
    const files = execSync(
      `grep -rlE '\\$(query|execute)RawUnsafe' app lib worker scripts prisma --include=*.ts --exclude-dir=generated`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
    const missing: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (
          /\$(query|execute)RawUnsafe/.test(l) &&
          !lines.slice(Math.max(0, i - 4), i + 1).some((x) => /raw-sql:/.test(x))
        )
          missing.push(`${f}:${i + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it('no SQL built by concatenating a value into an unsafe query', () => {
    // Only the constants of the code may be interpolated in an unsafe query.
    // (a constant, or a transformation of one: OPEN_ISSUE_SQL.replace(…) renames its columns)
    const allowed =
      /^(CARD_SQL|OPEN_ISSUE_SQL|COLUMNS|SELECT_SQL|LASTMOD|ZONE_STATS_SQL|table|list|sets\.join\(', '\))(\.replace\(|$)/;
    const files = execSync(
      `grep -rlE '\\$(query|execute)RawUnsafe' app lib worker scripts --include=*.ts --exclude-dir=generated`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\$(?:query|execute)RawUnsafe[^(]*\(\s*`([^`]*)`/g))
        for (const v of m[1]!.matchAll(/\$\{([^}]+)\}/g))
          if (!allowed.test(v[1]!.trim())) offenders.push(`${f}: \${${v[1]}}`);
    }
    expect(offenders).toEqual([]);
  });
});
