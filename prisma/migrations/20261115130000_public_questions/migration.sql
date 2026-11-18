-- Questions publiques: questions, réponses (ancien·nes vérifié·es, équipe), votes, récapitulatif hebdomadaire.


-- CreateEnum
CREATE TYPE "PublicStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AnswerKind" AS ENUM ('ALUMNI', 'TEAM');


-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "notifyQuestionDigest" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "alias" TEXT NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "hadMaskedContent" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicStatus" NOT NULL DEFAULT 'PENDING',
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "responderId" TEXT,
    "kind" "AnswerKind" NOT NULL,
    "who" TEXT NOT NULL,
    "body" VARCHAR(1500) NOT NULL,
    "hadMaskedContent" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicStatus" NOT NULL DEFAULT 'PENDING',
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVote" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerVote" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionDigestItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_programId_status_voteCount_idx" ON "Question"("programId", "status", "voteCount" DESC);

-- CreateIndex
CREATE INDEX "Question_programId_status_publishedAt_idx" ON "Question"("programId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Question_status_createdAt_idx" ON "Question"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Answer_questionId_status_idx" ON "Answer"("questionId", "status");

-- CreateIndex
CREATE INDEX "Answer_status_createdAt_idx" ON "Answer"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVote_questionId_voterKey_key" ON "QuestionVote"("questionId", "voterKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerVote_answerId_voterKey_key" ON "AnswerVote"("answerId", "voterKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionDigestItem_studentId_questionId_key" ON "QuestionDigestItem"("studentId", "questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorStudentId_fkey" FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_authorStudentId_fkey" FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "StaffResponder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVote" ADD CONSTRAINT "QuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerVote" ADD CONSTRAINT "AnswerVote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDigestItem" ADD CONSTRAINT "QuestionDigestItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDigestItem" ADD CONSTRAINT "QuestionDigestItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

