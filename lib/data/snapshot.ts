/**
 * Raw snapshots: every downloaded file is kept, dated, in the private `rawdata` volume
 * (/data/raw/<source>/<YYYY-MM-DD>/…), with its SHA-256 (table RawSnapshot). Never served.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { prisma } from '@/lib/db';

export const rawDir = () => process.env.RAW_DATA_DIR ?? '/data/raw';

export function snapshotPath(sourceKey: string, fileName: string, at = new Date()) {
  const day = at.toISOString().slice(0, 10);
  const safe =
    basename(fileName)
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 120) || 'fichier';
  return join(rawDir(), sourceKey, day, safe);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export interface SnapshotInput {
  sourceKey: string;
  runId: string | null;
  url: string;
  fileName: string;
  /** Either the body in memory or a file already written (it is moved into the volume). */
  body?: Buffer;
  file?: string;
  sha256?: string;
  contentType?: string | null;
  httpStatus?: number;
  etag?: string | null;
  lastModified?: string | null;
  sourceVersion?: string | null;
  pinned?: boolean;
}

/**
 * Stores a snapshot and tells whether it is identical to the previous snapshot of the same URL
 * (same SHA-256): the run then stops with « rien de nouveau ».
 */
export async function saveSnapshot(input: SnapshotInput) {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: input.sourceKey } });
  const path = snapshotPath(input.sourceKey, input.fileName);
  await mkdir(join(path, '..'), { recursive: true });
  if (input.body) await writeFile(path, input.body);
  else if (input.file && input.file !== path) await rename(input.file, path);
  else if (!input.file) throw new Error('saveSnapshot: ni contenu ni fichier');
  const sha = input.sha256 || (await sha256File(path));
  const bytes = (await stat(path)).size;
  const previous = await prisma.rawSnapshot.findFirst({
    where: { sourceId: source.id, url: input.url },
    orderBy: { fetchedAt: 'desc' },
  });
  const snapshot = await prisma.rawSnapshot.create({
    data: {
      sourceId: source.id,
      runId: input.runId,
      url: input.url,
      sha256: sha,
      contentType: input.contentType ?? null,
      bytes,
      storagePath: path,
      httpStatus: input.httpStatus ?? 200,
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      sourceVersion: input.sourceVersion ?? null,
      pinned: input.pinned ?? false,
    },
  });
  return { snapshot, sameAsPrevious: previous?.sha256 === sha, previous };
}

/**
 * Retention: keeps the `keep` latest snapshots of each URL of a source, plus pinned ones
 * (one per Mon Master session). Older files are deleted from the volume.
 */
export async function purgeSnapshots(sourceKey: string, keep = 6) {
  const source = await prisma.dataSource.findUnique({ where: { key: sourceKey } });
  if (!source) return 0;
  const all = await prisma.rawSnapshot.findMany({
    where: { sourceId: source.id },
    orderBy: { fetchedAt: 'desc' },
  });
  const seen = new Map<string, number>();
  const drop: typeof all = [];
  for (const s of all) {
    const n = (seen.get(s.url) ?? 0) + 1;
    seen.set(s.url, n);
    if (n > keep && !s.pinned) drop.push(s);
  }
  const stillUsed = new Set(all.filter((s) => !drop.includes(s)).map((s) => s.storagePath));
  for (const s of drop) if (!stillUsed.has(s.storagePath)) await rm(s.storagePath, { force: true });
  await prisma.rawSnapshot.deleteMany({ where: { id: { in: drop.map((s) => s.id) } } });
  return drop.length;
}
