import { audit } from '@/lib/audit';
import { queueIndexNow } from '@/lib/seo/indexnow';
import { invalidateTagsRemote, TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import type { EntityType } from '@/lib/db/generated/enums';
import { refreshSearchIndex } from '@/lib/search-index';
import { csvLine, ficheIds, fichesCsvRows, readFicheQuery } from './fiche-query';
import { computeIssues, IGNORE_DAYS } from './issues';

/**
 * Bulk actions of Fiches (Resynchroniser, Publier, Dépublier, Ignorer les problèmes, Exporter):
 * a Job run by the worker, by batches, with its progress (Job.progress / Job.total), a summary
 * at the end (Job.result) and one audit entry for the whole batch.
 */
export const BULK_ACTIONS = {
  resync: { label: 'Resynchroniser', done: 'collecte relancée' },
  publish: { label: 'Publier', done: 'publiées' },
  unpublish: { label: 'Dépublier', done: 'repassées en brouillon' },
  ignore: { label: 'Ignorer les problèmes', done: 'problèmes ignorés' },
  export: { label: 'Exporter', done: 'exportées' },
} as const;
export type BulkAction = keyof typeof BULK_ACTIONS;

export const BULK_JOB = 'BULK_FICHES';
/** Above this, an export is sent by mail instead of downloaded. */
export const EXPORT_DIRECT_MAX = 1000;

export interface BulkPayload {
  action: BulkAction;
  /** The fiches checked, or… */
  ids?: string[];
  /** …every fiche of a view (query string of Fiches). */
  query?: string;
  actor: { id: string; name: string; email: string };
}

export interface BulkResult {
  summary: string;
  /** Export of 1 000 lines or fewer: the CSV itself, downloaded by the page. */
  csv?: string;
  mailed?: boolean;
}

const BATCH = 200;

async function setProgress(jobId: string, progress: number, total: number) {
  await prisma.job.update({ where: { id: jobId }, data: { progress, total } });
}

export async function runBulkJob(jobId: string, p: BulkPayload): Promise<BulkResult> {
  const targets: { id: string; type: EntityType }[] = p.query
    ? await ficheIds(readFicheQuery(Object.fromEntries(new URLSearchParams(p.query))))
    : await typesOf(p.ids ?? []);
  const total = targets.length;
  await setProgress(jobId, 0, total);
  const nf = new Intl.NumberFormat('fr-FR');
  const noun = (n: number) => `${nf.format(n)} fiche${n > 1 ? 's' : ''}`;
  let changed = 0;
  let skipped = 0;
  let summary = '';
  let result: BulkResult = { summary: '' };

  if (p.action === 'export') {
    const rows = await fichesCsvRows(targets.map((t) => t.id));
    await setProgress(jobId, total, total);
    const csv = '﻿' + rows.map(csvLine).join('\r\n') + '\r\n';
    if (total <= EXPORT_DIRECT_MAX) result = { summary: `${noun(total)} exportées`, csv };
    else {
      const { sendMail } = await import('@/lib/mail/send');
      const { adminExportMail } = await import('@/emails/templates');
      await sendMail(p.actor.email, adminExportMail('fiches', total), [
        {
          filename: `fiches-${new Date().toISOString().slice(0, 10)}.csv`,
          content: csv,
          contentType: 'text/csv',
        },
      ]);
      result = {
        summary: `${noun(total)} exportées · fichier envoyé à ${p.actor.email}`,
        mailed: true,
      };
    }
    await audit(
      p.actor,
      'DATA',
      `${noun(total)}`,
      `Export CSV des fiches${p.query ? ` (vue « ${p.query || 'à traiter'} »)` : ''}`,
      {
        action: 'a exporté',
        target: { type: 'FICHES', id: p.query != null ? `?${p.query}` : null },
      },
    );
    return result;
  }

  if (p.action === 'resync') {
    const programs = targets.filter((t) => t.type === 'PROGRAM').map((t) => t.id);
    const unis = new Set(targets.filter((t) => t.type === 'UNIVERSITY').map((t) => t.id));
    for (let i = 0; i < programs.length; i += 5000)
      for (const r of await prisma.program.findMany({
        where: { id: { in: programs.slice(i, i + 5000) } },
        select: { universityId: true },
      }))
        unis.add(r.universityId);
    skipped = targets.filter((t) => t.type === 'MENTION').length;
    const source = await prisma.dataSource.findUnique({ where: { key: 'univ-sites' } });
    if (source && unis.size) {
      const { enqueueRun } = await import('@/lib/connectors/runner');
      await enqueueRun(source.id, 'manual', p.actor.id, { options: { universityIds: [...unis] } });
    }
    await setProgress(jobId, total, total);
    changed = total - skipped;
    summary = `Collecte relancée pour ${nf.format(unis.size)} établissement${unis.size > 1 ? 's' : ''} (${noun(changed)})${skipped ? ` · ${skipped} mention${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''} (pas de site à relire)` : ''}`;
    await audit(p.actor, 'SYNC', noun(total), `Resynchronisation en lot : ${summary}`, {
      action: 'a relancé la collecte de',
      target: { type: 'FICHES', id: null },
    });
    return { summary };
  }

  for (let i = 0; i < total; i += BATCH) {
    const part = targets.slice(i, i + BATCH);
    const by = (type: EntityType) => part.filter((t) => t.type === type).map((t) => t.id);
    if (p.action === 'publish' || p.action === 'unpublish') {
      const isPublished = p.action === 'publish';
      const where = (ids: string[]) => ({ id: { in: ids }, isPublished: !isPublished });
      const n =
        (await prisma.program.updateMany({ where: where(by('PROGRAM')), data: { isPublished } }))
          .count +
        (await prisma.mention.updateMany({ where: where(by('MENTION')), data: { isPublished } }))
          .count +
        (
          await prisma.university.updateMany({
            where: where(by('UNIVERSITY')),
            data: { isPublished },
          })
        ).count;
      changed += n;
      skipped += part.length - n;
      await queueIndexNow(by('PROGRAM'));
    } else if (p.action === 'ignore') {
      const n = await prisma.dataIssue.updateMany({
        where: {
          targetId: { in: part.map((t) => t.id) },
          resolvedAt: null,
          OR: [{ ignoredUntil: null }, { ignoredUntil: { lte: new Date() } }],
        },
        data: {
          ignoredUntil: new Date(Date.now() + IGNORE_DAYS * 86_400_000),
          ignoredById: p.actor.id,
        },
      });
      changed += n.count;
    }
    await setProgress(jobId, Math.min(total, i + part.length), total);
  }

  if (p.action === 'publish' || p.action === 'unpublish') {
    await refreshSearchIndex();
    await computeIssues(undefined, p.actor.id);
    await invalidateTagsRemote([TAGS.footer, TAGS.catalog, TAGS.admin]);
    summary = `${noun(changed)} ${BULK_ACTIONS[p.action].done}${skipped ? `, ${nf.format(skipped)} déjà dans cet état` : ''}`;
  } else {
    await invalidateTagsRemote([TAGS.admin]);
    summary = `${nf.format(changed)} problème${changed > 1 ? 's' : ''} ignoré${changed > 1 ? 's' : ''} ${IGNORE_DAYS} jours sur ${noun(total)}`;
  }
  await audit(
    p.actor,
    'DATA',
    noun(total),
    `Action en lot « ${BULK_ACTIONS[p.action].label} » : ${summary}`,
    {
      action: `a lancé « ${BULK_ACTIONS[p.action].label} » sur`,
      target: { type: 'FICHES', id: p.query != null ? `?${p.query}` : null },
    },
  );
  return { summary };
}

/** Types of checked fiches (programs, mentions, establishments share the id space: cuid/uuid). */
async function typesOf(ids: string[]): Promise<{ id: string; type: EntityType }[]> {
  const [p, m, u] = await Promise.all([
    prisma.program.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.mention.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.university.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  ]);
  const type = new Map<string, EntityType>([
    ...p.map((x) => [x.id, 'PROGRAM'] as const),
    ...m.map((x) => [x.id, 'MENTION'] as const),
    ...u.map((x) => [x.id, 'UNIVERSITY'] as const),
  ]);
  return ids.filter((id) => type.has(id)).map((id) => ({ id, type: type.get(id)! }));
}
