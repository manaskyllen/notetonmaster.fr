-- Allègement (16/11/2026) : calendrier Mon Master et rappels par mail retirés. Les lignes sont
-- exportées avant par scripts/backup-tables.ts (backups/*.json, voir DECISIONS.md).
DROP TABLE IF EXISTS "PhaseReminderSent";
DROP TABLE IF EXISTS "PhaseReminder";
DROP TABLE IF EXISTS "MonMasterPhase";
DROP TYPE IF EXISTS "MonMasterPhaseKey";
-- Marks of the daily reminder run of the worker (« reminders:<day> »): nothing schedules them any more.
DELETE FROM "ScheduledTask" WHERE key LIKE 'reminders:%';
