/**
 * Database roles (docs/deploiement.md). The owner (POSTGRES_USER) runs the migrations; the site
 * and the worker connect as `nm_app`, which only reads and writes rows:
 * - no DDL (CREATE, ALTER, DROP, TRUNCATE), no write to the migration history;
 * - AuditLog: SELECT, INSERT, DELETE only (the trigger audit_log_immutable refuses any deletion
 *   before the retention period), never UPDATE; as it does not own the table, it cannot disable
 *   or drop the trigger;
 * - the search view is refreshed through nm_refresh_search_document() (SECURITY DEFINER).
 *
 * Idempotent: run after every `prisma migrate deploy` (the `migrate` service does it), so new
 * tables get their privileges too.
 */
import type pg from 'pg';

export async function applyAppRole(owner: pg.Client | pg.PoolClient, password: string) {
  if (!password || password.length < 16) throw new Error('APP_DB_PASSWORD: 16 caractères au moins');
  const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const { rows } = await owner.query<{ me: string }>('SELECT current_user AS me');
  const me = rows[0]!.me;
  await owner.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nm_app') THEN CREATE ROLE nm_app; END IF;
    END $$;
    ALTER ROLE nm_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD ${lit(password)};
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    REVOKE ALL ON SCHEMA public FROM nm_app;
    GRANT USAGE ON SCHEMA public TO nm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nm_app;
    REVOKE UPDATE ON "AuditLog" FROM nm_app;
    REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM nm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO nm_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE "${me.replace(/"/g, '')}" IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nm_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE "${me.replace(/"/g, '')}" IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO nm_app;
  `);
}
