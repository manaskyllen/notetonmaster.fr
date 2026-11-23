-- Reverse of migration.sql (Prisma does not read this file):
--   prisma db execute --file prisma/migrations/20261125120000_drop_review_title/down.sql
-- The column comes back empty (the titles dropped are not restored).
-- Removes the record of the migration, so that `prisma migrate deploy` applies it again.
ALTER TABLE "Review" ADD COLUMN "title" TEXT;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261125120000_drop_review_title';
