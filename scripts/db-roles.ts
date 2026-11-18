/**
 * Creates or updates the application role `nm_app` (lib/db/roles.ts). Run by the `migrate`
 * service after `prisma migrate deploy`, with the owner's DATABASE_URL and APP_DB_PASSWORD.
 */
import pg from 'pg';
import { applyAppRole } from '../lib/db/roles';

const url = process.env.DATABASE_URL;
const password = process.env.APP_DB_PASSWORD;
if (!url || !password) {
  console.error('[db-roles] DATABASE_URL (propriétaire) et APP_DB_PASSWORD sont nécessaires.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await applyAppRole(client, password);
  console.log('[db-roles] rôle nm_app à jour');
} finally {
  await client.end();
}
