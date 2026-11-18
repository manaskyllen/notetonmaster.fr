/** Supply chain: actions pinned by commit, updates by Dependabot, pnpm install policies. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflows = readdirSync('.github/workflows').map((f) => `.github/workflows/${f}`);

describe('supply chain', () => {
  it('every GitHub Action is pinned by a full commit SHA', () => {
    const loose: string[] = [];
    for (const f of workflows)
      for (const m of readFileSync(f, 'utf8').matchAll(/uses:\s*([^\s#]+)/g))
        if (!/@[0-9a-f]{40}$/.test(m[1]!) && !m[1]!.startsWith('./')) loose.push(`${f}: ${m[1]}`);
    expect(loose).toEqual([]);
  });

  it('no workflow runs the code of a pull request with secrets (pull_request_target)', () => {
    for (const f of workflows)
      expect(readFileSync(f, 'utf8')).not.toMatch(/^\s*pull_request_target\s*:/m);
  });

  it('workflows read the repository only by default', () => {
    for (const f of workflows)
      expect(readFileSync(f, 'utf8')).toMatch(/^permissions:\n\s+contents: read/m);
  });

  it('Dependabot updates npm and GitHub Actions', () => {
    const d = readFileSync('.github/dependabot.yml', 'utf8');
    expect(d).toMatch(/package-ecosystem: npm/);
    expect(d).toMatch(/package-ecosystem: github-actions/);
  });

  it('pnpm refuses fresh releases, exotic sub-dependencies and trust downgrades', () => {
    const w = readFileSync('pnpm-workspace.yaml', 'utf8');
    expect(w).toMatch(/minimumReleaseAge: \d+/);
    expect(w).toMatch(/blockExoticSubdeps: true/);
    expect(w).toMatch(/trustPolicy: no-downgrade/);
  });
});
