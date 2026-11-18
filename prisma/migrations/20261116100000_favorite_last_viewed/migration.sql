-- Masters suivis : « n nouveaux avis depuis ta dernière visite ».

-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
