/**
 * Replays a pipeline run on local files instead of downloading them (no network):
 *   pnpm tsx scripts/data-replay.ts monmaster-opendata fixtures/live/monmaster-opendata [preview|apply]
 * The files are copied into the rawdata volume and recorded as the run's snapshots with the
 * official URL of their dataset; the run then starts at « parse ». Used to test the publish step
 * on the pilot extracts (and by the integration tests).
 */
import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../lib/db';
import { executeRun } from '../lib/connectors/runner';
import { saveSnapshot, snapshotPath } from '../lib/data/snapshot';

const ESR = 'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets';
const FILE_TO_URL: Record<string, string> = {
  'mon_master_2024_2025.csv': `${ESR}/fr-esr-mon_master/exports/csv?delimiter=%3B`,
  'mon_master_2023.csv': `${ESR}/fr-esr-mon_master_2023/exports/csv?delimiter=%3B`,
  'principaux_etablissements.csv': `${ESR}/fr-esr-principaux-etablissements-enseignement-superieur/exports/csv?delimiter=%3B`,
  'implantations.csv': `${ESR}/fr-esr-implantations_etablissements_d_enseignement_superieur_publics/exports/csv?delimiter=%3B`,
};

export async function replay(sourceKey: string, dir: string, mode: 'PREVIEW' | 'APPLY') {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const admin = await prisma.adminUser.findFirst({
    where: { role: { in: ['ADMIN', 'DATA_EDITOR'] } },
  });
  const run = await prisma.syncRun.create({
    data: {
      sourceId: source.id,
      trigger: 'manual',
      mode,
      resumeFromStep: 'parse',
      sourceVersion: `replay ${dir}`,
      // a replay is validated by construction (it never reaches the network)
      validatedAt: mode === 'APPLY' ? new Date() : null,
      validatedById: mode === 'APPLY' ? (admin?.id ?? null) : null,
    },
  });
  for (const f of await readdir(dir)) {
    const url = FILE_TO_URL[f];
    if (!url) continue;
    const target = snapshotPath(sourceKey, `replay-${f}`);
    await copyFile(join(dir, f), `${target}.src`).catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(target, '..'), { recursive: true });
      await copyFile(join(dir, f), `${target}.src`);
    });
    await saveSnapshot({
      sourceKey,
      runId: run.id,
      url,
      fileName: `replay-${f}`,
      file: `${target}.src`,
      sourceVersion: run.sourceVersion,
    });
  }
  const claimed = await prisma.syncRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date(), heartbeatAt: new Date() },
    include: { source: true },
  });
  await executeRun(claimed);
  return prisma.syncRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { logs: { orderBy: { at: 'asc' } } },
  });
}

if (process.argv[1]?.endsWith('data-replay.ts')) {
  const [sourceKey, dir, m] = process.argv.slice(2);
  replay(sourceKey!, dir!, (m ?? 'preview').toUpperCase() === 'APPLY' ? 'APPLY' : 'PREVIEW')
    .then(async (r) => {
      for (const l of r.logs) console.log(`  ${l.level.padEnd(5)} ${l.message}`);
      console.log(`[replay] ${r.status}`, JSON.stringify(r.stats));
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
