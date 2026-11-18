-- Calendrier Mon Master (dates saisies dans l'admin) et rappels par mail.

-- CreateEnum
CREATE TYPE "MonMasterPhaseKey" AS ENUM ('OFFER', 'APPLY', 'REVIEW', 'ADMISSION', 'COMPLEMENTARY', 'WITHDRAWALS');


-- CreateTable
CREATE TABLE "MonMasterPhase" (
    "id" TEXT NOT NULL,
    "session" INTEGER NOT NULL,
    "key" "MonMasterPhaseKey" NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonMasterPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseReminder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "phaseKey" "MonMasterPhaseKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseReminderSent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhaseReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonMasterPhase_session_order_idx" ON "MonMasterPhase"("session", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MonMasterPhase_session_key_key" ON "MonMasterPhase"("session", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseReminder_studentId_phaseKey_key" ON "PhaseReminder"("studentId", "phaseKey");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseReminderSent_studentId_phaseId_deadline_daysBefore_key" ON "PhaseReminderSent"("studentId", "phaseId", "deadline", "daysBefore");

-- AddForeignKey
ALTER TABLE "PhaseReminder" ADD CONSTRAINT "PhaseReminder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseReminderSent" ADD CONSTRAINT "PhaseReminderSent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseReminderSent" ADD CONSTRAINT "PhaseReminderSent_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "MonMasterPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

