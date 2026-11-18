-- The contact address is now CONTACT_EMAIL (environment, lib/contact.ts): the two settings that no
-- page read are removed.
DELETE FROM "Setting" WHERE "key" IN ('legal.contactEmail', 'legal.rgpdContactEmail');

-- New notification event: a message of the contact form (/a-propos). Added to a matrix already
-- saved from the admin, with its default (admins and moderators, who see the « Contact » queue).
UPDATE "Setting"
SET "value" = "value" || '{"contact.received": {"ADMIN": true, "MODERATOR": true, "DATA_EDITOR": false, "LEGAL": false}}'::jsonb
WHERE "key" = 'notifications.matrix' AND NOT ("value" ? 'contact.received');
