/**
 * Vitest globalSetup of the integration project: a fresh test database at each run, in local as in
 * CI. Drops and recreates DATABASE_URL_TEST (refused if it points to the development database),
 * applies the migrations, loads the demo seed (silent) and the integration fixtures.
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { assertTestDatabase } from './test-db';

export default async function setup() {
  const url = assertTestDatabase(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL_DEV);
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  const env = { ...process.env, DATABASE_URL: url.toString(), CI: '1' };
  const run = (args: string[]) =>
    execFileSync('pnpm', ['-s', ...args], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  run(['prisma', 'migrate', 'deploy']);
  run(['tsx', 'prisma/seed.ts', '--force']);
  process.stdout.write(run(['tsx', 'tests/integration/fixtures/load.ts']));
}
