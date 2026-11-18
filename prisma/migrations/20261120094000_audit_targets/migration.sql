-- Audit log of the admin redesign: categories, sentence (action + target), before / after.
CREATE TYPE "AuditCategory" AS ENUM ('FICHES', 'AVIS', 'VILLES', 'PARAMETRES', 'LEGAL', 'CONNEXION', 'DONNEES');

ALTER TABLE "AuditLog"
  ADD COLUMN "category" "AuditCategory",
  ADD COLUMN "action" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "targetType" TEXT,
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "diff" JSONB,
  ADD COLUMN "ip" TEXT,
  ADD COLUMN "sessionRef" TEXT;

-- The table is append-only: the trigger is lifted for this one backfill only.
ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update;
UPDATE "AuditLog" SET "category" = (CASE "actionType"
    WHEN 'AUTH' THEN 'CONNEXION'
    WHEN 'MODERATION' THEN 'AVIS'
    WHEN 'DATA' THEN (CASE WHEN "objectLabel" LIKE 'Villes ouvertes%' THEN 'VILLES' ELSE 'FICHES' END)
    WHEN 'SYNC' THEN 'DONNEES'
    WHEN 'LEGAL' THEN 'LEGAL'
    WHEN 'TEAM' THEN 'PARAMETRES'
    ELSE (CASE WHEN "objectLabel" LIKE 'Villes ouvertes%' THEN 'VILLES' ELSE 'PARAMETRES' END)
  END)::"AuditCategory";
ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update;

ALTER TABLE "AuditLog" ALTER COLUMN "category" SET NOT NULL;
DROP INDEX IF EXISTS "AuditLog_actionType_at_idx";
ALTER TABLE "AuditLog" DROP COLUMN "actionType";
DROP TYPE "AuditAction";

CREATE INDEX "AuditLog_at_category_actorId_idx" ON "AuditLog"("at" DESC, "category", "actorId");
CREATE INDEX "AuditLog_targetId_at_idx" ON "AuditLog"("targetId", "at" DESC);

-- Still append-only: UPDATE is always rejected; DELETE only past the retention
-- (1 year, 5 years for the LEGAL category), done by the daily maintenance.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."at" < now() - (CASE WHEN OLD."category" = 'LEGAL' THEN interval '5 years' ELSE interval '1 year' END) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
