-- Reverse of migration.sql (Prisma does not read this file):
--   prisma db execute --file prisma/migrations/20261125090000_review_level_left/down.sql
-- Refuses to run while a row uses LEFT: nothing is lost silently (change or delete those rows
-- first). Removes the record of the migration, so that `prisma migrate deploy` applies it again.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Review" WHERE level = 'LEFT')
     OR EXISTS (SELECT 1 FROM "Student" WHERE level = 'LEFT')
     OR EXISTS (SELECT 1 FROM "ProgramVerification" WHERE "declaredLevel" = 'LEFT') THEN
    RAISE EXCEPTION 'Des lignes utilisent encore le statut LEFT : retour en arrière refusé.';
  END IF;
END $$;

ALTER TABLE "Review" DROP COLUMN "leaveReason";

ALTER TYPE "ReviewLevel" RENAME TO "ReviewLevel_old";
CREATE TYPE "ReviewLevel" AS ENUM ('M1', 'M2', 'GRADUATE');
ALTER TABLE "Review" ALTER COLUMN level TYPE "ReviewLevel" USING level::text::"ReviewLevel";
ALTER TABLE "Student" ALTER COLUMN level TYPE "ReviewLevel" USING level::text::"ReviewLevel";
ALTER TABLE "ProgramVerification"
  ALTER COLUMN "declaredLevel" TYPE "ReviewLevel" USING "declaredLevel"::text::"ReviewLevel";
DROP TYPE "ReviewLevel_old";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261125090000_review_level_left';
