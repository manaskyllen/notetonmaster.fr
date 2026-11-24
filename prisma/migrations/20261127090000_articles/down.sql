-- Reverse of migration.sql (Prisma does not read this file):
--   prisma db execute --file prisma/migrations/20261127090000_articles/down.sql
-- Drops the guides and their figures: export them first if they are still needed. The audit
-- category ARTICLES stays (PostgreSQL cannot drop an enum value; the log is append-only anyway).
-- Removes the record of the migration, so that `prisma migrate deploy` applies it again.
DROP TABLE "ArticleFigures";
DROP TABLE "ArticleSlugRedirect";
DROP TABLE "Article";
DROP TYPE "ArticleTheme";
DROP TYPE "ArticleStatus";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127090000_articles';
