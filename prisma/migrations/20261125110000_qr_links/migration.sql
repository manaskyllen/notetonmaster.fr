-- Short links of the printed QR codes (issue #17): /q/{slug} counts one scan per day and link,
-- then redirects. Nothing about the visitor is stored. Reverse: down.sql in this folder.
CREATE TABLE "qr_links" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "target_path" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "qr_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "qr_scans_daily" (
    "link_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "qr_scans_daily_pkey" PRIMARY KEY ("link_id","day")
);

CREATE UNIQUE INDEX "qr_links_slug_key" ON "qr_links"("slug");

ALTER TABLE "qr_scans_daily" ADD CONSTRAINT "qr_scans_daily_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "qr_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
