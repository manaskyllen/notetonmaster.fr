-- Figures compared before a backup and after its restore (scripts/backup.sh, restore.sh): one
-- « name value » line each. Only counts, never personal data.
SELECT 'avis_publies ' || count(*) FROM "Review" WHERE status = 'PUBLISHED'
UNION ALL SELECT 'avis_total ' || count(*) FROM "Review"
UNION ALL SELECT 'parcours_publies ' || count(*) FROM "Program" WHERE "isPublished"
UNION ALL SELECT 'villes_ouvertes ' || count(*) FROM "LaunchZone" WHERE open
UNION ALL SELECT 'etudiants ' || count(*) FROM "Student"
UNION ALL SELECT 'comptes_admin ' || count(*) FROM "AdminUser" WHERE "removedAt" IS NULL
UNION ALL SELECT 'justificatifs ' || count(*) FROM "ProgramVerification";
