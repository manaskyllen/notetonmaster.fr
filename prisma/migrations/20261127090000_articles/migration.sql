-- Guides (articles éditoriaux par ville): articles, former slugs, cached figures; audit category ARTICLES.
-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'TO_REVIEW');

-- CreateEnum
CREATE TYPE "ArticleTheme" AS ENUM ('GUIDE', 'SELECTIVITE', 'ALTERNANCE', 'EUROPE', 'METHODE', 'CALENDRIER');

-- AlterEnum
ALTER TYPE "AuditCategory" ADD VALUE 'ARTICLES';

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "city" VARCHAR(80),
    "theme" "ArticleTheme" NOT NULL DEFAULT 'GUIDE',
    "lede" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "metaDescription" VARCHAR(300) NOT NULL DEFAULT '',
    "keyword" VARCHAR(120) NOT NULL DEFAULT '',
    "secondaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "signature" VARCHAR(120),
    "reviewedAt" TIMESTAMP(3),
    "reviewedValues" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSlugRedirect" (
    "slug" VARCHAR(120) NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSlugRedirect_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "ArticleFigures" (
    "scope" VARCHAR(100) NOT NULL,
    "session" INTEGER,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleFigures_pkey" PRIMARY KEY ("scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_online_publishedAt_idx" ON "Article"("online", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_city_idx" ON "Article"("city");

-- CreateIndex
CREATE INDEX "ArticleSlugRedirect_articleId_idx" ON "ArticleSlugRedirect"("articleId");

