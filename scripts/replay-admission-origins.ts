/**
 * Replays « D'où viennent les admis » from the Mon Master snapshots already downloaded (no network,
 * no new sync run): the latest pinned file of each dataset is read again, row by row, and the
 * origins and the three accepted counts are written to the existing AdmissionStat rows (matched by
 * Mon Master number and session). Idempotent.
 *   pnpm tsx scripts/replay-admission-origins.ts            (make data-replay-origins)
 *   pnpm tsx scripts/replay-admission-origins.ts <dir>      (local CSV files, e.g. fixtures/live/monmaster-opendata)
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../lib/db';
import { readCsv } from '../lib/data/csv';
import { normCode } from '../lib/data/normalize';
import { normalizeRow } from '../lib/connectors/monmaster-opendata/normalize';
import {
  detailRow,
  writeAdmissionDetails,
  type AdmissionDetailRow,
} from '../lib/connectors/monmaster-opendata/origins';
import { DATASETS } from '../lib/connectors/monmaster-opendata/shared';

type Dataset = 'main' | '2023';

/** Latest snapshot of each Mon Master dataset (the file of the last publication). */
async function snapshotFiles(): Promise<{ path: string; dataset: Dataset }[]> {
  const source = await prisma.dataSource.findUniqueOrThrow({
    where: { key: 'monmaster-opendata' },
  });
  const out: { path: string; dataset: Dataset }[] = [];
  for (const [dataset, name] of [
    ['main', DATASETS.main],
    ['2023', DATASETS.y2023],
  ] as const) {
    const snap = await prisma.rawSnapshot.findFirst({
      where: { sourceId: source.id, url: { contains: `/datasets/${name}/` } },
      orderBy: [{ pinned: 'desc' }, { fetchedAt: 'desc' }],
    });
    if (snap) out.push({ path: snap.storagePath, dataset });
  }
  return out;
}

async function localFiles(dir: string) {
  return (await readdir(dir))
    .filter((f) => f.endsWith('.csv'))
    .map((f) => ({
      path: join(dir, f),
      dataset: (/2023/.test(f) && !/2024/.test(f) ? '2023' : 'main') as Dataset,
    }));
}

export async function replayAdmissionOrigins(dir?: string) {
  const files = dir ? await localFiles(dir) : await snapshotFiles();
  if (!files.length)
    throw new Error('Aucun snapshot Mon Master : lancer d’abord une synchronisation.');
  const entries = new Map(
    (await prisma.monMasterEntry.findMany({ select: { id: true, code: true } })).map((e) => [
      e.code,
      e.id,
    ]),
  );
  let read = 0;
  let written = 0;
  for (const f of files) {
    let batch: AdmissionDetailRow[] = [];
    for await (const row of readCsv(f.path)) {
      read++;
      const id = entries.get(normCode(row.ifc ?? ''));
      if (!id) continue;
      const n = normalizeRow(row, f.dataset);
      batch.push(detailRow(id, n.session, n.stats));
      if (batch.length >= 1000) {
        written += await writeAdmissionDetails(batch);
        batch = [];
      }
    }
    written += await writeAdmissionDetails(batch);
    console.log(`[origins] ${f.path} (${f.dataset}) lu`);
  }
  return { read, written };
}

if (process.argv[1]?.endsWith('replay-admission-origins.ts')) {
  replayAdmissionOrigins(process.argv[2])
    .then(async (r) => {
      console.log(`[origins] ${r.read} lignes lues, ${r.written} lignes d’admission complétées`);
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
