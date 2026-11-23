-- Cursus of one parcours (issue #21): a parcours (Program) has one or several cursus (its Mon
-- Master numbers of the latest session, MonMasterEntry). This migration only changes the schema;
-- the grouping itself is `pnpm cursus:migrate` (journaled, undone by `pnpm cursus:migrate --down`).
-- Reverse: prisma/migrations/20261126090000_cursus/down.sql.

-- A cursus fiche merged into a parcours: kept (for the way back), never listed.
ALTER TYPE "ProgramStatus" ADD VALUE IF NOT EXISTS 'MERGED';

ALTER TABLE "Program" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "Program" ADD CONSTRAINT "Program_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MonMasterEntry" ADD COLUMN "cursusLabel" TEXT,
ADD COLUMN "homeProgramId" TEXT;

ALTER TABLE "ProgramSearchIndex" ADD COLUMN "subtitle" TEXT,
ADD COLUMN "cursusCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "cursusLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "cursusKind" TEXT NOT NULL DEFAULT 'single';

CREATE TABLE "CursusOverride" (
    "code" TEXT NOT NULL,
    "split" BOOLEAN NOT NULL DEFAULT false,
    "attachToId" TEXT,
    "label" TEXT,
    "leadsTo" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CursusOverride_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "CursusJournal" (
    "id" BIGSERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "programId" TEXT,
    "op" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "rowKey" JSONB NOT NULL,
    "column" TEXT,
    "oldValue" JSONB,
    "row" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CursusJournal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CursusJournal_runId_idx" ON "CursusJournal"("runId");
CREATE INDEX "CursusJournal_programId_idx" ON "CursusJournal"("programId");

-- « Même parcours, autre modalité » (Program.variantOfId) is replaced by the cursus: the work-study
-- and on-site fiches of one parcours become two cursus of it (rule « rythme »). The links are kept
-- in the journal (run « schema »), down.sql puts them back.
INSERT INTO "CursusJournal" ("runId", "op", "tableName", "rowKey", "column", "oldValue")
SELECT 'schema', 'update', 'Program', jsonb_build_object('id', id), 'variantOfId', to_jsonb("variantOfId")
  FROM "Program" WHERE "variantOfId" IS NOT NULL;
-- The search view reads p.* (it depends on the column): dropped and created again, unchanged
-- (definition of 20261119142000_search_document_open_zones).
DROP MATERIALIZED VIEW IF EXISTS search_document;
ALTER TABLE "Program" DROP CONSTRAINT IF EXISTS "Program_variantOfId_fkey";
ALTER TABLE "Program" DROP COLUMN "variantOfId";

CREATE MATERIALIZED VIEW search_document AS
WITH pc AS (
  SELECT p.*, ci.id AS city_id, ci.slug AS city_slug, ci.name AS city_name, ci.department AS city_department, ci.region AS city_region
    FROM "Program" p
    LEFT JOIN "Campus" ca ON ca.id = p."campusId"
    LEFT JOIN LATERAL (
      SELECT c2.* FROM "City" c2
       WHERE c2.id = ca."cityId" OR (ca."cityId" IS NULL AND c2.name = p.city)
       ORDER BY (c2.id = ca."cityId") DESC NULLS LAST, c2.slug
       LIMIT 1
    ) ci ON true
   WHERE p."isPublished" AND p."inOpenZone"
),
docs AS (
  SELECT 'program'::text AS entity_type, p.id AS entity_id, p.title,
         concat_ws(' ', p."shortName", u.name, u."shortName", c.name, p.city, p.campus,
                   array_to_string(p.keywords, ' '), p.city_department, p.city_region,
                   CASE WHEN p.modality = 'WORK_STUDY' THEN 'alternance apprentissage' END,
                   CASE WHEN p."entryLevel" = 'M2' THEN 'm2' END) AS body
    FROM pc p
    JOIN "University" u ON u.id = p."universityId"
    LEFT JOIN "Component" c ON c.id = p."componentId"
  UNION ALL
  SELECT 'mention', m.id, m.name,
         concat_ws(' ', array_to_string(m.keywords, ' '), cert.title,
                   (SELECT string_agg(DISTINCT u.name || ' ' || coalesce(u."shortName", ''), ' ')
                      FROM "Program" p JOIN "University" u ON u.id = p."universityId"
                     WHERE p."mentionId" = m.id AND p."isPublished" AND p."inOpenZone"))
    FROM "Mention" m
    LEFT JOIN "Certification" cert ON cert.id = m."certificationId"
   WHERE m."isPublished"
  UNION ALL
  SELECT 'university', u.id, u.name,
         concat_ws(' ', u."shortName", u.city, array_to_string(u.cities, ' '), u.region,
                   array_to_string(u.keywords, ' '))
    FROM "University" u
   WHERE u."isPublished"
  UNION ALL
  -- Cities with at least one published program.
  SELECT 'city', city_key, min(city_title),
         concat_ws(' ', min(city_department), min(city_region), string_agg(DISTINCT uname, ' '))
    FROM (
      SELECT coalesce(p.city_slug, regexp_replace(public.nm_norm(p.city), '[^a-z0-9]+', '-', 'g')) AS city_key,
             coalesce(p.city_name, p.city) AS city_title, p.city_department, p.city_region, u.name AS uname
        FROM pc p JOIN "University" u ON u.id = p."universityId"
       WHERE coalesce(p.city_name, p.city) <> ''
    ) x
   GROUP BY city_key
)
SELECT entity_type, entity_id, title, body,
       public.nm_norm(title) AS title_norm,
       public.nm_norm(title || ' ' || coalesce(body, '')) AS text_norm,
       setweight(to_tsvector('french', public.nm_unaccent(title)), 'A')
         || setweight(to_tsvector('french', public.nm_unaccent(coalesce(body, ''))), 'B') AS tsv
  FROM docs;

CREATE UNIQUE INDEX search_document_entity ON search_document (entity_type, entity_id);
CREATE INDEX search_document_tsv ON search_document USING GIN (tsv);
CREATE INDEX search_document_title_trgm ON search_document USING GIN (title_norm public.gin_trgm_ops);
CREATE INDEX search_document_text_trgm ON search_document USING GIN (text_norm public.gin_trgm_ops);
