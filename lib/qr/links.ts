import 'server-only';
import { prisma } from '@/lib/db';
import { isInternalPath, isValidSlug, parisDay } from '@/lib/domain/qr';

/** The target of an active link, or null (unknown, archived, or a target that is not internal). */
export async function activeTarget(slug: string): Promise<{ id: string; path: string } | null> {
  if (!isValidSlug(slug)) return null;
  const link = await prisma.qrLink.findUnique({
    where: { slug },
    select: { id: true, targetPath: true, archivedAt: true },
  });
  // The target is checked again here, not only when it was saved.
  if (!link || link.archivedAt || !isInternalPath(link.targetPath)) return null;
  return { id: link.id, path: link.targetPath };
}

/** One more scan for the link today (Europe/Paris): one row per link and per day, no more. */
export async function countScan(linkId: string, at = new Date()): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "qr_scans_daily" ("link_id", "day", "count")
    VALUES (${linkId}, ${parisDay(at)}::date, 1)
    ON CONFLICT ("link_id", "day") DO UPDATE SET "count" = "qr_scans_daily"."count" + 1`;
}

export interface QrLinkRow {
  id: string;
  slug: string;
  label: string;
  targetPath: string;
  createdAt: Date;
  archivedAt: Date | null;
  total: number;
  last7: number;
  last30: number;
}

/** Every link, active ones first, with its scans: in all, over 7 and over 30 days. */
export async function listQrLinks(): Promise<QrLinkRow[]> {
  const today = parisDay();
  const rows = await prisma.$queryRaw<QrLinkRow[]>`
    SELECT l.id, l.slug, l.label, l."target_path" AS "targetPath", l."created_at" AS "createdAt",
           l."archived_at" AS "archivedAt",
           COALESCE(sum(s.count), 0)::int AS total,
           COALESCE(sum(s.count) FILTER (WHERE s.day > ${today}::date - 7), 0)::int AS last7,
           COALESCE(sum(s.count) FILTER (WHERE s.day > ${today}::date - 30), 0)::int AS last30
      FROM "qr_links" l LEFT JOIN "qr_scans_daily" s ON s."link_id" = l.id
     GROUP BY l.id
     ORDER BY (l."archived_at" IS NOT NULL), l."created_at" DESC, l.id`;
  return rows;
}

/** A link and its scans per day over the last 90 days (days with at least one scan). */
export async function qrLinkDetail(id: string) {
  const link = await prisma.qrLink.findUnique({ where: { id } });
  if (!link) return null;
  const today = parisDay();
  const days = await prisma.$queryRaw<{ day: string; count: number }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, count
      FROM "qr_scans_daily"
     WHERE "link_id" = ${id} AND day > ${today}::date - 90
     ORDER BY day DESC`;
  return { link, days, total90: days.reduce((a, d) => a + d.count, 0) };
}
