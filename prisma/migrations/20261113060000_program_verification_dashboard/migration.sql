-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'CHANGE_EMAIL';

-- DropForeignKey
ALTER TABLE "Verification" DROP CONSTRAINT "Verification_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "Verification" DROP CONSTRAINT "Verification_declaredProgramId_fkey";

-- DropForeignKey
ALTER TABLE "Verification" DROP CONSTRAINT "Verification_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Verification" DROP CONSTRAINT "Verification_universityId_fkey";

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Student" RENAME COLUMN "notifyFavorites" TO "notifySavedDigest";
ALTER TABLE "Student" DROP COLUMN "verificationMethod",
DROP COLUMN "verifiedAt",
ADD COLUMN     "level" "ReviewLevel",
ADD COLUMN     "notifyNewMessage" BOOLEAN NOT NULL DEFAULT true;

-- Level of the identity card: the level of the student's latest review.
UPDATE "Student" s SET "level" = r."level"
  FROM (SELECT DISTINCT ON ("studentId") "studentId", "level" FROM "Review"
         WHERE "studentId" IS NOT NULL ORDER BY "studentId", "submittedAt" DESC) r
 WHERE r."studentId" = s.id;

-- CreateTable
CREATE TABLE "ProgramVerification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "universityEmailHash" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "documentPath" TEXT,
    "documentName" TEXT,
    "documentType" TEXT,
    "documentMime" TEXT,
    "declaredLevel" "ReviewLevel",
    "declaredCohort" INTEGER,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewView" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "viewerKey" TEXT NOT NULL,

    CONSTRAINT "ReviewView_pkey" PRIMARY KEY ("id")
);


-- Data: verifications become per program (brief 8.3).
-- 1. A verification that named its program keeps it (documents keep their id as documentId).
INSERT INTO "ProgramVerification" ("id", "studentId", "programId", "method", "status",
  "universityEmailHash", "codeHash", "codeExpiresAt", "codeAttempts", "documentId",
  "documentPath", "documentName", "documentType", "documentMime", "declaredLevel",
  "declaredCohort", "decidedById", "decidedAt", "reason", "createdAt", "updatedAt")
SELECT v."id", v."studentId", v."declaredProgramId", v."method", v."status",
  v."universityEmailHash", v."codeHash", v."codeExpiresAt", v."codeAttempts",
  CASE WHEN v."method" = 'DOCUMENT' THEN v."id" END,
  v."documentPath", v."documentName", v."documentType", v."documentMime", v."declaredLevel",
  v."declaredCohort", v."decidedById", v."decidedAt", v."reason", v."createdAt", v."updatedAt"
  FROM "Verification" v
 WHERE v."declaredProgramId" IS NOT NULL;

-- 2. A university email without a program: one verification per program of that university
--    the student reviewed (what the old rule gave the badge to).
INSERT INTO "ProgramVerification" ("id", "studentId", "programId", "method", "status",
  "universityEmailHash", "codeAttempts", "decidedById", "decidedAt", "reason", "createdAt",
  "updatedAt")
SELECT v."id" || '-' || p."id", v."studentId", p."id", v."method", v."status",
  v."universityEmailHash", v."codeAttempts", v."decidedById", v."decidedAt", v."reason",
  v."createdAt", v."updatedAt"
  FROM "Verification" v
  JOIN (SELECT DISTINCT "studentId", "programId" FROM "Review" WHERE "studentId" IS NOT NULL) r
    ON r."studentId" = v."studentId"
  JOIN "Program" p ON p."id" = r."programId" AND p."universityId" = v."universityId"
 WHERE v."declaredProgramId" IS NULL AND v."method" = 'UNIVERSITY_EMAIL';

-- DropTable
DROP TABLE "Verification";

-- CreateIndex
CREATE INDEX "ProgramVerification_status_method_idx" ON "ProgramVerification"("status", "method");

-- CreateIndex
CREATE INDEX "ProgramVerification_studentId_programId_idx" ON "ProgramVerification"("studentId", "programId");

-- CreateIndex
CREATE INDEX "ProgramVerification_documentId_idx" ON "ProgramVerification"("documentId");

-- CreateIndex
CREATE INDEX "ReviewView_reviewId_day_idx" ON "ReviewView"("reviewId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewView_reviewId_day_viewerKey_key" ON "ReviewView"("reviewId", "day", "viewerKey");

-- AddForeignKey
ALTER TABLE "ProgramVerification" ADD CONSTRAINT "ProgramVerification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVerification" ADD CONSTRAINT "ProgramVerification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVerification" ADD CONSTRAINT "ProgramVerification_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewView" ADD CONSTRAINT "ReviewView_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

