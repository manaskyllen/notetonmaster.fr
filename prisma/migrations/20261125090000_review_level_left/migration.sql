-- « J'ai arrêté en cours » (issue #18): a fourth status for the author of a review, and the
-- optional « Qu'est-ce qui t'a fait partir ? ». « Et aujourd'hui ? » reuses employmentStatus.
-- Existing reviews do not change. Reverse: down.sql in this folder.
ALTER TYPE "ReviewLevel" ADD VALUE 'LEFT';

ALTER TABLE "Review" ADD COLUMN "leaveReason" TEXT;
