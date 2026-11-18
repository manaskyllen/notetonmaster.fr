-- Allègement, partie 5 : la ligne de modalité des cartes (« 2 ans · Présentiel ») lit la durée dans l'index.
ALTER TABLE "ProgramSearchIndex" ADD COLUMN "durationYears" INTEGER NOT NULL DEFAULT 2;
UPDATE "ProgramSearchIndex" i SET "durationYears" = p."durationYears" FROM "Program" p WHERE p.id = i."programId";
