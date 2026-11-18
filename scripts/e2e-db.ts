/**
 * Databases of the end-to-end tests (scripts/e2e-stack.sh): `tsx scripts/e2e-db.ts <n>`.
 * Builds notetonmaster_test_template once (migrations, demo seed and the deterministic fixtures of
 * the integration tests and of the end-to-end ones, tests/integration/fixtures and
 * tests/e2e/fixtures), then copies it into
 * notetonmaster_test_0 … notetonmaster_test_<n-1>, one per Playwright worker (a copy from a
 * template takes well under a second, a seed several seconds). Every database is dropped and
 * recreated at each run. Only the server and credentials of DATABASE_URL are used: its own
 * database (the development one) is never touched.
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const count = Number(process.argv[2]);
if (!Number.isInteger(count) || count < 1) throw new Error('Usage: tsx scripts/e2e-db.ts <n>');

const server = new URL(process.env.DATABASE_URL ?? '');
const urlOf = (name: string) => Object.assign(new URL(server), { pathname: `/${name}` }).toString();
const TEMPLATE = 'notetonmaster_test_template';

const admin = new pg.Client({ connectionString: urlOf('postgres') });
await admin.connect();
const recreate = async (name: string, template?: string) => {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"${template ? ` TEMPLATE "${template}"` : ''}`);
};

try {
  await recreate(TEMPLATE);
  const env = { ...process.env, DATABASE_URL: urlOf(TEMPLATE), CI: '1' };
  const bin = (name: string) => `node_modules/.bin/${name}`;
  execFileSync(bin('prisma'), ['migrate', 'deploy'], {
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (const script of [
    'prisma/seed.ts',
    'tests/integration/fixtures/load.ts',
    'tests/e2e/fixtures/load.ts',
  ])
    execFileSync(bin('tsx'), [script, '--force'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < count; i++) await recreate(`notetonmaster_test_${i}`, TEMPLATE);
  console.log(`[e2e-db] ${count} database(s) notetonmaster_test_<0…${count - 1}> ready`);
} finally {
  await admin.end();
}
