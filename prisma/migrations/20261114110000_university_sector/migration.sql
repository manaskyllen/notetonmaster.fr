-- CreateEnum
CREATE TYPE "UniversitySector" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "University" ADD COLUMN     "establishmentType" TEXT,
ADD COLUMN     "sector" "UniversitySector",
ADD COLUMN     "sectorSource" TEXT;

-- Pilot universities of the seed are public (Nantes, Paris-Saclay, URCA); the annuaire decides
-- for every other one at the next run of esr-etablissements / monmaster-opendata.
UPDATE "University" SET "sector" = 'PUBLIC', "sectorSource" = 'annuaire', "establishmentType" = 'Université'
 WHERE "uai" IN ('0442953W', '0912408Y', '0511296G');
CREATE INDEX "University_sector_idx" ON "University" ("sector");
