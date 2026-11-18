-- Ma liste de vœux: brouillon personnel des candidatures Mon Master.


-- CreateTable
CREATE TABLE "Wish" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "docs" JSONB NOT NULL DEFAULT '{}',
    "note" VARCHAR(500),
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wish_studentId_createdAt_idx" ON "Wish"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wish_studentId_programId_key" ON "Wish"("studentId", "programId");

-- AddForeignKey
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

