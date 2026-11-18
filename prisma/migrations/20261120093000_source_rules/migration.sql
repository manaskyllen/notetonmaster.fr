
-- CreateTable
CREATE TABLE "SourceRule" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceRule_universityId_field_key" ON "SourceRule"("universityId", "field");
