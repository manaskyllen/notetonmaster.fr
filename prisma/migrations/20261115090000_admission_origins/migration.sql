-- D'où viennent les admis: origins of applicants out of AdmissionStat.raw, into real columns.

-- CreateEnum
CREATE TYPE "AdmissionOriginKind" AS ENUM ('LICENCE', 'LICENCE_PRO', 'BUT', 'MASTER', 'OTHER', 'NOT_ENROLLED');

-- AlterTable
ALTER TABLE "AdmissionStat" ADD COLUMN     "acceptedAtMainPhaseStart" INTEGER,
ADD COLUMN     "acceptedSameAcademy" INTEGER,
ADD COLUMN     "acceptedSameInstitution" INTEGER;

-- CreateTable
CREATE TABLE "AdmissionOrigin" (
    "id" TEXT NOT NULL,
    "admissionStatId" TEXT NOT NULL,
    "origin" "AdmissionOriginKind" NOT NULL,
    "applications" INTEGER,
    "offers" INTEGER,
    "accepted" INTEGER,

    CONSTRAINT "AdmissionOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionOrigin_admissionStatId_origin_key" ON "AdmissionOrigin"("admissionStatId", "origin");

-- AddForeignKey
ALTER TABLE "AdmissionOrigin" ADD CONSTRAINT "AdmissionOrigin_admissionStatId_fkey" FOREIGN KEY ("admissionStatId") REFERENCES "AdmissionStat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
