/**
 * Rebuilds the search index by hand (sites of the programs, open launch zones, ratings, then
 * every row): `pnpm tsx scripts/rebuild-index.ts`. The sync and the production bootstrap do it
 * on their own; this is for a development database after a migration.
 */
import { prisma } from '../lib/db';
import { rebuildProgramSearchIndex } from '../lib/catalog/program-index';

const t = Date.now();
rebuildProgramSearchIndex()
  .then((n) => console.log(`${n} parcours publiés dans l’index (${Date.now() - t} ms)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
