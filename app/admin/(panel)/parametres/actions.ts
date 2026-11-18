'use server';

import { TURNSTILE_FORMS } from '@/lib/turnstile-forms';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { audit, change } from '@/lib/audit';

/** Fields of the banner in the audit log (Avant / Après). */
const BANNER_FIELD: Record<string, string> = {
  message: 'Message',
  linkLabel: 'Texte du lien',
  linkUrl: 'Adresse du lien',
  tone: 'Ton',
  scope: 'Pages',
  startsAt: 'Début',
  endsAt: 'Fin',
  dismissible: 'Peut être fermé',
  active: 'Actif',
};
import { guard } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { FREQUENCIES, frequencyOf } from '@/lib/admin/frequency';
import { getSettings } from '@/lib/settings';
import { NOTIFICATION_EVENTS } from '@/lib/settings-defaults';

const bool = z.boolean();
const roleMap = z.object({ ADMIN: bool, MODERATOR: bool, DATA_EDITOR: bool, LEGAL: bool });

const schema = z.object({
  sources: z.record(z.string(), z.enum(['off', 'day', 'week', 'month'])),
  settings: z.object({
    'collect.userAgent': z.string().trim().min(5).max(200),
    'collect.minDelaySeconds': z
      .number()
      .int()
      .min(5, 'Au moins 5 secondes entre deux requêtes.')
      .max(120),
    'moderation.autoPublish': bool,
    'moderation.nameDetection': bool,
    'moderation.anonymousReviews': bool,
    'moderation.documents': bool,
    'chat.enabled': bool,
    'chat.limitEnabled': bool,
    'chat.limitPerDay': z.number().int().min(1).max(50),
    'moderation.delayHours': z.number().int().min(1).max(240),
    'moderation.reportThreshold': z.number().int().min(1).max(50),
    'moderation.watchTerms': z.array(z.string().trim().min(1).max(60)).max(200),
    'turnstile.forms': z.object(Object.fromEntries(TURNSTILE_FORMS.map((f) => [f.id, bool]))),
    'notifications.matrix': z.object(
      Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.id, roleMap])),
    ),
    'legal.contactEmail': z.string().trim().email(),
    'legal.internalDelayDays': z.number().int().min(1).max(30),
    'legal.inactiveAccountYears': z.number().int().min(1).max(10),
    'legal.rgpdContactEmail': z.string().trim().email().or(z.literal('')),
  }),
});

export async function saveSettings(raw: unknown) {
  return guard('team.manage', async (admin) => {
    const p = schema.safeParse(raw);
    if (!p.success)
      return {
        ok: false as const,
        error: p.error.issues
          .map((i) => i.message)
          .slice(0, 2)
          .join(' · '),
      };
    const current = await getSettings();
    const changed: string[] = [];
    for (const [key, value] of Object.entries(p.data.settings)) {
      if (JSON.stringify(current[key as keyof typeof current]) === JSON.stringify(value)) continue;
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
      changed.push(key);
    }
    const sources = await prisma.dataSource.findMany();
    for (const s of sources) {
      const freq = p.data.sources[s.key];
      if (!freq || (s.blockedReason && freq !== 'off')) continue; // a source blocked by robots.txt stays off
      if (frequencyOf(s.enabled, s.schedule) === freq) continue;
      const f = FREQUENCIES.find((x) => x.value === freq)!;
      await prisma.dataSource.update({
        where: { id: s.id },
        data: {
          enabled: freq !== 'off',
          schedule: f.cron ?? s.schedule,
          scheduleLabel: f.scheduleLabel,
        },
      });
      changed.push(`source ${s.key} → ${f.label}`);
    }
    if (changed.length)
      await audit(admin, 'SETTINGS', 'Paramètres', `Modifiés : ${changed.join(', ')}`, {
        action: 'a modifié les paramètres',
        target: { type: 'SETTINGS', id: 'reglages' },
      });
    revalidatePath('/admin/parametres');
    return {
      ok: true as const,
      message: changed.length ? 'Paramètres enregistrés.' : 'Rien à enregistrer.',
    };
  });
}

/**
 * Paramètres › Bandeau d'information (Admin only, checked here): one banner, always the same row.
 * Validated by the schema of the form; audited with the before and after; the cached banner of
 * the public layout is expired at once.
 */
export async function saveBanner(raw: unknown) {
  return guard('team.manage', async (admin) => {
    const { bannerSchema, parisDay } = await import('@/lib/domain/banner');
    const p = bannerSchema.safeParse(raw);
    if (!p.success)
      return {
        ok: false as const,
        error: p.error.issues
          .map((i) => i.message)
          .slice(0, 2)
          .join(' · '),
        fields: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])),
      };
    const v = p.data;
    const data = {
      message: v.message,
      linkLabel: v.linkLabel || null,
      linkUrl: v.linkUrl || null,
      tone: v.tone,
      scope: v.scope,
      startsAt: parisDay(v.startsAt),
      endsAt: v.endsAt ? parisDay(v.endsAt, true) : null,
      dismissible: v.dismissible,
      active: v.active,
      updatedById: admin.id,
    };
    const before = await prisma.siteBanner.findFirst({ orderBy: { updatedAt: 'desc' } });
    const after = before
      ? await prisma.siteBanner.update({ where: { id: before.id }, data })
      : await prisma.siteBanner.create({ data });
    const pick = (b: typeof after | null) =>
      b && {
        message: b.message,
        linkLabel: b.linkLabel,
        linkUrl: b.linkUrl,
        tone: b.tone,
        scope: b.scope,
        startsAt: b.startsAt.toISOString().slice(0, 10),
        endsAt: b.endsAt?.toISOString().slice(0, 10) ?? null,
        dismissible: b.dismissible,
        active: b.active,
      };
    await audit(
      admin,
      'SETTINGS',
      'Bandeau d’information',
      `Avant : ${JSON.stringify(pick(before))} · Après : ${JSON.stringify(pick(after))}`,
      {
        action: 'a modifié le bandeau d’information',
        target: { type: 'SETTINGS', id: 'bandeau' },
        diff: Object.entries(pick(after) ?? {})
          .filter(
            ([k, v]) =>
              JSON.stringify(v) !==
              JSON.stringify((pick(before) as Record<string, unknown> | null)?.[k]),
          )
          .map(([k, v]) =>
            change(BANNER_FIELD[k] ?? k, (pick(before) as Record<string, unknown> | null)?.[k], v),
          ),
      },
    );
    revalidateTag('banner', { expire: 0 });
    revalidatePath('/admin/parametres');
    return {
      ok: true as const,
      message: 'Bandeau enregistré.',
      updatedAt: after.updatedAt.toISOString(),
      id: after.id,
    };
  });
}
