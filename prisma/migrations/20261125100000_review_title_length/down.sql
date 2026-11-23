-- Reverse of migration.sql (Prisma does not read this file):
--   prisma db execute --file prisma/migrations/20261125100000_review_title_length/down.sql
-- Removes the record of the migration, so that `prisma migrate deploy` applies it again.
ALTER TABLE "Review" ALTER COLUMN "title" SET DATA TYPE TEXT;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261125100000_review_title_length';
