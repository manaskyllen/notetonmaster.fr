-- Onglet Débouchés : métiers de la fiche RNCP avec leur code ROME (famille de métiers).

-- AlterTable
ALTER TABLE "Certification" ADD COLUMN     "romeJobs" JSONB NOT NULL DEFAULT '[]';
