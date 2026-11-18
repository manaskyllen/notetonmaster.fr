/**
 * Demo data (prisma/seed.ts) only lives on local machines and in the CI: its admin passwords and
 * TOTP secrets are public. In a real production deployment:
 * - the server refuses to start when the database holds a demo account or demo content;
 * - a demo address can never log in.
 * A local production build (ALLOW_INSECURE_LOCAL_PROD=1, lib/env.ts) may run on the demo data.
 */
import { isInsecureLocalProd } from '@/lib/env';

const DEMO_DOMAINS = /@(demo\.notetonmaster\.local|notetonmaster\.example)$/i;

export const isDemoAddress = (email: string) => DEMO_DOMAINS.test(email.trim());

/** A production deployment that is not a local build: demo data is refused there. */
export const isRealProduction = () =>
  process.env.NODE_ENV === 'production' && !isInsecureLocalProd();

export async function assertNoDemoData() {
  if (!isRealProduction()) return;
  const { prisma } = await import('@/lib/db');
  const [admins, students, reviews] = await Promise.all([
    prisma.adminUser.count({
      where: {
        removedAt: null,
        OR: [
          { email: { endsWith: '@notetonmaster.example' } },
          { email: { endsWith: '@demo.notetonmaster.local' } },
        ],
      },
    }),
    prisma.student.count({ where: { isDemo: true } }),
    prisma.review.count({ where: { isDemo: true } }),
  ]);
  if (admins + students + reviews > 0)
    throw new Error(
      `Données de démo dans la base de production (${admins} comptes admin, ${students} étudiant·es, ${reviews} avis) : le serveur ne démarre pas. Cette base vient du seed, pas du bootstrap de production.`,
    );
}
