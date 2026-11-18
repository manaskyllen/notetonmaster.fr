-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('ADMIN', 'STUDENT', 'STAFF');


-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "lockCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "AdminRecoveryCode" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminDevice" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reauthAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminRecoveryCode_adminId_idx" ON "AdminRecoveryCode"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminDevice_adminId_deviceHash_key" ON "AdminDevice"("adminId", "deviceHash");

-- CreateIndex
CREATE INDEX "AuthSession_kind_subjectId_idx" ON "AuthSession"("kind", "subjectId");

-- CreateIndex
CREATE INDEX "AuthSession_lastSeenAt_idx" ON "AuthSession"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "AdminRecoveryCode" ADD CONSTRAINT "AdminRecoveryCode_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminDevice" ADD CONSTRAINT "AdminDevice_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
