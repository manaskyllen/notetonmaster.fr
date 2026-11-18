-- CreateEnum
CREATE TYPE "IdentifierKind" AS ENUM ('RNCP', 'RNCP_PREVIOUS', 'MONMASTER', 'UAI', 'SISE', 'OTHER');

-- CreateEnum
CREATE TYPE "TurnstileOutcome" AS ENUM ('OK', 'FAIL', 'ERROR');

-- CreateTable
CREATE TABLE "Identifier" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "IdentifierKind" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "region" TEXT NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnstileLog" (
    "id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "outcome" "TurnstileOutcome" NOT NULL,
    "errorCodes" TEXT[],
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnstileLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Identifier_value_idx" ON "Identifier"("value");

-- CreateIndex
CREATE INDEX "Identifier_entityType_entityId_idx" ON "Identifier"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Identifier_kind_value_entityId_key" ON "Identifier"("kind", "value", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "TurnstileLog_form_at_idx" ON "TurnstileLog"("form", "at");

-- ───────────── Search (brief 8.9) ─────────────
-- Prisma does not manage extensions, functions or materialized views: they live here only,
-- so later `prisma migrate dev` diffs never try to drop them.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Functions are schema-qualified: PostgreSQL 17 refreshes materialized views with a restricted
-- search_path.
-- unaccent() is only STABLE (its dictionary could change); indexes need an IMMUTABLE wrapper.
CREATE OR REPLACE FUNCTION nm_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Lower case, accents removed: the form every search compares.
CREATE OR REPLACE FUNCTION nm_norm(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.nm_unaccent($1)) $$;

-- One row per searchable entity. Refreshed after the seed and after every catalogue change
-- (lib/search.ts, refreshSearchIndex). Codes are not here: they are in "Identifier".
CREATE MATERIALIZED VIEW search_document AS
WITH docs AS (
  SELECT 'program'::text AS entity_type, p.id AS entity_id, p.title,
         concat_ws(' ', p."shortName", u.name, u."shortName", c.name, p.city, p.campus,
                   array_to_string(p.keywords, ' '), ci.department, ci.region,
                   CASE WHEN p.modality = 'WORK_STUDY' THEN 'alternance apprentissage' END,
                   CASE WHEN p."entryLevel" = 'M2' THEN 'm2' END) AS body
    FROM "Program" p
    JOIN "University" u ON u.id = p."universityId"
    LEFT JOIN "Component" c ON c.id = p."componentId"
    LEFT JOIN "City" ci ON ci.name = p.city
   WHERE p."isPublished"
  UNION ALL
  SELECT 'mention', m.id, m.name,
         concat_ws(' ', array_to_string(m.keywords, ' '), cert.title,
                   (SELECT string_agg(DISTINCT u.name || ' ' || coalesce(u."shortName", ''), ' ')
                      FROM "Program" p JOIN "University" u ON u.id = p."universityId"
                     WHERE p."mentionId" = m.id AND p."isPublished"))
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
  SELECT 'city', coalesce(ci.slug, regexp_replace(public.nm_norm(p.city), '[^a-z0-9]+', '-', 'g')),
         p.city,
         concat_ws(' ', min(ci.department), min(ci.region), string_agg(DISTINCT u.name, ' '))
    FROM "Program" p
    JOIN "University" u ON u.id = p."universityId"
    LEFT JOIN "City" ci ON ci.name = p.city
   WHERE p."isPublished"
   GROUP BY p.city, ci.slug
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
