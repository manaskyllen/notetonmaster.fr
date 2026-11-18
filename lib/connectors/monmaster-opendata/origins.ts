/**
 * « D'où viennent les admis » (feature 1): the origins of the applicants and the three accepted
 * counts of each AdmissionStat row, written in batches. Shared by the publication (phase 8) and
 * the replay from the snapshots already downloaded (scripts/replay-admission-origins.ts).
 */
import { prisma } from '@/lib/db';
import { chunks } from '@/lib/data/merge';
import type { MMOrigin, MMStats } from './normalize';
import { ORIGIN_SOURCE_COLUMNS } from './normalize';
import { MM_STAT_SOURCE } from './shared';

export interface AdmissionDetailRow {
  /** MonMasterEntry.id */
  entryId: string;
  session: number;
  acceptedSameInstitution: number | null;
  acceptedSameAcademy: number | null;
  acceptedAtMainPhaseStart: number | null;
  origins: MMOrigin[];
}

export const detailRow = (entryId: string, session: number, s: MMStats): AdmissionDetailRow => ({
  entryId,
  session,
  acceptedSameInstitution: s.acceptedSameInstitution,
  acceptedSameAcademy: s.acceptedSameAcademy,
  acceptedAtMainPhaseStart: s.acceptedAtMainPhaseStart,
  origins: s.origins,
});

const ORIGIN_COLS = new Set(ORIGIN_SOURCE_COLUMNS);

/** The payload kept in AdmissionStat.raw: without the origin columns, now in real fields. */
export function rawWithoutOrigins(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !ORIGIN_COLS.has(k)));
}

/**
 * Writes the three counts and the origins of existing AdmissionStat rows (matched by number and
 * session). Two statements per batch of 1 000, idempotent. Returns the rows updated.
 */
export async function writeAdmissionDetails(rows: AdmissionDetailRow[]): Promise<number> {
  let updated = 0;
  for (const part of chunks(rows)) {
    const json = JSON.stringify(part);
    // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "AdmissionStat" AS s SET
         "acceptedSameInstitution" = v."acceptedSameInstitution",
         "acceptedSameAcademy" = v."acceptedSameAcademy",
         "acceptedAtMainPhaseStart" = v."acceptedAtMainPhaseStart",
         "updatedAt" = now()
       FROM jsonb_to_recordset($1::jsonb) AS v("entryId" text, session int, "acceptedSameInstitution" int,
         "acceptedSameAcademy" int, "acceptedAtMainPhaseStart" int)
       WHERE s."monMasterEntryId" = v."entryId" AND s.session = v.session AND s.source = $2`,
      json,
      MM_STAT_SOURCE,
    );
    // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdmissionOrigin" ("id", "admissionStatId", "origin", "applications", "offers", "accepted")
       SELECT gen_random_uuid()::text, s.id, o.origin::"AdmissionOriginKind", o.applications, o.offers, o.accepted
         FROM jsonb_to_recordset($1::jsonb) AS v("entryId" text, session int, origins jsonb)
         JOIN "AdmissionStat" AS s ON s."monMasterEntryId" = v."entryId" AND s.session = v.session AND s.source = $2
         CROSS JOIN LATERAL jsonb_to_recordset(v.origins) AS o(origin text, applications int, offers int, accepted int)
       ON CONFLICT ("admissionStatId", "origin") DO UPDATE SET
         "applications" = EXCLUDED."applications", "offers" = EXCLUDED."offers", "accepted" = EXCLUDED."accepted"`,
      json,
      MM_STAT_SOURCE,
    );
  }
  return updated;
}
