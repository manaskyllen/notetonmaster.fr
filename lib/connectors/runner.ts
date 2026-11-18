import { audit } from '@/lib/audit';
import { invalidateTagsRemote, TAGS } from '@/lib/cache/tags';
import { refreshSearchIndex } from '@/lib/search-index';
import { prisma } from '@/lib/db';
import { notifyAdmins } from '@/lib/admin/notify';
import { runPipeline, upsertAlert } from '@/lib/data/pipeline';
import { computeIssues } from '@/lib/admin/issues';
import { getConnector } from './registry';
import { emptyStats, isPipeline, type RunContext } from './types';

/** A RUNNING run whose heartbeat is older than this is considered abandoned and resumed. */
export const STALE_RUN_MS = 10 * 60 * 1000;

/** Claims the next queued (or abandoned) sync run. */
export async function claimNextRun() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SyncRun"
      WHERE status = 'QUEUED' OR (status = 'RUNNING' AND ("heartbeatAt" IS NULL OR "heartbeatAt" < now() - make_interval(secs => ${STALE_RUN_MS / 1000})))
      ORDER BY "queuedAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) return null;
    return tx.syncRun.update({
      where: { id: rows[0].id },
      data: { status: 'RUNNING', startedAt: new Date(), heartbeatAt: new Date() },
      include: { source: true },
    });
  });
}

/** Executes a claimed run with its connector and records progress, logs and outcome. */
export async function executeRun(run: NonNullable<Awaited<ReturnType<typeof claimNextRun>>>) {
  const connector = await getConnector(run.source.key, run.resumeFromStep);
  const ctx: RunContext = {
    mode: run.mode,
    report: async ({ progress, step }) => {
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          step,
          heartbeatAt: new Date(),
        },
      });
    },
    log: async (level, message) => {
      await prisma.syncLog.create({
        data: { runId: run.id, level, message: message.slice(0, 2000) },
      });
    },
  };
  const resuming = !!run.resumeFromStep;
  await ctx.log(
    'START',
    `${run.mode === 'PREVIEW' ? 'simulation' : resuming && run.resumeFromStep === 'publish' ? 'application' : 'passage'} · ${
      run.trigger === 'manual'
        ? 'lancement manuel'
        : run.trigger === 'all'
          ? 'synchronisation générale'
          : 'lancement planifié'
    }`,
  );
  try {
    if (!run.source.enabled && run.trigger !== 'manual') {
      await finish(run.id, 'SKIPPED', emptyStats());
      await ctx.log('SKIP', 'source désactivée');
      return;
    }
    if (!connector) {
      await finish(run.id, 'SKIPPED', emptyStats());
      await ctx.log('SKIP', 'pas encore de connecteur réel pour cette source');
      return;
    }
    if (isPipeline(connector)) {
      const out = await runPipeline(run, connector, ctx);
      const prev = (await prisma.syncRun.findUnique({ where: { id: run.id } }))?.stats as
        object | null;
      await finish(run.id, out.status, { ...(prev ?? {}), ...out.stats });
      await ctx.log(out.status === 'AWAITING_VALIDATION' ? 'WARN' : 'OK', out.summary);
      if (out.published) {
        await refreshSearchIndex({ sectors: true });
        await invalidateTagsRemote([TAGS.footer, TAGS.catalog]);
      }
      await prisma.dataSource.update({
        where: { id: run.sourceId },
        data: { lastRunAt: new Date() },
      });
      await audit(null, 'SYNC', run.source.name, out.summary, {
        action: 'a mis à jour les données de',
        target: { type: 'SOURCE', id: run.source.key },
      });
      return;
    }
    const result = await connector.run(ctx);
    await finish(run.id, result.status, result.stats);
    if (result.status === 'SUCCEEDED') {
      await ctx.log('OK', `terminé · ${result.summary}`);
      await refreshSearchIndex({ sectors: true });
      await invalidateTagsRemote([TAGS.footer, TAGS.catalog]);
    }
    await prisma.dataSource.update({
      where: { id: run.sourceId },
      data: { lastRunAt: new Date() },
    });
    await audit(null, 'SYNC', run.source.name, result.summary, {
      action: 'a mis à jour les données de',
      target: { type: 'SOURCE', id: run.source.key },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message || err.stack || err.name : String(err);
    const message = String(raw || 'erreur sans message').slice(0, 300);
    if (process.env.NODE_ENV !== 'production') console.error('[sync]', err);
    await ctx.log('ERROR', message);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    });
    await audit(null, 'SYNC', run.source.name, `Échec : ${message}`, {
      action: 'a échoué à lire',
      target: { type: 'SOURCE', id: run.source.key },
    });
    await notifyAdmins(
      'sync.failed',
      `Échec de la récupération « ${run.source.name} »`,
      message,
      '/admin/recuperation',
    );
    const last = await prisma.syncRun.findMany({
      where: {
        sourceId: run.sourceId,
        status: { in: ['SUCCEEDED', 'FAILED', 'AWAITING_VALIDATION'] },
      },
      orderBy: { queuedAt: 'desc' },
      take: 3,
      select: { status: true },
    });
    if (last.length === 3 && last.every((r) => r.status === 'FAILED'))
      await upsertAlert(run.source.key, {
        key: `source-failing:${run.source.key}`,
        code: 'source-failing',
        severity: 'ERROR',
        title: `Source en échec 3 fois de suite : ${run.source.name}`,
        detail: `Dernière erreur : ${message}`,
        link: '/admin/recuperation',
        linkLabel: 'Voir le journal',
      });
  } finally {
    // Data problems of the admin: recomputed after every pass, never on read.
    await computeIssues().catch((e) => console.error('[issues]', e));
    await invalidateTagsRemote([TAGS.admin]);
  }
}

async function finish(
  runId: string,
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED' | 'AWAITING_VALIDATION',
  stats: object,
) {
  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      status,
      progress: 100,
      step: null,
      finishedAt: new Date(),
      heartbeatAt: new Date(),
      stats: stats as never,
    },
  });
}

/** Queues a run unless one is already queued/running for that source. */
export async function enqueueRun(
  sourceId: string,
  trigger: 'manual' | 'schedule' | 'all',
  triggeredById?: string,
  opts: { mode?: 'PREVIEW' | 'APPLY'; force?: boolean; options?: Record<string, unknown> } = {},
) {
  const active = await prisma.syncRun.findFirst({
    where: { sourceId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (active) return active;
  return prisma.syncRun.create({
    data: {
      sourceId,
      trigger,
      triggeredById,
      mode: opts.mode ?? 'APPLY',
      stats:
        opts.force || opts.options
          ? { options: { ...(opts.force ? { force: true } : {}), ...opts.options } }
          : undefined,
    },
  });
}
