-- Performance (brief E): indexes found missing with EXPLAIN ANALYZE on the public lists, the
-- admin lists and the cursors; query statistics.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Region of a program, slugged once (facets, ?lieu=reg:…) instead of per row and per request.
DROP INDEX IF EXISTS "ProgramSearchIndex_region_idx";
ALTER TABLE "ProgramSearchIndex" ADD COLUMN "regionSlug" TEXT;
UPDATE "ProgramSearchIndex"
   SET "regionSlug" = nullif(regexp_replace(public.nm_norm(coalesce(region, '')), '[^a-z0-9]+', '-', 'g'), '');
CREATE INDEX "ProgramSearchIndex_regionSlug_idx" ON "ProgramSearchIndex"("regionSlug");

-- Reviews of a program: page of the published ones by date, by helpful votes, by rating.
CREATE INDEX "Review_programId_status_publishedAt_idx" ON "Review"("programId", status, "publishedAt" DESC);
CREATE INDEX "Review_studentId_submittedAt_idx" ON "Review"("studentId", "submittedAt" DESC);
-- Cursors (journal of the récupération, audit log).
CREATE INDEX "SyncLog_at_id_idx" ON "SyncLog"("at" DESC, id DESC);
CREATE INDEX "AuditLog_at_id_idx" ON "AuditLog"("at" DESC, id DESC);
-- Mon espace: followed masters, conversations, unread messages.
CREATE INDEX "Favorite_studentId_createdAt_idx" ON "Favorite"("studentId", "createdAt" DESC);
CREATE INDEX "Message_conversationId_fromRole_readAt_idx" ON "Message"("conversationId", "fromRole", "readAt");
-- Moderation queues and alerts.
CREATE INDEX "Report_targetType_status_targetId_createdAt_idx" ON "Report"("targetType", status, "targetId", "createdAt");
CREATE INDEX "DataAlert_resolvedAt_severity_createdAt_idx" ON "DataAlert"("resolvedAt", severity, "createdAt");
CREATE INDEX "FieldProvenance_entityId_idx" ON "FieldProvenance"("entityId");
