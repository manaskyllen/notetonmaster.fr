'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { appUrl } from '@/emails/Layout';
import { adminInviteMail } from '@/emails/templates';
import { audit } from '@/lib/audit';
import { guardSensitive } from '@/lib/auth/admin';
import { revokeAllSessions } from '@/lib/auth/session';
import { hashToken, normalizeEmail, randomToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/domain/permissions';
import { sendMailSafe } from '@/lib/mail/send';

const role = z.enum(['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL']);

export async function inviteMember(raw: unknown) {
  return guardSensitive('team.manage', async (admin) => {
    const p = z.object({ email: z.string().trim().email(), role }).safeParse(raw);
    if (!p.success) return { ok: false as const, error: 'Adresse ou rôle invalide.' };
    const email = normalizeEmail(p.data.email);
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing && !existing.removedAt && existing.passwordHash)
      return { ok: false as const, error: 'Cette personne fait déjà partie de l’équipe.' };
    const token = randomToken();
    await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        name: 'Invitation en attente',
        role: p.data.role,
        invitedAt: new Date(),
        inviteTokenHash: hashToken(token),
      },
      update: {
        role: p.data.role,
        invitedAt: new Date(),
        inviteTokenHash: hashToken(token),
        removedAt: null,
        passwordHash: null,
        totpSecretEnc: null,
        totpEnabledAt: null,
      },
    });
    await sendMailSafe(
      email,
      adminInviteMail({
        url: `${appUrl()}/admin/invitation/${token}`,
        roleLabel: ROLE_LABEL[p.data.role],
      }),
    );
    await audit(admin, 'TEAM', email, `Invitation envoyée · rôle ${ROLE_LABEL[p.data.role]}`);
    revalidatePath('/admin/equipe');
    return { ok: true as const, message: `Invitation envoyée à ${email}.` };
  });
}

export async function changeRole(memberId: string, newRole: string) {
  return guardSensitive('team.manage', async (admin) => {
    const r = role.safeParse(newRole);
    if (!r.success) return { ok: false as const, error: 'Rôle inconnu.' };
    const m = await prisma.adminUser.findUnique({ where: { id: memberId } });
    if (!m || m.removedAt) return { ok: false as const, error: 'Membre introuvable.' };
    if (m.id === admin.id && r.data !== 'ADMIN')
      return { ok: false as const, error: 'Tu ne peux pas retirer ton propre rôle Admin.' };
    await prisma.adminUser.update({ where: { id: m.id }, data: { role: r.data } });
    // The new rights apply at the next login: open sessions are closed.
    await revokeAllSessions('ADMIN', m.id);
    await audit(
      admin,
      'TEAM',
      m.email,
      `Rôle modifié : ${ROLE_LABEL[m.role]} → ${ROLE_LABEL[r.data]}`,
    );
    revalidatePath('/admin/equipe');
    return { ok: true as const, message: 'Rôle mis à jour.' };
  });
}

export async function removeMember(memberId: string) {
  return guardSensitive('team.manage', async (admin) => {
    const m = await prisma.adminUser.findUnique({ where: { id: memberId } });
    if (!m || m.removedAt) return { ok: false as const, error: 'Membre introuvable.' };
    if (m.id === admin.id)
      return { ok: false as const, error: 'Tu ne peux pas te retirer toi-même.' };
    if (
      m.role === 'ADMIN' &&
      (await prisma.adminUser.count({
        where: { role: 'ADMIN', removedAt: null, passwordHash: { not: null } },
      })) <= 1
    )
      return { ok: false as const, error: 'Il faut garder au moins un·e admin.' };
    await prisma.adminUser.update({
      where: { id: m.id },
      data: { removedAt: new Date(), inviteTokenHash: null },
    });
    await revokeAllSessions('ADMIN', m.id);
    await audit(
      admin,
      'TEAM',
      m.email,
      m.passwordHash ? 'Membre retiré de l’équipe' : 'Invitation annulée',
    );
    revalidatePath('/admin/equipe');
    return {
      ok: true as const,
      message: m.passwordHash ? 'Membre retiré.' : 'Invitation annulée.',
    };
  });
}
