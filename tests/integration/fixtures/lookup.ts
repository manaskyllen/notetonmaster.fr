/** Named lookups of the integration data (demo seed + fixtures): never « the first row ». */
import { prisma } from '@/lib/db';

/** The Admin account of the demo seed (prisma/fixtures/demo.json). */
export const DEMO_ADMIN_EMAIL = 'alexis@notetonmaster.example';

export const programBySlug = (slug: string) => prisma.program.findUniqueOrThrow({ where: { slug } });
export const universityBySlug = (slug: string) =>
  prisma.university.findUniqueOrThrow({ where: { slug } });
export const mentionBySlug = (slug: string) => prisma.mention.findUniqueOrThrow({ where: { slug } });
export const fixtureAdmin = () =>
  prisma.adminUser.findUniqueOrThrow({ where: { email: DEMO_ADMIN_EMAIL } });
