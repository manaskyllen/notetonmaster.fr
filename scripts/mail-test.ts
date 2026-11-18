/**
 * Test mail from the production container (docs/deploiement.md, « Mails »):
 *
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate \
 *     pnpm mail:test --to toi@exemple.fr
 *
 * Sent with the same SMTP settings as the site. Fails when SMTP_HOST is missing or the server
 * refuses the mail.
 */
import { z } from 'zod';
import { testMail } from '../emails/templates';
import { sendMail } from '../lib/mail/send';
import { argValue } from './cli-args';

const to = z.string().trim().email().safeParse(argValue('to'));
if (!to.success) {
  console.error('Usage : pnpm mail:test --to <adresse>');
  process.exit(2);
}
if (!process.env.SMTP_HOST) {
  console.error('[mail:test] SMTP_HOST manque : rien ne serait envoyé.');
  process.exit(1);
}
const sentAt = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
try {
  await sendMail(to.data, testMail({ sentAt }));
  console.log(
    `[mail:test] envoyé par ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587} depuis ${process.env.MAIL_FROM ?? '(MAIL_FROM manque)'}`,
  );
} catch (e) {
  console.error(`[mail:test] refusé : ${(e as Error).message.split('\n')[0]}`);
  process.exit(1);
}
