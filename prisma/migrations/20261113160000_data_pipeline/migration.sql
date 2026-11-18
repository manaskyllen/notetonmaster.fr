-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE', 'NOT_RENEWED', 'DRAFT');

-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('SYNC', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('PREVIEW', 'APPLY');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('VALUE', 'MERGE');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('LINKED', 'NEW', 'PROPOSED', 'IGNORED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatchDecisionKind" AS ENUM ('LINK', 'NEW', 'IGNORE', 'MERGE');

-- CreateEnum
CREATE TYPE "ExtractionKind" AS ENUM ('ODF_XML', 'AMETYS_ODF', 'GENERIC_HTML', 'PDF_BOOKLET');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('UNCONFIGURED', 'TESTING', 'ACTIVE', 'PAUSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IdentifierKind" ADD VALUE 'MM_MENTION';
ALTER TYPE "IdentifierKind" ADD VALUE 'MM_PARCOURS';
ALTER TYPE "IdentifierKind" ADD VALUE 'PAYSAGE';
ALTER TYPE "IdentifierKind" ADD VALUE 'ONISEP';
ALTER TYPE "IdentifierKind" ADD VALUE 'CFD';

-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE 'AWAITING_VALIDATION';

-- DropIndex
DROP INDEX "City_name_key";

-- AlterTable
ALTER TABLE "AdmissionStat" ADD COLUMN     "accepted" INTEGER,
ADD COLUMN     "applicationsPc" INTEGER,
ADD COLUMN     "applicationsPp" INTEGER,
ADD COLUMN     "lastRankPc" INTEGER,
ADD COLUMN     "lastRankPp" INTEGER,
ADD COLUMN     "offPlatformRecruits" INTEGER,
ADD COLUMN     "participatedPc" BOOLEAN,
ADD COLUMN     "participatedPp" BOOLEAN,
ADD COLUMN     "ranked" INTEGER,
ADD COLUMN     "raw" JSONB;

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "departmentCode" TEXT,
ADD COLUMN     "inseeCode" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DataAlert" ADD COLUMN     "code" TEXT,
ADD COLUMN     "count" INTEGER,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" "EntityType",
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "DataConflict" ADD COLUMN     "kind" "ConflictKind" NOT NULL DEFAULT 'VALUE',
ADD COLUMN     "recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "FieldProvenance" ADD COLUMN     "evidence" VARCHAR(300),
ADD COLUMN     "previousValue" JSONB,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "InsertionStat" ADD COLUMN     "delayMonths" INTEGER,
ADD COLUMN     "graduatesOut" INTEGER,
ADD COLUMN     "isCumulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "raw" JSONB;

-- AlterTable
ALTER TABLE "MonMasterEntry" ADD COLUMN     "firstSession" INTEGER,
ADD COLUMN     "inm" TEXT,
ADD COLUMN     "inmp" TEXT,
ADD COLUMN     "lastSession" INTEGER,
ADD COLUMN     "places" TEXT,
ADD COLUMN     "workStudy" BOOLEAN;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "accreditationId" TEXT,
ADD COLUMN     "admissionSourceUrl" TEXT,
ADD COLUMN     "advisedDegrees" TEXT[],
ADD COLUMN     "campusId" TEXT,
ADD COLUMN     "examModes" TEXT[],
ADD COLUMN     "expectations" TEXT[],
ADD COLUMN     "firstSeenSession" INTEGER,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "lastSeenSession" INTEGER,
ADD COLUMN     "origin" "RecordOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "selectionCriteria" TEXT[],
ADD COLUMN     "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "variantOfId" TEXT;

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "diff" JSONB,
ADD COLUMN     "mode" "SyncMode" NOT NULL DEFAULT 'APPLY',
ADD COLUMN     "resumeFromStep" TEXT,
ADD COLUMN     "sourceVersion" TEXT,
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validatedById" TEXT;

-- AlterTable
ALTER TABLE "University" ADD COLUMN     "address" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "origin" "RecordOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "paysageId" TEXT,
ADD COLUMN     "siteDomains" TEXT[];

-- CreateTable
CREATE TABLE "MentionAccreditation" (
    "id" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "inm" TEXT NOT NULL,
    "predecessorId" TEXT,
    "firstSeenSession" INTEGER,
    "lastSeenSession" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentionAccreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runId" TEXT,
    "url" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sha256" TEXT NOT NULL,
    "contentType" TEXT,
    "bytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "sourceVersion" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "normalized" JSONB,
    "matchStatus" "MatchStatus",
    "matchScore" DOUBLE PRECISION,
    "matchReason" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "plan" JSONB,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "StagingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "decision" "MatchDecisionKind" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "authorId" TEXT,
    "authorLabel" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionProfile" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "kind" "ExtractionKind" NOT NULL,
    "config" JSONB NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'UNCONFIGURED',
    "pausedReason" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programId" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "sha256" TEXT,
    "httpStatus" INTEGER,
    "robotsAllowed" BOOLEAN,
    "tdmReserved" BOOLEAN,
    "documentYear" TEXT,

    CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlHost" (
    "host" TEXT NOT NULL,
    "robotsTxt" TEXT,
    "robotsStatus" INTEGER,
    "robotsSha256" TEXT,
    "robotsFetchedAt" TIMESTAMP(3),
    "tdmrep" JSONB,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "pausedUntil" TIMESTAMP(3),
    "pausedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlHost_pkey" PRIMARY KEY ("host")
);

-- CreateIndex
CREATE UNIQUE INDEX "MentionAccreditation_predecessorId_key" ON "MentionAccreditation"("predecessorId");

-- CreateIndex
CREATE INDEX "MentionAccreditation_mentionId_idx" ON "MentionAccreditation"("mentionId");

-- CreateIndex
CREATE UNIQUE INDEX "MentionAccreditation_inm_universityId_key" ON "MentionAccreditation"("inm", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_universityId_cityId_key_key" ON "Campus"("universityId", "cityId", "key");

-- CreateIndex
CREATE INDEX "RawSnapshot_sourceId_fetchedAt_idx" ON "RawSnapshot"("sourceId", "fetchedAt");

-- CreateIndex
CREATE INDEX "RawSnapshot_runId_idx" ON "RawSnapshot"("runId");

-- CreateIndex
CREATE INDEX "StagingRecord_runId_matchStatus_idx" ON "StagingRecord"("runId", "matchStatus");

-- CreateIndex
CREATE INDEX "StagingRecord_sourceKey_recordKey_idx" ON "StagingRecord"("sourceKey", "recordKey");

-- CreateIndex
CREATE UNIQUE INDEX "StagingRecord_runId_recordKey_key" ON "StagingRecord"("runId", "recordKey");

-- CreateIndex
CREATE INDEX "MatchDecision_targetType_targetId_idx" ON "MatchDecision"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDecision_sourceKey_recordKey_key" ON "MatchDecision"("sourceKey", "recordKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionProfile_universityId_key" ON "ExtractionProfile"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlPage_url_key" ON "CrawlPage"("url");

-- CreateIndex
CREATE INDEX "CrawlPage_universityId_idx" ON "CrawlPage"("universityId");

-- CreateIndex
CREATE INDEX "CrawlPage_programId_idx" ON "CrawlPage"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "City_inseeCode_key" ON "City"("inseeCode");

-- CreateIndex
CREATE INDEX "City_name_idx" ON "City"("name");

-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");

-- CreateIndex
CREATE UNIQUE INDEX "University_uai_key" ON "University"("uai");

-- CreateIndex
CREATE UNIQUE INDEX "University_paysageId_key" ON "University"("paysageId");

-- AddForeignKey
ALTER TABLE "University" ADD CONSTRAINT "University_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionAccreditation" ADD CONSTRAINT "MentionAccreditation_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionAccreditation" ADD CONSTRAINT "MentionAccreditation_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionAccreditation" ADD CONSTRAINT "MentionAccreditation_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "MentionAccreditation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "MentionAccreditation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingRecord" ADD CONSTRAINT "StagingRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionProfile" ADD CONSTRAINT "ExtractionProfile_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

