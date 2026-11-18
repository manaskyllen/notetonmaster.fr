
-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN     "pausedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SyncRun_sourceId_startedAt_status_idx" ON "SyncRun"("sourceId", "startedAt" DESC, "status");
