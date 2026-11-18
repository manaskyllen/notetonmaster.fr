/** Recomputes the data problems of the whole catalogue (DataIssue): `pnpm tsx scripts/compute-issues.ts`. */
import { computeIssues } from '../lib/admin/issues';
import { prisma } from '../lib/db';

const t = Date.now();
const open = await computeIssues();
console.log(`${open} problèmes ouverts · ${Date.now() - t} ms`);
await prisma.$disconnect();
