-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('ONSITE', 'WORK_STUDY', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "EntryLevel" AS ENUM ('M1', 'M2');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PROGRAM', 'MENTION', 'UNIVERSITY');

-- CreateEnum
CREATE TYPE "FieldState" AS ENUM ('OK', 'STALE', 'CONFLICT', 'MISSING', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('START', 'INFO', 'OK', 'WARN', 'SKIP', 'ERROR');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('UNIVERSITY_EMAIL', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('LOGIN', 'CONFIRM_REVIEW', 'REPLY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO');

-- CreateEnum
CREATE TYPE "ReviewLevel" AS ENUM ('M1', 'M2', 'GRADUATE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_CONFIRMATION', 'PENDING', 'PUBLISHED', 'NEEDS_EDIT', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "Criterion" AS ENUM ('CONTENT', 'SUPERVISION', 'INTERNSHIPS', 'ATMOSPHERE', 'OUTCOMES');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'BLOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('ASKER', 'AUTHOR');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('REVIEW', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UPHELD', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "LegalRequestType" AS ENUM ('NOTICE', 'REQUISITION');

-- CreateEnum
CREATE TYPE "LegalRequestStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('AUTH', 'MODERATION', 'DATA', 'SYNC', 'LEGAL', 'TEAM', 'SETTINGS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL,
    "uai" TEXT,
    "city" TEXT NOT NULL,
    "cities" TEXT[],
    "region" TEXT NOT NULL,
    "website" TEXT,
    "emailDomains" TEXT[],
    "keywords" TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'violet',
    "icon" TEXT NOT NULL DEFAULT 'mention',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domainId" TEXT,
    "rncpCode" TEXT,
    "rncpStatus" TEXT,
    "certificationId" TEXT,
    "levels" TEXT[],
    "description" TEXT,
    "keywords" TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" INTEGER,
    "status" "CertificationStatus" NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "lastDeliveryDate" TIMESTAMP(3),
    "replacesCode" TEXT,
    "certifiers" TEXT[],
    "skillBlocks" JSONB NOT NULL,
    "jobs" JSONB NOT NULL,
    "romeCodes" TEXT[],
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "componentId" TEXT,
    "city" TEXT NOT NULL,
    "campus" TEXT,
    "modality" "Modality" NOT NULL DEFAULT 'ONSITE',
    "durationYears" INTEGER NOT NULL DEFAULT 2,
    "ects" INTEGER,
    "entryLevel" "EntryLevel" NOT NULL DEFAULT 'M1',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "contactRole" TEXT,
    "summary" TEXT,
    "keywords" TEXT[],
    "applicationPlatform" TEXT,
    "applicationWindow" TEXT,
    "admissionCriteria" TEXT,
    "selectionProcess" TEXT,
    "m2Entry" TEXT,
    "recommendedDegrees" TEXT,
    "requirements" TEXT,
    "tuitionFees" TEXT,
    "internships" TEXT,
    "highlights" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonMasterEntry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "programId" TEXT NOT NULL,

    CONSTRAINT "MonMasterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionStat" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "monMasterEntryId" TEXT,
    "session" INTEGER NOT NULL,
    "capacity" INTEGER,
    "seatsTaken" INTEGER,
    "applications" INTEGER,
    "offers" INTEGER,
    "lastRankCalled" INTEGER,
    "accessRate" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsertionStat" (
    "id" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "cohortYear" INTEGER NOT NULL,
    "employmentRate12m" DOUBLE PRECISION,
    "employmentRate18m" DOUBLE PRECISION,
    "stableJobRate" DOUBLE PRECISION,
    "furtherStudyRate" DOUBLE PRECISION,
    "graduatesCount" INTEGER,
    "salaryQ1" INTEGER,
    "salaryMedian" INTEGER,
    "salaryQ3" INTEGER,
    "salaryCohortYear" INTEGER,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "InsertionStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSemester" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "sourceYear" TEXT,

    CONSTRAINT "ProgramSemester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldProvenance" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" JSONB,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "state" "FieldState" NOT NULL DEFAULT 'OK',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "schedule" TEXT,
    "scheduleLabel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "note" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "step" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,
    "triggeredById" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataConflict" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "options" JSONB NOT NULL,
    "resolvedOption" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataAlert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "link" TEXT,
    "linkLabel" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "acceptsQuestions" BOOLEAN NOT NULL DEFAULT false,
    "notifyReviewStatus" BOOLEAN NOT NULL DEFAULT true,
    "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "verificationMethod" "VerificationMethod",
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactivityWarnedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "universityId" TEXT,
    "universityEmailHash" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "documentPath" TEXT,
    "documentName" TEXT,
    "documentType" TEXT,
    "documentMime" TEXT,
    "declaredProgramId" TEXT,
    "declaredLevel" "ReviewLevel",
    "declaredCohort" INTEGER,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "studentId" TEXT,
    "authorEmailHash" TEXT NOT NULL,
    "contactEmailEnc" TEXT,
    "level" "ReviewLevel" NOT NULL,
    "cohortYear" INTEGER NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "title" TEXT,
    "pros" TEXT NOT NULL,
    "cons" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "acceptsQuestions" BOOLEAN NOT NULL DEFAULT false,
    "wantsBadge" BOOLEAN NOT NULL DEFAULT false,
    "nameFlagged" BOOLEAN NOT NULL DEFAULT false,
    "moderationReason" TEXT,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCriterionScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterion" "Criterion" NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "ReviewCriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpfulVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpfulVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "askerEmailEnc" TEXT NOT NULL,
    "askerEmailHash" TEXT NOT NULL,
    "askerStudentId" TEXT,
    "alias" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromRole" "MessageRole" NOT NULL,
    "body" TEXT NOT NULL,
    "hadMaskedContent" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reporterEmailEnc" TEXT,
    "reporterKey" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalRequest" (
    "id" TEXT NOT NULL,
    "type" "LegalRequestType" NOT NULL,
    "reference" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterQuality" TEXT NOT NULL,
    "requesterEmailEnc" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "grounds" TEXT NOT NULL,
    "lawReference" TEXT,
    "goodFaith" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "internalDeadline" TIMESTAMP(3) NOT NULL,
    "status" "LegalRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedToId" TEXT,
    "decision" TEXT,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LegalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emailEnc" TEXT NOT NULL,
    "link" TEXT,
    "body" TEXT NOT NULL,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "role" "AdminRole" NOT NULL,
    "invitedAt" TIMESTAMP(3),
    "inviteTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "actionType" "AuditAction" NOT NULL,
    "objectLabel" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConnectionLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectRef" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ActivitySnapshot" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "submitted" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ActivitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "University_slug_key" ON "University"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Component_universityId_name_key" ON "Component"("universityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_slug_key" ON "Domain"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_slug_key" ON "Mention"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Certification_code_key" ON "Certification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE INDEX "Program_mentionId_idx" ON "Program"("mentionId");

-- CreateIndex
CREATE INDEX "Program_universityId_idx" ON "Program"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "MonMasterEntry_code_key" ON "MonMasterEntry"("code");

-- CreateIndex
CREATE INDEX "AdmissionStat_programId_session_idx" ON "AdmissionStat"("programId", "session");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionStat_programId_monMasterEntryId_session_source_key" ON "AdmissionStat"("programId", "monMasterEntryId", "session", "source");

-- CreateIndex
CREATE UNIQUE INDEX "InsertionStat_mentionId_universityId_cohortYear_key" ON "InsertionStat"("mentionId", "universityId", "cohortYear");

-- CreateIndex
CREATE INDEX "ProgramSemester_programId_position_idx" ON "ProgramSemester"("programId", "position");

-- CreateIndex
CREATE INDEX "FieldProvenance_entityType_entityId_idx" ON "FieldProvenance"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldProvenance_entityType_entityId_field_key" ON "FieldProvenance"("entityType", "entityId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE INDEX "SyncRun_status_queuedAt_idx" ON "SyncRun"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "SyncRun_sourceId_queuedAt_idx" ON "SyncRun"("sourceId", "queuedAt");

-- CreateIndex
CREATE INDEX "SyncLog_runId_at_idx" ON "SyncLog"("runId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "DataConflict_key_key" ON "DataConflict"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DataAlert_key_key" ON "DataAlert"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Student_emailHash_key" ON "Student"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_emailHash_purpose_idx" ON "MagicLinkToken"("emailHash", "purpose");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Verification_status_method_idx" ON "Verification"("status", "method");

-- CreateIndex
CREATE UNIQUE INDEX "Review_ref_key" ON "Review"("ref");

-- CreateIndex
CREATE INDEX "Review_programId_status_idx" ON "Review"("programId", "status");

-- CreateIndex
CREATE INDEX "Review_status_submittedAt_idx" ON "Review"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_programId_authorEmailHash_key" ON "Review"("programId", "authorEmailHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCriterionScore_reviewId_criterion_key" ON "ReviewCriterionScore"("reviewId", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "HelpfulVote_reviewId_voterKey_key" ON "HelpfulVote"("reviewId", "voterKey");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_studentId_programId_key" ON "Favorite"("studentId", "programId");

-- CreateIndex
CREATE INDEX "Conversation_reviewId_idx" ON "Conversation"("reviewId");

-- CreateIndex
CREATE INDEX "Conversation_askerEmailHash_createdAt_idx" ON "Conversation"("askerEmailHash", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reference_key" ON "Report"("reference");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRequest_reference_key" ON "LegalRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_inviteTokenHash_key" ON "AdminUser"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_at_idx" ON "AuditLog"("actionType", "at");

-- CreateIndex
CREATE INDEX "ConnectionLog_at_idx" ON "ConnectionLog"("at");

-- CreateIndex
CREATE INDEX "ConnectionLog_subjectRef_idx" ON "ConnectionLog"("subjectRef");

-- CreateIndex
CREATE INDEX "RateLimitHit_bucket_at_idx" ON "RateLimitHit"("bucket", "at");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySnapshot_weekStart_key" ON "ActivitySnapshot"("weekStart");

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonMasterEntry" ADD CONSTRAINT "MonMasterEntry_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionStat" ADD CONSTRAINT "AdmissionStat_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionStat" ADD CONSTRAINT "AdmissionStat_monMasterEntryId_fkey" FOREIGN KEY ("monMasterEntryId") REFERENCES "MonMasterEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsertionStat" ADD CONSTRAINT "InsertionStat_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsertionStat" ADD CONSTRAINT "InsertionStat_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSemester" ADD CONSTRAINT "ProgramSemester_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldProvenance" ADD CONSTRAINT "FieldProvenance_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataConflict" ADD CONSTRAINT "DataConflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataAlert" ADD CONSTRAINT "DataAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_declaredProgramId_fkey" FOREIGN KEY ("declaredProgramId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCriterionScore" ADD CONSTRAINT "ReviewCriterionScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulVote" ADD CONSTRAINT "HelpfulVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_askerStudentId_fkey" FOREIGN KEY ("askerStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequest" ADD CONSTRAINT "LegalRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequest" ADD CONSTRAINT "LegalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog is append-only: reject UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
