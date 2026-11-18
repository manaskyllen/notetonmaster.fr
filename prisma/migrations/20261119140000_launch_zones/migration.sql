-- Allègement, partie 9 : lancement limité à trois villes et leur intercommunalité.
CREATE TABLE "LaunchZone" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "epciCode" TEXT NOT NULL,
    "epciName" TEXT NOT NULL,
    "communeCodes" TEXT[],
    "communesRefreshedAt" TIMESTAMP(3),
    "open" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaunchZone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LaunchZone_slug_key" ON "LaunchZone"("slug");
CREATE UNIQUE INDEX "LaunchZone_epciCode_key" ON "LaunchZone"("epciCode");
CREATE INDEX "LaunchZone_open_order_idx" ON "LaunchZone"("open", "order");
ALTER TABLE "LaunchZone" ADD CONSTRAINT "LaunchZone_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Program"
  ADD COLUMN "siteCommunes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "inOpenZone" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Program_inOpenZone_idx" ON "Program"("inOpenZone");

-- The three cities of the launch, open (communes read on geo.api.gouv.fr on 16/11/2026,
-- prisma/fixtures/launch-zones.json). The programs' sites and flags are computed by the
-- bootstrap right after (rebuild of the search index).
INSERT INTO "LaunchZone" (id, slug, name, "epciCode", "epciName", "communeCodes", "communesRefreshedAt", open, "order", "openedAt", "updatedAt")
VALUES ('launch-strasbourg', 'strasbourg', 'Strasbourg', '246700488', 'Eurométropole de Strasbourg', '{"67001","67043","67049","67065","67118","67119","67124","67131","67137","67152","67182","67204","67212","67218","67247","67256","67267","67268","67296","67309","67326","67343","67350","67363","67365","67378","67389","67447","67471","67482","67506","67519","67551"}', '2026-11-16', true, 1, now(), now())
ON CONFLICT (slug) DO NOTHING;
INSERT INTO "LaunchZone" (id, slug, name, "epciCode", "epciName", "communeCodes", "communesRefreshedAt", open, "order", "openedAt", "updatedAt")
VALUES ('launch-mulhouse', 'mulhouse', 'Mulhouse', '200066009', 'CA Mulhouse Alsace Agglomération', '{"68015","68020","68022","68032","68043","68055","68056","68064","68072","68084","68088","68093","68101","68118","68129","68144","68154","68166","68195","68218","68224","68238","68253","68254","68256","68258","68267","68270","68271","68278","68289","68300","68321","68323","68343","68375","68376","68384","68386"}', '2026-11-16', true, 2, now(), now())
ON CONFLICT (slug) DO NOTHING;
INSERT INTO "LaunchZone" (id, slug, name, "epciCode", "epciName", "communeCodes", "communesRefreshedAt", open, "order", "openedAt", "updatedAt")
VALUES ('launch-nantes', 'nantes', 'Nantes', '244400404', 'Nantes Métropole', '{"44009","44018","44020","44024","44026","44035","44047","44074","44094","44101","44109","44114","44120","44143","44150","44162","44166","44171","44172","44190","44194","44198","44204","44215"}', '2026-11-16', true, 3, now(), now())
ON CONFLICT (slug) DO NOTHING;
