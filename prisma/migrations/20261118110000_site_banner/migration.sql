-- Information banner of the public site (part D).

-- CreateEnum
CREATE TYPE "BannerTone" AS ENUM ('INFO', 'IMPORTANT', 'ALERT');

-- CreateEnum
CREATE TYPE "BannerScope" AS ENUM ('ALL', 'HOME');

-- CreateTable
CREATE TABLE "SiteBanner" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkLabel" TEXT,
    "linkUrl" TEXT,
    "tone" "BannerTone" NOT NULL DEFAULT 'INFO',
    "scope" "BannerScope" NOT NULL DEFAULT 'ALL',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteBanner_pkey" PRIMARY KEY ("id")
);
