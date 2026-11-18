-- CreateTable
CREATE TABLE "ProgramSearchIndex" (
    "programId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentTitle" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "shortName" TEXT,
    "status" "ProgramStatus" NOT NULL,
    "universityId" TEXT NOT NULL,
    "universitySlug" TEXT NOT NULL,
    "universityKey" TEXT NOT NULL,
    "universityName" TEXT NOT NULL,
    "universityShort" TEXT NOT NULL,
    "universityParentId" TEXT,
    "kind" TEXT NOT NULL,
    "isPublicSector" BOOLEAN NOT NULL,
    "mentionId" TEXT NOT NULL,
    "mentionSlug" TEXT NOT NULL,
    "mentionName" TEXT NOT NULL,
    "domainSlug" TEXT,
    "discipline" TEXT,
    "disciplineSlug" TEXT,
    "componentName" TEXT,
    "campusName" TEXT,
    "cityKey" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "cityInsee" TEXT,
    "departmentCode" TEXT,
    "departmentName" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isAbroad" BOOLEAN NOT NULL DEFAULT false,
    "modalities" TEXT[],
    "entryLevel" "EntryLevel" NOT NULL,
    "places" INTEGER,
    "applications" INTEGER,
    "offers" INTEGER,
    "accessRate" DOUBLE PRECISION,
    "accessBand" TEXT NOT NULL,
    "lastSession" INTEGER,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "tsv" tsvector,
    "titleNorm" TEXT NOT NULL,
    "textNorm" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramSearchIndex_pkey" PRIMARY KEY ("programId")
);

-- CreateTable
CREATE TABLE "ProgramSlugRedirect" (
    "slug" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramSlugRedirect_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_isPublicSector_kind_idx" ON "ProgramSearchIndex"("isPublicSector", "kind");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_universityId_idx" ON "ProgramSearchIndex"("universityId");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_mentionId_idx" ON "ProgramSearchIndex"("mentionId");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_domainSlug_disciplineSlug_idx" ON "ProgramSearchIndex"("domainSlug", "disciplineSlug");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_cityInsee_idx" ON "ProgramSearchIndex"("cityInsee");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_departmentCode_idx" ON "ProgramSearchIndex"("departmentCode");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_region_idx" ON "ProgramSearchIndex"("region");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_lat_lng_idx" ON "ProgramSearchIndex"("lat", "lng");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_places_idx" ON "ProgramSearchIndex"("places");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_applications_idx" ON "ProgramSearchIndex"("applications");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_accessRate_idx" ON "ProgramSearchIndex"("accessRate");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_avgRating_idx" ON "ProgramSearchIndex"("avgRating");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_reviewCount_idx" ON "ProgramSearchIndex"("reviewCount");

-- CreateIndex
CREATE INDEX "ProgramSearchIndex_title_idx" ON "ProgramSearchIndex"("title");

-- CreateIndex
CREATE INDEX "ProgramSlugRedirect_programId_idx" ON "ProgramSlugRedirect"("programId");

-- AddForeignKey
ALTER TABLE "ProgramSearchIndex" ADD CONSTRAINT "ProgramSearchIndex_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full text, typos and multi-valued filters (not expressible in the Prisma schema).
CREATE INDEX "ProgramSearchIndex_tsv_idx" ON "ProgramSearchIndex" USING GIN ("tsv");
CREATE INDEX "ProgramSearchIndex_titleNorm_trgm_idx" ON "ProgramSearchIndex" USING GIN ("titleNorm" public.gin_trgm_ops);
CREATE INDEX "ProgramSearchIndex_textNorm_trgm_idx" ON "ProgramSearchIndex" USING GIN ("textNorm" public.gin_trgm_ops);
CREATE INDEX "ProgramSearchIndex_modalities_idx" ON "ProgramSearchIndex" USING GIN ("modalities");
