-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('EMPLOYED', 'JOB_SEEKING', 'FURTHER_STUDY', 'OTHER');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "employmentStatus" "EmploymentStatus",
ADD COLUMN     "jobTitle" VARCHAR(80);
