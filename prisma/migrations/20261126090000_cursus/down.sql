-- Reverse of migration.sql (Prisma does not read this file):
--   pnpm cursus:migrate --down      (first: undoes the grouping, from the journal)
--   prisma db execute --file prisma/migrations/20261126090000_cursus/down.sql
-- Refuses to run while a grouping is still in place. Puts back Program.variantOfId from the
-- journal, drops the cursus tables and columns, the MERGED status, and the record of the
-- migration, so that `prisma migrate deploy` applies it again.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CursusJournal" WHERE "runId" <> 'schema')
     OR EXISTS (SELECT 1 FROM "Program" WHERE status = 'MERGED') THEN
    RAISE EXCEPTION 'Regroupement des cursus encore en place : lancer d''abord pnpm cursus:migrate --down';
  END IF;
END $$;

-- The search view reads p.* (status, columns): dropped here, created again at the end.
DROP MATERIALIZED VIEW IF EXISTS search_document;

ALTER TABLE "Program" ADD COLUMN "variantOfId" TEXT;
UPDATE "Program" p SET "variantOfId" = j."oldValue" #>> '{}'
  FROM "CursusJournal" j
 WHERE j."runId" = 'schema' AND j."tableName" = 'Program' AND j."column" = 'variantOfId'
   AND p.id = j."rowKey"->>'id';
ALTER TABLE "Program" ADD CONSTRAINT "Program_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "CursusJournal";
DROP TABLE "CursusOverride";
ALTER TABLE "ProgramSearchIndex" DROP COLUMN "subtitle", DROP COLUMN "cursusCount",
  DROP COLUMN "cursusLabels", DROP COLUMN "cursusKind";
ALTER TABLE "MonMasterEntry" DROP COLUMN "cursusLabel", DROP COLUMN "homeProgramId";
ALTER TABLE "Program" DROP CONSTRAINT "Program_mergedIntoId_fkey";
ALTER TABLE "Program" DROP COLUMN "mergedIntoId";

-- The MERGED value of ProgramStatus (no row uses it any more).
ALTER TYPE "ProgramStatus" RENAME TO "ProgramStatus_cursus";
CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE', 'NOT_RENEWED', 'DRAFT');
ALTER TABLE "Program" ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ProgramStatus" USING "status"::text::"ProgramStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "ProgramSearchIndex"
  ALTER COLUMN "status" TYPE "ProgramStatus" USING "status"::text::"ProgramStatus";
DROP TYPE "ProgramStatus_cursus";

-- Search view, as in 20261119142000_search_document_open_zones.
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

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126090000_cursus';
