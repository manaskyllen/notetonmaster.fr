/**
 * Mails of the integration tests: an in-memory outbox (tests/integration/helpers/mailbox.ts), never
 * an SMTP server. Tests read what was sent through `mailbox`, `lastMail`, `lastCode`.
 */
import { vi } from 'vitest';

vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);
