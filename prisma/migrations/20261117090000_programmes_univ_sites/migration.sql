-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExtractionKind" ADD VALUE 'AMETYS_ODF_HTML';
ALTER TYPE "ExtractionKind" ADD VALUE 'KSUP';
ALTER TYPE "ExtractionKind" ADD VALUE 'DRUPAL';

-- AlterEnum
ALTER TYPE "ProfileStatus" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "CrawlPage" ADD COLUMN     "level" TEXT,
ADD COLUMN     "mentionId" TEXT,
ADD COLUMN     "rubricCount" INTEGER,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Mention" ADD COLUMN     "skills" TEXT;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "careerProspects" TEXT,
ADD COLUMN     "furtherStudies" TEXT,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "skills" TEXT;
