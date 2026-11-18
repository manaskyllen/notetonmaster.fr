import 'server-only';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/crypto';

const INVITE_TTL_MS = 7 * 24 * 3600_000;

/**
 * The pending invitation of a token (7 days), with only what the invitation page shows. Not a
 * Server Action: never callable from the browser.
 */
export async function findInvitation(token: string) {
  if (!token || token.length > 200) return null;
  const a = await prisma.adminUser.findUnique({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, invitedAt: true, removedAt: true },
  });
  if (!a || a.removedAt || !a.invitedAt || Date.now() - a.invitedAt.getTime() > INVITE_TTL_MS)
    return null;
  return { id: a.id, email: a.email, role: a.role };
}
