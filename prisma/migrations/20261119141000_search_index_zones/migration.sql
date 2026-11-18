-- Allègement, partie 9 : zones ouvertes de chaque parcours dans l'index (filtre Lieu « zone: », pastilles de l'accueil).
ALTER TABLE "ProgramSearchIndex" ADD COLUMN "zoneSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "ProgramSearchIndex_zoneSlugs_idx" ON "ProgramSearchIndex" USING GIN ("zoneSlugs");
