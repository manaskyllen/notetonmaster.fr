/**
 * Recomputes the public / private sector of every establishment from the annuaire, then the
 * search index (`make sectors`). Runs on its own after each sync publication; this script is for
 * an existing database (first deployment of the sector rule).
 */
import { prisma } from '@/lib/db';
import { refreshUniversitySectors } from '@/lib/data/sectors';
import { refreshSearchIndex } from '@/lib/search-index';

const r = await refreshUniversitySectors(async (m) => console.log(m));
await refreshSearchIndex();
console.log(
  r.skipped
    ? 'annuaire absent (esr-etablissements jamais récupéré) : rien à faire'
    : `${r.updated} mis à jour, ${r.unknown} hors annuaire`,
);
await prisma.$disconnect();
