-- Second notification preference: new reviews on followed programs (was: messages).
ALTER TABLE "Student" RENAME COLUMN "notifyMessages" TO "notifyFavorites";
ALTER TABLE "Student" ALTER COLUMN "notifyFavorites" SET DEFAULT false;
