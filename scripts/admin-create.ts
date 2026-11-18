/**
 * First admin, or any team member, from the command line of the server (docs/deploiement.md):
 *
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate \
 *     pnpm admin:create --email prenom@notetonmaster.fr --role ADMIN
 *
 * Creates the account without a password and mails a single-use invitation link (7 days), as the
 * Équipe screen does (lib/admin/invite.ts). The person chooses a password on that page, then must
 * set up the double authentication (TOTP) at the first login. No password is ever given on the
 * command line, and neither the link nor its token is printed.
 */
import { z } from 'zod';
import { inviteAdmin, INVITABLE_ROLES } from '../lib/admin/invite';
import { audit } from '../lib/audit';
import { prisma } from '../lib/db';
import { ROLE_LABEL } from '../lib/domain/permissions';
import { sendMail } from '../lib/mail/send';
import { argValue } from './cli-args';

const USAGE = `Usage : pnpm admin:create --email <adresse> --role <${INVITABLE_ROLES.join('|')}>`;

async function main() {
  const p = z
    .object({ email: z.string().trim().email(), role: z.enum(INVITABLE_ROLES) })
    .safeParse({ email: argValue('email'), role: argValue('role')?.toUpperCase() });
  if (!p.success) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (!process.env.SMTP_HOST) {
    console.error('[admin:create] SMTP_HOST manque : le lien d’invitation ne pourrait pas partir.');
    process.exitCode = 1;
    return;
  }
  // sendMail, not sendMailSafe: an invitation that cannot be sent is an error here.
  const r = await inviteAdmin(p.data.email, p.data.role, sendMail);
  if (!r.ok) {
    console.error(`[admin:create] ${r.error}`);
    process.exitCode = 1;
    return;
  }
  const role = ROLE_LABEL[p.data.role];
  await audit(null, 'TEAM', r.email, `Invitation envoyée en ligne de commande · rôle ${role}`);
  console.log(
    `[admin:create] invitation envoyée à ${r.email} (rôle ${role}) : lien à usage unique, valable 7 jours ; double authentification à configurer à la première connexion.`,
  );
}

main()
  .catch((e: Error) => {
    // Never the whole error: an SMTP answer may quote the address.
    console.error(`[admin:create] échec : ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
