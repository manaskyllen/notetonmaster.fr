'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { guard, guardSensitive } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/db/generated/client';
import type { EntityType } from '@/lib/db/generated/enums';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { refreshSearchIndex } from '@/lib/search-index';
import { queueIndexNow } from '@/lib/seo/indexnow';

export async function setPublished(type: EntityType, id: string, published: boolean) {
  return guard('data.edit', async (admin) => {
    const data = { isPublished: published };
    const name =
      type === 'PROGRAM'
        ? (await prisma.program.update({ where: { id }, data })).title
        : type === 'MENTION'
          ? (await prisma.mention.update({ where: { id }, data })).name
          : (await prisma.university.update({ where: { id }, data })).name;
    await refreshSearchIndex();
    const { refreshIssues } = await import('@/lib/admin/refresh-issues');
    await refreshIssues(
      type === 'PROGRAM'
        ? { programIds: [id] }
        : type === 'UNIVERSITY'
          ? { universityIds: [id] }
          : { mentionIds: [id] },
      admin.id,
    );
    expireTags([TAGS.footer, TAGS.catalog]);
    if (type === 'PROGRAM') await queueIndexNow([id]);
    await audit(admin, 'DATA', name, published ? 'Fiche publiée' : 'Fiche repassée en brouillon', {
      action: published ? 'a publié' : 'a dépublié',
      target: { type, id },
      diff: [
        {
          field: 'Publication',
          before: published ? 'Brouillon' : 'Publiée',
          after: published ? 'Publiée' : 'Brouillon',
        },
      ],
    });
    revalidatePath('/admin/fiches');
    return { ok: true as const };
  });
}

/**
 * Sector of an establishment checked by hand: public or private, never
 * overwritten by the annuaire afterwards (`sectorSource = "admin"`).
 */
export async function setSector(universityId: string, sector: 'PUBLIC' | 'PRIVATE') {
  return guard('data.edit', async (admin) => {
    if (sector !== 'PUBLIC' && sector !== 'PRIVATE') return { ok: false as const };
    const u = await prisma.university.update({
      where: { id: universityId },
      data: { sector, sectorSource: 'admin' },
    });
    await refreshSearchIndex();
    expireTags([TAGS.footer, TAGS.catalog]);
    await audit(
      admin,
      'DATA',
      u.name,
      `Secteur vérifié : ${sector === 'PUBLIC' ? 'public' : 'privé'}`,
    );
    revalidatePath('/admin/fiches');
    return { ok: true as const };
  });
}

// ───────────── Redesigned Fiches: drawer, problems, bulk actions, saved views ─────────────

/** Side panel of a fiche (opened without leaving the list). */
export async function loadFicheDrawer(id: string) {
  return guard('dashboard.view', async () => {
    const { getFicheDrawer } = await import('@/lib/admin/fiche-drawer');
    const data = await getFicheDrawer(id);
    return data ? { ok: true as const, data } : { ok: false as const, error: 'Fiche introuvable.' };
  });
}

/** « Ignorer » a problem: out of the lists for 30 days, recorded in the audit log. */
export async function ignoreIssue(issueId: string) {
  return guard('data.edit', async (admin) => {
    const { IGNORE_DAYS, ISSUE_LABEL } = await import('@/lib/admin/issues');
    const issue = await prisma.dataIssue.findUnique({ where: { id: issueId } });
    if (!issue || issue.resolvedAt) return { ok: false as const, error: 'Problème déjà réglé.' };
    const until = new Date(Date.now() + IGNORE_DAYS * 86_400_000);
    await prisma.dataIssue.update({
      where: { id: issueId },
      data: { ignoredUntil: until, ignoredById: admin.id },
    });
    const name =
      (await prisma.program.findUnique({ where: { id: issue.targetId }, select: { title: true } }))
        ?.title ??
      (
        await prisma.university.findUnique({
          where: { id: issue.targetId },
          select: { name: true },
        })
      )?.name ??
      (await prisma.mention.findUnique({ where: { id: issue.targetId }, select: { name: true } }))
        ?.name ??
      issue.targetId;
    await audit(
      admin,
      'DATA',
      name,
      `Problème ignoré ${IGNORE_DAYS} jours : ${ISSUE_LABEL[issue.kind]}${issue.field ? ` (${issue.field})` : ''}`,
      {
        action: 'a ignoré un problème sur',
        target: { type: issue.targetType, id: issue.targetId },
        diff: [
          {
            field: ISSUE_LABEL[issue.kind],
            before: 'À traiter',
            after: `Ignoré jusqu’au ${until.toLocaleDateString('fr-FR')}`,
          },
        ],
      },
    );
    expireTags([TAGS.admin]);
    return { ok: true as const };
  });
}

/** Queues a bulk action (checked fiches, or every fiche of the view). */
export async function startBulk(input: { action: string; ids?: string[]; query?: string }) {
  const { BULK_ACTIONS, BULK_JOB } = await import('@/lib/admin/bulk');
  const action = input.action as keyof typeof BULK_ACTIONS;
  if (!(action in BULK_ACTIONS)) return { ok: false as const, error: 'Action inconnue.' };
  // Exporting only reads: every role can, after confirming the code (export of data); the
  // others change the catalogue.
  return (action === 'export' ? guardSensitive : guard)(
    action === 'export' ? 'dashboard.view' : action === 'resync' ? 'sync.run' : 'data.edit',
    async (admin) => {
      const ids = (input.ids ?? []).filter((x) => typeof x === 'string').slice(0, 20_000);
      if (!ids.length && input.query == null)
        return { ok: false as const, error: 'Aucune fiche sélectionnée.' };
      const job = await prisma.job.create({
        data: {
          type: BULK_JOB,
          payload: {
            action,
            ...(ids.length ? { ids } : { query: String(input.query).slice(0, 2000) }),
            actor: { id: admin.id, name: admin.name, email: admin.email },
          },
          createdById: admin.id,
          total: ids.length || null,
        },
      });
      return { ok: true as const, jobId: job.id };
    },
  );
}

/** Progress of a bulk action (polled by the page every second). */
export async function bulkStatus(jobId: string) {
  return guard('dashboard.view', async (admin) => {
    const job = await prisma.job.findFirst({
      where: { id: jobId, createdById: admin.id },
      select: { status: true, progress: true, total: true, result: true },
    });
    if (!job) return { ok: false as const, error: 'Tâche inconnue.' };
    const result = (job.result ?? null) as { summary?: string; csv?: string } | null;
    if (job.status === 'DONE') revalidatePath('/admin/fiches');
    return {
      ok: true as const,
      status: job.status,
      progress: job.progress,
      total: job.total,
      summary: result?.summary ?? null,
      csv: result?.csv ?? null,
    };
  });
}

/** « + Enregistrer cette vue »: filters + sort under a name, for this member only. */
export async function saveView(name: string, query: string) {
  return guard('dashboard.view', async (admin) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return { ok: false as const, error: 'Donne un nom à la vue.' };
    const q = new URLSearchParams(query);
    q.delete('page');
    q.delete('fiche');
    const view = await prisma.savedView.create({
      data: { userId: admin.id, name: clean, screen: 'fiches', query: q.toString() },
    });
    revalidatePath('/admin/fiches');
    return { ok: true as const, id: view.id };
  });
}

export async function deleteView(id: string) {
  return guard('dashboard.view', async (admin) => {
    await prisma.savedView.deleteMany({ where: { id, userId: admin.id } });
    revalidatePath('/admin/fiches');
    return { ok: true as const };
  });
}

/** Establishments matching a text (filter « Établissement » beyond 20 establishments). */
export async function searchUniversities(q: string) {
  return guard('dashboard.view', async () => {
    const { normalize } = await import('@/lib/domain/search');
    const words = normalize(q)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .slice(0, 4);
    if (!words.length) return { ok: true as const, items: [] };
    const items = await prisma.$queryRaw<{ id: string; name: string; city: string | null }[]>`
      SELECT id, name, cities[1] AS city FROM "University"
       WHERE ${Prisma.join(
         words.map(
           (w) =>
             Prisma.sql`public.nm_norm(name || ' ' || coalesce("shortName", '') || ' ' || array_to_string(cities, ' ')) LIKE ${`%${w}%`}`,
         ),
         ' AND ',
       )}
       ORDER BY name LIMIT 8`;
    return { ok: true as const, items };
  });
}
