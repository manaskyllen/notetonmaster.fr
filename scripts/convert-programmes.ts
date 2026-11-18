/**
 * One-off on an existing database (dev, preprod): former semester texts → courses and milestones,
 * then reclassification of the courses. The production bootstrap runs the same functions.
 * `pnpm tsx scripts/convert-programmes.ts`
 */
import { prisma } from '../lib/db';
import { convertLegacySemesters, reclassifyCourses } from '../lib/catalog/program-courses';

const r = await convertLegacySemesters();
const n = await reclassifyCourses();
console.log(
  `${r.semesters} semestres convertis (${r.courses} cours, ${r.milestones} jalons), ${n} cours reclassés`,
);
await prisma.$disconnect();
