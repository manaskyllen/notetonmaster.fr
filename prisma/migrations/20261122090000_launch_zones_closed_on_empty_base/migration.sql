-- A new database (production first deployment) starts with every city closed: they are opened
-- from the admin once the sources are synced and checked (docs/deploiement.md). The migration
-- launch_zones inserted the three launch cities open; a database that already has parcours
-- keeps the state its team chose.
UPDATE "LaunchZone"
   SET open = false, "openedAt" = NULL
 WHERE open AND NOT EXISTS (SELECT 1 FROM "Program");
