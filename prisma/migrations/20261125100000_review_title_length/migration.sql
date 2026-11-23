-- « Ton master en une phrase » (issue #20): the title of a review already exists (nullable, the
-- reviews written before it keep none); it is now limited to 80 characters, as the form checks.
-- Fails instead of cutting if a longer title exists. Reverse: down.sql in this folder.
ALTER TABLE "Review" ALTER COLUMN "title" SET DATA TYPE VARCHAR(80);
