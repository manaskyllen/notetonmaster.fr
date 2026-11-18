/**
 * Shared access to the ESR open-data portal (Opendatasoft Explore v2.1): dataset version and
 * full CSV export, through the polite client and its open-data exception (lib/data/http.ts).
 */
import { prisma } from '@/lib/db';
import { MB, OPEN_DATA_PATTERNS } from '@/lib/data/http';
import { compareColumns, expectedColumns } from '@/lib/data/schema-check';
import { readCsv } from '@/lib/data/csv';
import { saveSnapshot, snapshotPath } from '@/lib/data/snapshot';
import { recordChecks } from '@/lib/data/pipeline';
import type { RawSnapshot } from '@/lib/db/generated/client';
import type { PipelineContext } from './types';

export const ESR_HOST = 'data.enseignementsup-recherche.gouv.fr';
const ESR_API = `https://${ESR_HOST}/api/explore/v2.1/catalog/datasets`;

export const esrExceptions = (...datasets: string[]) =>
  datasets.map((d) => OPEN_DATA_PATTERNS.esr(d));

export interface DatasetVersion {
  dataset: string;
  modified: string; // metas.default.modified
  records: number | null;
  license: string | null;
}

/** Modification date of a dataset (cheap request): the run stops early when nothing changed. */
export async function esrDatasetVersion(
  ctx: PipelineContext,
  dataset: string,
): Promise<DatasetVersion> {
  const r = await ctx.http.get(`${ESR_API}/${dataset}`, { accept: ['json'], maxBytes: 5 * MB });
  if (r.kind === 'skip') throw new Error(`${dataset} : ${r.reason}`);
  if (r.kind !== 'response' || r.status !== 200 || !r.body)
    throw new Error(
      `${dataset} : métadonnées indisponibles (HTTP ${r.kind === 'response' ? r.status : '?'})`,
    );
  const meta = JSON.parse(r.body.toString('utf8')) as {
    metas?: { default?: { modified?: string; records_count?: number; license?: string } };
  };
  const d = meta.metas?.default ?? {};
  if (!d.modified) throw new Error(`${dataset} : date de modification absente`);
  return {
    dataset,
    modified: d.modified,
    records: d.records_count ?? null,
    license: d.license ?? null,
  };
}

/** At most one download per dataset and per week: the open-data exception stays as light as possible. */
export const ESR_MIN_DOWNLOAD_INTERVAL_MS = 7 * 24 * 3600_000;

/**
 * Full CSV export of a dataset, written straight into the rawdata volume and recorded.
 * Downloaded only when the dataset modification date changed since the last file, and at most
 * once a week per dataset; otherwise the last file is reused for this run (no request).
 */
export async function esrExport(
  ctx: PipelineContext,
  dv: DatasetVersion,
  opts: { where?: string; pinned?: boolean; maxBytes?: number },
) {
  const dataset = dv.dataset;
  const params = new URLSearchParams({ delimiter: ';' });
  if (opts.where) params.set('where', opts.where);
  const url = `${ESR_API}/${dataset}/exports/csv?${params}`;
  const fileVersion = `${dataset}@${dv.modified}`;
  const last = await prisma.rawSnapshot.findFirst({
    where: { sourceId: ctx.sourceId, url },
    orderBy: { fetchedAt: 'desc' },
  });
  const recent = last && Date.now() - last.fetchedAt.getTime() < ESR_MIN_DOWNLOAD_INTERVAL_MS;
  if (last && (last.sourceVersion === fileVersion || recent)) {
    const snapshot = await prisma.rawSnapshot.create({
      data: {
        sourceId: last.sourceId,
        runId: ctx.runId,
        url,
        sha256: last.sha256,
        contentType: last.contentType,
        bytes: last.bytes,
        storagePath: last.storagePath,
        httpStatus: last.httpStatus,
        etag: last.etag,
        lastModified: last.lastModified,
        sourceVersion: last.sourceVersion,
        pinned: opts.pinned ?? last.pinned,
        fetchedAt: last.fetchedAt,
      },
    });
    await ctx.log(
      'INFO',
      last.sourceVersion === fileVersion
        ? `${dataset} : jeu non modifié depuis le ${dv.modified.slice(0, 10)}, fichier du ${last.fetchedAt.toISOString().slice(0, 10)} réutilisé (aucun téléchargement)`
        : `${dataset} : déjà téléchargé le ${last.fetchedAt.toISOString().slice(0, 10)} (moins d’une semaine), fichier réutilisé`,
    );
    return { snapshot, sameAsPrevious: true, reused: true };
  }
  const file = snapshotPath(ctx.sourceKey, `${dataset}.csv`);
  await ctx.log(
    'INFO',
    `téléchargement de ${dataset}${opts.where ? ` (filtre : ${opts.where})` : ''}`,
  );
  const r = await ctx.http.get(url, {
    accept: ['csv'],
    toFile: file,
    maxBytes: opts.maxBytes ?? 200 * MB,
    timeoutMs: 300_000,
  });
  if (r.kind === 'skip') throw new Error(`${dataset} : ${r.reason}`);
  if (r.kind !== 'response' || r.status !== 200 || !r.file)
    throw new Error(
      `${dataset} : export indisponible (HTTP ${r.kind === 'response' ? r.status : '?'})`,
    );
  const { snapshot, sameAsPrevious } = await saveSnapshot({
    sourceKey: ctx.sourceKey,
    runId: ctx.runId,
    url,
    fileName: `${dataset}.csv`,
    file: r.file,
    sha256: r.sha256,
    contentType: r.contentType,
    httpStatus: r.status,
    etag: r.etag,
    lastModified: r.lastModified,
    sourceVersion: fileVersion,
    pinned: opts.pinned,
  });
  await ctx.log(
    'OK',
    `${dataset} : ${(r.bytes / MB).toFixed(1)} Mo, empreinte ${r.sha256.slice(0, 12)}…${sameAsPrevious ? ' (identique au précédent)' : ''}`,
  );
  return { snapshot, sameAsPrevious, reused: false };
}

/** True when the latest snapshot of this URL before `snapshot` came from an applied run with the same SHA-256. */
export async function identicalToApplied(snapshot: RawSnapshot): Promise<boolean> {
  const prev = await prisma.rawSnapshot.findFirst({
    where: {
      sourceId: snapshot.sourceId,
      url: snapshot.url,
      id: { not: snapshot.id },
      run: { appliedAt: { not: null } },
    },
    orderBy: { fetchedAt: 'desc' },
  });
  return prev?.sha256 === snapshot.sha256;
}

/** Dataset of a snapshot ("…/fr-esr-mon_master.csv" → "fr-esr-mon_master"). */
export const datasetOf = (s: RawSnapshot) =>
  decodeURIComponent(s.url.split('/datasets/')[1]?.split('/')[0] ?? '');

/**
 * Reads a snapshot CSV, checking its columns against fixtures/schemas first: a missing required
 * column fails the run before any write (alert « Le format de la source a changé »); a new
 * column is logged (and returned, so a source can raise its own information alert).
 */
export async function* readChecked(
  ctx: PipelineContext,
  snapshot: RawSnapshot,
  schemaDataset: string,
  onNewColumns?: (cols: string[]) => Promise<void>,
): AsyncGenerator<Record<string, string>> {
  const expected = expectedColumns(ctx.sourceKey, schemaDataset);
  for await (const row of readCsv(snapshot.storagePath, {
    onHeader: async (header) => {
      const diff = compareColumns(expected, header);
      await recordChecks(ctx.runId, {
        'Schéma du fichier (colonnes obligatoires présentes)': {
          executed: 1,
          failed: diff.missingRequired.length ? 1 : 0,
        },
        'Colonnes nouvelles signalées': { executed: 1, failed: 0 },
      });
      if (diff.missingRequired.length) {
        await ctx.alert({
          key: `schema-changed:${ctx.sourceKey}:${schemaDataset}`,
          code: 'schema-changed',
          severity: 'ERROR',
          title: 'Le format de la source a changé',
          detail: `${schemaDataset} : colonnes attendues absentes (${diff.missingRequired.join(', ')}). Passage arrêté avant toute écriture.`,
          link: '/admin/recuperation',
          linkLabel: 'Voir le journal',
        });
        throw new Error(
          `Format de ${schemaDataset} changé : colonnes absentes ${diff.missingRequired.join(', ')}`,
        );
      }
      if (diff.added.length) {
        await ctx.log('WARN', `${schemaDataset} : nouvelles colonnes ${diff.added.join(', ')}`);
        await onNewColumns?.(diff.added);
      }
      if (diff.missingOptional.length)
        await ctx.log(
          'INFO',
          `${schemaDataset} : colonnes facultatives absentes (${diff.missingOptional.length})`,
        );
    },
  }))
    yield row;
}

/** Latest snapshot of a dataset for a source (used by sources that read another source's file). */
export async function latestSnapshot(sourceKey: string, dataset: string) {
  return prisma.rawSnapshot.findFirst({
    where: { source: { key: sourceKey }, url: { contains: `/datasets/${dataset}/` } },
    orderBy: { fetchedAt: 'desc' },
  });
}
