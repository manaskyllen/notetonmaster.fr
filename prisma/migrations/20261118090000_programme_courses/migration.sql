-- Programme by year: courses and milestones of each semester (fiche parcours, part B).

-- CreateEnum
CREATE TYPE "CourseCategory" AS ENUM ('CORE', 'METHODS', 'LAW_ECONOMICS', 'DIGITAL', 'LANGUAGES', 'PROJECTS');

-- CreateEnum
CREATE TYPE "MilestoneKind" AS ENUM ('INTERNSHIP', 'THESIS', 'PROJECT', 'STUDY_TRIP', 'CERTIFICATION');

-- AlterTable
ALTER TABLE "Mention" ADD COLUMN "shortLabel" TEXT;

-- AlterTable
ALTER TABLE "ProgramSemester" ADD COLUMN "ects" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "number" INTEGER,
ADD COLUMN "year" INTEGER,
ALTER COLUMN "content" SET DEFAULT '';

-- CreateTable
CREATE TABLE "ProgramCourse" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ects" DOUBLE PRECISION,
    "hours" DOUBLE PRECISION,
    "category" "CourseCategory" NOT NULL DEFAULT 'CORE',
    "categoryLocked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,

    CONSTRAINT "ProgramCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramMilestone" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "minMonths" DOUBLE PRECISION,
    "maxMonths" DOUBLE PRECISION,
    "pages" INTEGER,
    "period" TEXT,
    "source" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramCourse_semesterId_order_idx" ON "ProgramCourse"("semesterId", "order");

-- CreateIndex
CREATE INDEX "ProgramMilestone_semesterId_idx" ON "ProgramMilestone"("semesterId");

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "ProgramSemester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMilestone" ADD CONSTRAINT "ProgramMilestone_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "ProgramSemester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The text of existing semesters is split into courses and milestones by
-- lib/catalog/program-courses.ts (convertLegacySemesters), run by prisma/bootstrap.ts and the seed:
-- the categories and the milestone patterns live in TypeScript, versioned and tested.
