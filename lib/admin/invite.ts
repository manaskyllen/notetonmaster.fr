/**
 * Invitation of a team member: the account is created (or re-invited) without a password, and a
 * single-use link valid 7 days is mailed (/admin/invitation/<token>, lib/auth/invitation.ts). The
 * person chooses a password there, then sets up the TOTP at the first login. Shared by the Équipe
 * screen and `pnpm admin:create` (scripts/admin-create.ts): the token is never shown or logged.
 */
import { appUrl } from '@/emails/Layout';
import { adminInviteMail } from '@/emails/templates';
import { hashToken, normalizeEmail, randomToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { AdminRole } from '@/lib/db/generated/client';
import { ROLE_LABEL } from '@/lib/domain/permissions';
import type { Mail } from '@/emails/templates';

export const INVITABLE_ROLES = ['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL'] as const;

export async function inviteAdmin(
  rawEmail: string,
  role: AdminRole,
  send: (to: string, mail: Mail) => Promise<unknown>,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing && !existing.removedAt && existing.passwordHash)
    return { ok: false, error: 'Cette personne fait déjà partie de l’équipe.' };
  const token = randomToken();
  await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: 'Invitation en attente',
      role,
      invitedAt: new Date(),
      inviteTokenHash: hashToken(token),
    },
    update: {
      role,
      invitedAt: new Date(),
      inviteTokenHash: hashToken(token),
      removedAt: null,
      passwordHash: null,
      totpSecretEnc: null,
      totpEnabledAt: null,
    },
  });
  await send(
    email,
    adminInviteMail({ url: `${appUrl()}/admin/invitation/${token}`, roleLabel: ROLE_LABEL[role] }),
  );
  return { ok: true, email };
}
