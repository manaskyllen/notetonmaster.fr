'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { findInvitation } from '@/lib/auth/invitation';
import { prisma } from '@/lib/db';

export async function acceptInvitation(
  token: string,
  _prev: { error?: string },
  fd: FormData,
): Promise<{ error?: string }> {
  const a = await findInvitation(token);
  if (!a) return { error: 'Invitation expirée ou déjà utilisée.' };
  const p = z
    .object({
      name: z.string().trim().min(2, 'Indique ton nom.').max(80),
      password: z.string().min(12, '12 caractères minimum.').max(200),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: 'Les deux mots de passe ne correspondent pas.',
    })
    .safeParse({ name: fd.get('name'), password: fd.get('password'), confirm: fd.get('confirm') });
  if (!p.success) return { error: p.error.issues[0]?.message };
  await prisma.adminUser.update({
    where: { id: a.id },
    data: {
      name: p.data.name,
      passwordHash: await hashPassword(p.data.password),
      inviteTokenHash: null,
    },
  });
  await audit(
    { id: a.id, name: p.data.name },
    'TEAM',
    a.email,
    'Invitation acceptée · double authentification à configurer',
  );
  redirect('/admin/login?active=1');
}
