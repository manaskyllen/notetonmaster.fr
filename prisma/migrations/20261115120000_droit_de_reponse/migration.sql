-- Droit de réponse des équipes pédagogiques: domaines officiels, répondant·es vérifié·es, réponses modérées.

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');


-- AlterTable
ALTER TABLE "University" ADD COLUMN     "mailDomains" TEXT[];

-- CreateTable
CREATE TABLE "StaffResponder" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffResponder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "body" VARCHAR(1500) NOT NULL,
    "hadMaskedContent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffResponder_emailHash_key" ON "StaffResponder"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResponse_reviewId_key" ON "ReviewResponse"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewResponse_status_updatedAt_idx" ON "ReviewResponse"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ReviewResponse_responderId_idx" ON "ReviewResponse"("responderId");

-- AddForeignKey
ALTER TABLE "StaffResponder" ADD CONSTRAINT "StaffResponder_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "StaffResponder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Official staff domains: the host of the official website (annuaire), plus the known university
-- domains that are not student ones (etu., etud., etudiant.). Completed in the admin.
UPDATE "University" u SET "mailDomains" = ARRAY(
  SELECT DISTINCT d FROM (
    SELECT lower(substring(u.website from '^(?:https?://)?(?:www\.)?([^/:?#]+)')) AS d
    UNION ALL
    SELECT lower(x) FROM unnest(u."emailDomains") AS x
  ) t
  WHERE d IS NOT NULL AND d <> '' AND d !~ '^(etu|etud|etudiant|etudiants|student|students)\.'
  ORDER BY d
);
