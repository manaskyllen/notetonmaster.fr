'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';

export async function resolveAlert(alertId: string) {
  return guard('data.edit', async (admin) => {
    const a = await prisma.dataAlert.update({
      where: { id: alertId },
      data: { resolvedAt: new Date(), resolvedById: admin.id },
    });
    await audit(admin, 'DATA', a.title, 'Alerte de qualité marquée résolue');
    revalidatePath('/admin');
    return { ok: true as const };
  });
}
