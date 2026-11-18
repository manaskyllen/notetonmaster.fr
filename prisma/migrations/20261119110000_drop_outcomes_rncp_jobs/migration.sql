-- Allègement (16/11/2026) : plus de débouchés (onglet de la fiche parcours, rubrique des sites
-- d'universités) ni de métiers visés et blocs de compétences RNCP (fiche mention). Données
-- publiques ou de collecte, aucune donnée d'étudiant·e : pas d'export.
DROP TABLE IF EXISTS "Outcome";
ALTER TABLE "Program" DROP COLUMN IF EXISTS "careerProspects";
ALTER TABLE "Certification"
  DROP COLUMN IF EXISTS "skillBlocks",
  DROP COLUMN IF EXISTS "jobs",
  DROP COLUMN IF EXISTS "romeCodes",
  DROP COLUMN IF EXISTS "romeJobs";
-- Provenance of the removed fields (rows « Débouchés », « Métiers visés », « Blocs de compétences »).
DELETE FROM "FieldProvenance" WHERE field IN ('outcomes', 'careerProspects', 'skillBlocks', 'jobs', 'romeCodes');
