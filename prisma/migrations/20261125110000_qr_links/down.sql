-- Reverse of migration.sql (Prisma does not read this file):
--   prisma db execute --file prisma/migrations/20261125110000_qr_links/down.sql
-- Drops the counters with the links: export them first if they are still needed. Removes the
-- record of the migration, so that `prisma migrate deploy` applies it again.
DROP TABLE "qr_scans_daily";
DROP TABLE "qr_links";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261125110000_qr_links';
