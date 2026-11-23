'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, change } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import {
  isInternalPath,
  isValidSlug,
  LABEL_MAX,
  SLUG_MAX,
  SLUG_MIN,
  TARGET_MAX,
} from '@/lib/domain/qr';

/**
 * QR codes (issue #17): short links of the printed supports. Admin only (team.manage, as the
 * settings). Never deleted: archived, and a slug is never reused.
 */
type Result = { ok: true; id?: string; message: string } | { ok: false; error: string };

const label = z
  .string()
  .trim()
  .min(2, 'Donne un libellé (ex. « Sous-bock vert · Nantes »).')
  .max(LABEL_MAX, `${LABEL_MAX} caractères maximum.`);
const target = z
  .string()
  .trim()
  .max(TARGET_MAX)
  .refine(isInternalPath, 'Cible refusée : un chemin du site, qui commence par un seul « / ».');
const createSchema = z.object({
  label,
  slug: z
    .string()
    .trim()
    .refine(
      isValidSlug,
      `Adresse courte : ${SLUG_MIN} à ${SLUG_MAX} caractères, minuscules, chiffres et tirets.`,
    ),
  targetPath: target,
});
const updateSchema = z.object({ id: z.string().min(1), label, targetPath: target });

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Champs à corriger.';

export async function createQrLink(raw: unknown): Promise<Result | { ok: false; error: string }> {
  return guard('team.manage', async (admin) => {
    const p = createSchema.safeParse(raw);
    if (!p.success) return { ok: false as const, error: firstError(p.error) };
    // Unique among every link ever created, archived ones included: never reused.
    if (await prisma.qrLink.findUnique({ where: { slug: p.data.slug }, select: { id: true } }))
      return {
        ok: false as const,
        error: 'Cette adresse courte existe déjà (ou a déjà servi) : choisis-en une autre.',
      };
    const link = await prisma.qrLink.create({ data: p.data }).catch((e: { code?: string }) => {
      if (e?.code === 'P2002') return null; // created at the same time by someone else
      throw e;
    });
    if (!link)
      return {
        ok: false as const,
        error: 'Cette adresse courte existe déjà (ou a déjà servi) : choisis-en une autre.',
      };
    await audit(admin, 'SETTINGS', `QR code /q/${link.slug}`, `Lien créé vers ${link.targetPath}`, {
      action: 'a créé le lien de QR code',
      target: { type: 'QR', id: link.id },
    });
    revalidatePath('/admin/qr');
    return { ok: true as const, id: link.id, message: `Lien /q/${link.slug} créé.` };
  });
}

export async function updateQrLink(raw: unknown): Promise<Result | { ok: false; error: string }> {
  return guard('team.manage', async (admin) => {
    const p = updateSchema.safeParse(raw);
    if (!p.success) return { ok: false as const, error: firstError(p.error) };
    const before = await prisma.qrLink.findUnique({ where: { id: p.data.id } });
    if (!before) return { ok: false as const, error: 'Lien introuvable.' };
    if (before.archivedAt) return { ok: false as const, error: 'Ce lien est archivé.' };
    // The slug never changes: it is printed.
    await prisma.qrLink.update({
      where: { id: before.id },
      data: { label: p.data.label, targetPath: p.data.targetPath },
    });
    await audit(admin, 'SETTINGS', `QR code /q/${before.slug}`, 'Lien modifié', {
      action: 'a modifié le lien de QR code',
      target: { type: 'QR', id: before.id },
      diff: [
        change('Libellé', before.label, p.data.label),
        change('Cible', before.targetPath, p.data.targetPath),
      ].filter((c) => c.before !== c.after),
    });
    revalidatePath('/admin/qr');
    return { ok: true as const, message: 'Lien enregistré.' };
  });
}

export async function archiveQrLink(id: unknown): Promise<Result | { ok: false; error: string }> {
  return guard('team.manage', async (admin) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Lien introuvable.' };
    const link = await prisma.qrLink.findUnique({ where: { id } });
    if (!link) return { ok: false as const, error: 'Lien introuvable.' };
    if (!link.archivedAt)
      await prisma.qrLink.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(admin, 'SETTINGS', `QR code /q/${link.slug}`, 'Lien archivé', {
      action: 'a archivé le lien de QR code',
      target: { type: 'QR', id },
    });
    revalidatePath('/admin/qr');
    return {
      ok: true as const,
      message: `Lien /q/${link.slug} archivé : ses scans mènent désormais à l’accueil.`,
    };
  });
}
