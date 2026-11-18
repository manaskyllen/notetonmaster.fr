/**
 * JSON export of tables about to be dropped by a migration:
 * `backups/<Table>-<date>.json`, one file per table that still exists and has rows. Run before
 * `prisma migrate deploy` by the prod « migrate » service (backups/ is a volume there), and by
 * hand in development: `pnpm tsx scripts/backup-tables.ts`. backups/ is ignored by git and
 * outside the public site. Idempotent: a table already dropped is skipped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/db';

/** Tables dropped in November 2026 that hold students' data (and what goes with them). */
export const DROPPED_TABLES = [
  'Wish',
  'PhaseReminder',
  'PhaseReminderSent',
  'MonMasterPhase',
] as const;

async function main() {
  const dir = join(process.cwd(), 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  for (const table of DROPPED_TABLES) {
    const [row] = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass(${`public."${table}"`}) IS NOT NULL AS exists`;
    if (!row?.exists) continue;
    // table names come from the fixed list above, never from input
    // raw-sql: the table name comes from the fixed DROPPED_TABLES list, never from input.
    const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}" ORDER BY 1`);
    if (!rows.length) {
      console.log(`${table} : vide, rien à exporter`);
      continue;
    }
    const file = join(dir, `${table}-${stamp}.json`);
    writeFileSync(
      file,
      JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2),
    );
    console.log(`${table} : ${rows.length} lignes → ${file}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
