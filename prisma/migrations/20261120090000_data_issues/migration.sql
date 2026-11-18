-- CreateEnum
CREATE TYPE "DataIssueKind" AS ENUM ('CONFLICT', 'COLLECT_ERROR', 'NO_PROGRAM', 'OLD_PROGRAM', 'NO_UAI');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('BLOCK', 'HIGH', 'LOW');

-- CreateEnum
CREATE TYPE "IssueTarget" AS ENUM ('PROGRAM', 'MENTION', 'UNIVERSITY', 'SOURCE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "total" INTEGER;

-- CreateTable
CREATE TABLE "DataIssue" (
    "id" TEXT NOT NULL,
    "kind" "DataIssueKind" NOT NULL,
    "targetType" "IssueTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "severity" "IssueSeverity" NOT NULL,
    "detail" TEXT,
    "universityId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ignoredUntil" TIMESTAMP(3),
    "ignoredById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "DataIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataIssue_kind_severity_resolvedAt_ignoredUntil_idx" ON "DataIssue"("kind", "severity", "resolvedAt", "ignoredUntil");

-- CreateIndex
CREATE INDEX "DataIssue_targetType_targetId_idx" ON "DataIssue"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DataIssue_universityId_idx" ON "DataIssue"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "DataIssue_kind_targetType_targetId_field_key" ON "DataIssue"("kind", "targetType", "targetId", "field");
