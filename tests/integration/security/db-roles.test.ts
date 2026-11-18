/**
 * The application connects with a role that only reads and writes rows (nm_app); migrations run
 * with the owner. The audit log only accepts inserts (and the retention purge).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAppRole } from '@/lib/db/roles';

const ownerUrl = process.env.DATABASE_URL!;
const password = randomBytes(18).toString('base64url');
let owner: pg.Client;
let app: pg.Client;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await applyAppRole(owner, password);
  const u = new URL(ownerUrl);
  u.username = 'nm_app';
  u.password = password;
  app = new pg.Client({ connectionString: u.toString() });
  await app.connect();
});

afterAll(async () => {
  await app?.end();
  await owner.query(`DROP OWNED BY nm_app; DROP ROLE IF EXISTS nm_app`).catch(() => {});
  await owner?.end();
});

const denied = (sql: string, params: unknown[] = []) =>
  expect(app.query(sql, params)).rejects.toThrow(/permission denied|must be owner|append-only/);

describe('application role nm_app', () => {
  it('reads and writes rows', async () => {
    const r = await app.query('SELECT count(*)::int AS n FROM "Program"');
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0);
    await app.query(
      `INSERT INTO "AuditLog" (id, "actorLabel", category, "objectLabel", detail) VALUES ($1, 'Test', 'CONNEXION', 'x', 'test rôle applicatif')`,
      [`test-role-${Date.now()}`],
    );
  });

  it('cannot change or delete an audit entry, nor remove the protection', async () => {
    // Its own entry: the triggers only fire on an existing row.
    const id = `test-role-${Date.now()}-protected`;
    await app.query(
      `INSERT INTO "AuditLog" (id, "actorLabel", category, "objectLabel", detail) VALUES ($1, 'Test', 'CONNEXION', 'x', 'entrée protégée')`,
      [id],
    );
    await denied(`UPDATE "AuditLog" SET detail = 'modifié' WHERE id = $1`, [id]);
    await denied(`DELETE FROM "AuditLog" WHERE id = $1`, [id]);
    await denied(`DROP TRIGGER audit_log_no_update ON "AuditLog"`);
    await denied(`ALTER TABLE "AuditLog" DISABLE TRIGGER ALL`);
  });

  it('cannot change the schema nor the migration history', async () => {
    await denied(`CREATE TABLE nm_test_role (id int)`);
    await denied(`ALTER TABLE "Program" ADD COLUMN nm_test int`);
    await denied(`DROP TABLE "Review"`);
    await denied(`TRUNCATE "Review"`);
    await denied(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ('x', 'x', 'x', now())`,
    );
  });

  it('refreshes the search view through the function made for it', async () => {
    await expect(app.query('SELECT nm_refresh_search_document()')).resolves.toBeDefined();
  });

  it('the production compose file connects the app and the worker with nm_app', () => {
    const prod = readFileSync('docker-compose.prod.yml', 'utf8');
    expect(prod).toMatch(/DATABASE_URL: postgresql:\/\/nm_app:/);
    expect(prod).toMatch(/APP_DB_PASSWORD/);
  });
});
