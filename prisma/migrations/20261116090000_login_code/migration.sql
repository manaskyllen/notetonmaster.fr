-- Connexion par code à 6 chiffres : le lien magique reste en secours dans le même mail.

-- AlterTable
ALTER TABLE "MagicLinkToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT;
