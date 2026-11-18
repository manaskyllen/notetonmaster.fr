-- « Vivre à … » (fiche parcours, part C): local amounts and the rent map.

-- CreateTable
CREATE TABLE "CityCost" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "transportMonthly" DOUBLE PRECISION,
    "transportLabel" TEXT,
    "transportSourceUrl" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentIndex" (
    "inseeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "eurPerM2" DOUBLE PRECISION NOT NULL,
    "lowerPerM2" DOUBLE PRECISION,
    "upperPerM2" DOUBLE PRECISION,
    "level" TEXT NOT NULL,
    "observations" INTEGER NOT NULL,
    "vintage" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentIndex_pkey" PRIMARY KEY ("inseeCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "CityCost_cityId_key" ON "CityCost"("cityId");

-- CreateIndex
CREATE INDEX "RentIndex_departmentCode_idx" ON "RentIndex"("departmentCode");

-- AddForeignKey
ALTER TABLE "CityCost" ADD CONSTRAINT "CityCost_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
