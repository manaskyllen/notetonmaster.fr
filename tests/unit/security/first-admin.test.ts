/**
 * The first admin account of production comes only from `pnpm admin:create` (invitation by mail,
 * tests/integration/security/admin-create.test.ts): the production bootstrap creates no account,
 * and the demo seed (accounts with public credentials) refuses to run on a public address.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('first admin account in production', () => {
  it('the production bootstrap never creates or edits an account', () => {
    const src = readFileSync('prisma/bootstrap.ts', 'utf8');
    expect(src).not.toMatch(/adminUser\.(create|createMany|upsert|update|updateMany)\b/);
    expect(src).not.toMatch(/hashPassword|notetonmaster\.local|PROD_ADMIN_EMAIL/);
    // It only points to the command.
    expect(src).toMatch(/pnpm admin:create/);
  });

  it('the demo admins never use a .local address', () => {
    const demo = JSON.parse(readFileSync('prisma/fixtures/demo.json', 'utf8')) as {
      admins: { email: string }[];
    };
    for (const a of demo.admins) expect(a.email).toMatch(/@notetonmaster\.example$/);
  });

  it('the demo seed (public credentials) refuses a production with a public address', () => {
    const r = spawnSync('node_modules/.bin/tsx', ['prisma/seed.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_URL: 'https://notetonmaster.fr',
        DEMO_SEED_I_KNOW: '',
        // Never reached: the check comes before any query.
        DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/\[seed\] refused/);
  }, 70_000);
});
