-- Allègement (16/11/2026) : la carte « Vivre à … » de la fiche parcours, l'écran Paramètres ›
-- Coût de la vie et l'import de la carte des loyers sont retirés. Données publiques et tarifs
-- saisis par l'équipe, aucune donnée d'étudiant·e : pas d'export.
DROP TABLE IF EXISTS "CityCost";
DROP TABLE IF EXISTS "RentIndex";
DELETE FROM "Setting" WHERE key LIKE 'cost.%';
-- The source and its runs, logs and snapshots (cascade).
DELETE FROM "DataSource" WHERE key = 'carte-loyers';
