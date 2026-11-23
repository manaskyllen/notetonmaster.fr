/**
 * Pipeline runner: fetch → snapshot → parse → stage → normalize → match →
 * merge → quality → publish, each step logged, resumable after a restart (`resumeFromStep`).
 *
 * - PREVIEW stops before publish and leaves a difference report (`SyncRun.diff`);
 *   « Appliquer » requeues the same run in APPLY mode from `publish`, on the same staging.
 * - The first import of a source, an import changing more than `data.previewThresholdPercent`
 *   of the records, or a volume drop of `data.volumeDropPercent` stops in AWAITING_VALIDATION.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { SyncRun } from '@/lib/db/generated/client';
import { getSettings } from '@/lib/settings';
import { PoliteHttpClient, crawlerUserAgent } from './http';
import { effectiveMinDelaySeconds } from './robot-policy';
import { PrismaHostStore } from './host-store';
import { buildDiff, type RecordPlan } from './diff';
import {
  PIPELINE_STEPS,
  STEP_LABEL,
  emptyStats,
  type AlertInput,
  type PipelineConnector,
  type PipelineContext,
  type PipelineStep,
  type RunContext,
  type RunStats,
} from '@/lib/connectors/types';

const BATCH = 1000;

export interface PipelineOutcome {
  status: 'SUCCEEDED' | 'AWAITING_VALIDATION' | 'SKIPPED';
  summary: string;
  stats: RunStats & Record<string, unknown>;
  published: boolean;
}

/** Fingerprint of the matching decisions of a source (MatchDecision rows). */
export async function decisionsStamp(sourceKey: string): Promise<string> {
  const rows = await prisma.matchDecision.findMany({
    where: { sourceKey },
    select: { recordKey: true, decision: true, targetId: true },
    orderBy: { recordKey: 'asc' },
  });
  return createHash('sha256')
    .update(rows.map((r) => `${r.recordKey}|${r.decision}|${r.targetId ?? ''}`).join('\n'))
    .digest('hex');
}

export type CheckCounts = Record<string, { executed: number; failed: number }>;

/** Adds quality checks counts to the run (SyncRun.stats.checks), whatever step runs them. */
export async function recordChecks(
  runId: string,
  add: CheckCounts,
  opts: { replace?: boolean } = {},
) {
  const run = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    select: { stats: true },
  });
  const stats = (run.stats ?? {}) as { checks?: CheckCounts };
  const checks: CheckCounts = { ...(stats.checks ?? {}) };
  for (const [k, v] of Object.entries(add)) {
    const c = opts.replace ? { executed: 0, failed: 0 } : (checks[k] ?? { executed: 0, failed: 0 });
    checks[k] = { executed: c.executed + v.executed, failed: c.failed + v.failed };
  }
  await prisma.syncRun.update({
    where: { id: runId },
    data: { stats: { ...stats, checks } as never },
  });
}

/** Opens or updates an alert with a stable key (never duplicated while open). */
export async function upsertAlert(sourceKey: string, a: AlertInput) {
  const data = {
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    link: a.link ?? null,
    linkLabel: a.linkLabel ?? null,
    code: a.code,
    sourceKey,
    entityType: a.entityType ?? null,
    entityId: a.entityId ?? null,
    count: a.count ?? null,
  };
  const existing = await prisma.dataAlert.findUnique({ where: { key: a.key } });
  if (!existing) await prisma.dataAlert.create({ data: { key: a.key, ...data } });
  else if (existing.resolvedAt == null)
    await prisma.dataAlert.update({ where: { key: a.key }, data });
  // A resolved alert stays resolved: the same problem found again is not reopened silently.
}

export function makeHttp(
  connector: PipelineConnector,
  ctx: Pick<RunContext, 'log'>,
  minDelaySeconds: number,
  alert: (a: AlertInput) => Promise<void>,
) {
  return new PoliteHttpClient({
    userAgent: crawlerUserAgent(),
    allowedDomains: connector.http.allowedDomains,
    openDataExceptions: connector.http.openDataExceptions,
    deniedHosts: connector.http.deniedHosts,
    minDelayMs: effectiveMinDelaySeconds(minDelaySeconds) * 1000,
    store: new PrismaHostStore(),
    onEvent: async (e) => {
      if (e.type === 'skip') await ctx.log('SKIP', `${e.url} : ${e.reason}`);
      else if (e.type === 'open-data-exception')
        await ctx.log(
          'INFO',
          `exception données ouvertes (ressource officielle, Licence Ouverte) : ${e.url}`,
        );
      else if (e.type === 'retry')
        await ctx.log(
          'WARN',
          `${e.url} : HTTP ${e.status ?? 'erreur réseau'}, nouvel essai dans ${Math.round(e.waitMs / 1000)} s (${e.attempt})`,
        );
      else if (e.type === 'host-paused') {
        await ctx.log(
          'ERROR',
          `${e.host} mis en pause jusqu'au ${e.until.toISOString()} : ${e.reason}`,
        );
        await alert({
          key: `host-paused:${e.host}`,
          code: 'host-paused',
          severity: 'ERROR',
          title: `Site en pause : ${e.host}`,
          detail: `${e.reason}. Aucune requête pendant 24 h.`,
          link: '/admin/recuperation',
          linkLabel: 'Voir',
        });
      } else if (e.type === 'robots-changed') {
        await ctx.log('WARN', `robots.txt modifié sur ${e.host}`);
        await alert({
          key: `robots-changed:${e.host}:${new Date().toISOString().slice(0, 10)}`,
          code: 'robots-changed',
          severity: 'WARNING',
          title: `robots.txt modifié : ${e.host}`,
          detail:
            'Le fichier robots.txt a changé depuis la dernière lecture. Vérifier que la collecte reste autorisée.',
          link: '/admin/recuperation',
          linkLabel: 'Voir',
        });
      }
    },
  });
}

/** Bulk update of staged records (one SQL statement per 1 000 rows). */
export async function updateStaging(
  rows: {
    id: string;
    matchStatus?: string | null;
    matchScore?: number | null;
    matchReason?: string | null;
    matchInfo?: Record<string, unknown> | null;
    targetType?: string | null;
    targetId?: string | null;
    plan?: RecordPlan | null;
    appliedAt?: Date | null;
  }[],
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const has = (k: keyof (typeof rows)[number]) => chunk.some((r) => k in r);
    const sets: string[] = [];
    if (has('matchStatus')) sets.push(`"matchStatus" = v."matchStatus"::"MatchStatus"`);
    if (has('matchScore')) sets.push(`"matchScore" = v."matchScore"`);
    if (has('matchReason')) sets.push(`"matchReason" = v."matchReason"`);
    if (has('matchInfo')) sets.push(`"matchInfo" = v."matchInfo"`);
    if (has('targetType')) sets.push(`"targetType" = v."targetType"`);
    if (has('targetId')) sets.push(`"targetId" = v."targetId"`);
    if (has('plan')) sets.push(`"plan" = v."plan"`);
    if (has('appliedAt')) sets.push(`"appliedAt" = v."appliedAt"`);
    if (!sets.length) continue;
    // raw-sql: SET list built from fixed column names; every value is in the $1 jsonb batch.
    await prisma.$executeRawUnsafe(
      `UPDATE "StagingRecord" AS s SET ${sets.join(', ')}
       FROM jsonb_to_recordset($1::jsonb) AS v(id text, "matchStatus" text, "matchScore" float8, "matchReason" text, "matchInfo" jsonb, "targetType" text, "targetId" text, "plan" jsonb, "appliedAt" timestamptz)
       WHERE s.id = v.id`,
      JSON.stringify(chunk),
    );
  }
}

/** Iterates the staged records of a run in id order, by batches. */
export async function* stagedRecords(runId: string, where: Record<string, unknown> = {}) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.stagingRecord.findMany({
      where: { runId, ...where },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) return;
    yield rows;
    cursor = rows[rows.length - 1]!.id;
  }
}

async function setStep(runId: string, step: PipelineStep, progress: number) {
  await prisma.syncRun.update({
    where: { id: runId },
    data: { step: STEP_LABEL[step], progress, heartbeatAt: new Date(), resumeFromStep: step },
  });
}

/**
 * Runs (or resumes) a pipeline run. The caller (runner) records the final status, the audit and
 * the search index refresh.
 */
export async function runPipeline(
  run: SyncRun & { source: { id: string; key: string; version: string | null } },
  connector: PipelineConnector,
  base: RunContext,
): Promise<PipelineOutcome> {
  const settings = await getSettings();
  const alerts: AlertInput[] = [];
  const alert = async (a: AlertInput) => {
    alerts.push(a);
    await upsertAlert(connector.key, a);
  };
  const options = ((run.stats as { options?: { force?: boolean } } | null)?.options ?? {}) as {
    force?: boolean;
  };
  const ctx: PipelineContext = {
    ...base,
    runId: run.id,
    sourceKey: connector.key,
    sourceId: run.sourceId,
    mode: run.mode,
    force: !!options.force,
    http: undefined as never,
    alert,
    alerts,
  };
  ctx.http = makeHttp(connector, base, settings['collect.minDelaySeconds'], alert);

  const start = PIPELINE_STEPS.indexOf((run.resumeFromStep as PipelineStep) ?? 'fetch');
  if (start > 0)
    await base.log('INFO', `reprise à l'étape « ${STEP_LABEL[PIPELINE_STEPS[start]!]} »`);
  const stats: RunStats & Record<string, unknown> = {
    ...emptyStats(),
    ...(options.force ? { options } : {}),
  };

  for (let i = Math.max(0, start); i < PIPELINE_STEPS.length; i++) {
    const step = PIPELINE_STEPS[i]!;
    await setStep(run.id, step, Math.round((i / PIPELINE_STEPS.length) * 100));
    await base.log('INFO', `étape ${STEP_LABEL[step]}`);

    if (step === 'fetch') {
      const out = await connector.fetch(ctx);
      if (out.nothingNew && !ctx.force) {
        await prisma.syncRun.update({
          where: { id: run.id },
          data: {
            sourceVersion: out.sourceVersion ?? run.source.version,
            diff: { nothingNew: true, reason: out.reason },
          },
        });
        return {
          status: 'SUCCEEDED',
          summary: `rien de nouveau (${out.reason})`,
          stats,
          published: false,
        };
      }
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { sourceVersion: out.sourceVersion ?? null },
      });
    }

    if (step === 'parse') {
      await prisma.stagingRecord.deleteMany({ where: { runId: run.id } });
      // checks are recounted when the records are read again
      const cur = (await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).stats as {
        checks?: unknown;
      } | null;
      if (cur?.checks)
        await prisma.syncRun.update({
          where: { id: run.id },
          data: { stats: { ...cur, checks: {} } as never },
        });
      const snapshots = await prisma.rawSnapshot.findMany({
        where: { runId: run.id },
        orderBy: { fetchedAt: 'asc' },
      });
      if (!snapshots.length) {
        // forced run on an unchanged source: reuse the latest snapshots of the source
        const last = await prisma.rawSnapshot.findMany({
          where: { sourceId: run.sourceId },
          orderBy: { fetchedAt: 'desc' },
          distinct: ['url'],
        });
        snapshots.push(...last);
      }
      let buffer: {
        runId: string;
        sourceKey: string;
        recordKey: string;
        payload: never;
        normalized: never;
      }[] = [];
      let n = 0;
      const seen = new Set<string>();
      const duplicates: string[] = [];
      let duplicateCount = 0;
      for await (const rec of connector.parse(ctx, snapshots)) {
        if (seen.has(rec.recordKey)) {
          if (duplicates.length < 5) duplicates.push(rec.recordKey);
          duplicateCount++;
          continue;
        }
        seen.add(rec.recordKey);
        buffer.push({
          runId: run.id,
          sourceKey: connector.key,
          recordKey: rec.recordKey,
          payload: rec.payload as never,
          normalized: (rec.normalized ?? null) as never,
        });
        if (buffer.length >= BATCH) {
          await prisma.stagingRecord.createMany({ data: buffer });
          n += buffer.length;
          buffer = [];
          await prisma.syncRun.update({
            where: { id: run.id },
            data: { heartbeatAt: new Date(), step: `${STEP_LABEL.parse} · ${n} lignes` },
          });
        }
      }
      if (buffer.length) await prisma.stagingRecord.createMany({ data: buffer });
      n += buffer.length;
      if (duplicateCount)
        await base.log(
          'WARN',
          `${duplicateCount} lignes en double ignorées (même clé), par exemple ${duplicates.join(', ')}`,
        );
      await recordChecks(
        run.id,
        {
          'Clé unique par enregistrement': { executed: n + duplicateCount, failed: duplicateCount },
        },
        { replace: true },
      );
      stats.records = n;
      await base.log('OK', `${n} enregistrements mis en attente (staging)`);
    }

    if (step === 'match') {
      await connector.match(ctx);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { decisionsStamp: await decisionsStamp(connector.key) },
      });
    }
    if (step === 'merge') {
      await connector.merge(ctx);
      const plans: { recordKey: string; plan: RecordPlan | null }[] = [];
      for await (const rows of stagedRecords(run.id))
        for (const r of rows)
          plans.push({ recordKey: r.recordKey, plan: r.plan as RecordPlan | null });
      const diff = buildDiff(plans);
      await prisma.syncRun.update({ where: { id: run.id }, data: { diff: diff as never } });
    }

    if (step === 'quality') {
      const blocking: string[] = [];
      const own = await connector.quality?.(ctx);
      if (own?.blocking) blocking.push(own.blocking);
      const current = await prisma.stagingRecord.count({ where: { runId: run.id } });
      const previous = await prisma.syncRun.findFirst({
        where: { sourceId: run.sourceId, appliedAt: { not: null }, id: { not: run.id } },
        orderBy: { appliedAt: 'desc' },
      });
      const prevCount = Number((previous?.stats as { records?: number } | null)?.records ?? 0);
      const dropPct = settings['data.volumeDropPercent'];
      if (prevCount && current < prevCount * (1 - dropPct / 100)) {
        const msg = `Volume anormal : ${current} lignes contre ${prevCount} au passage précédent (−${Math.round((1 - current / prevCount) * 100)} %)`;
        blocking.push(msg);
        await alert({
          key: `volume-drop:${connector.key}`,
          code: 'volume-drop',
          severity: 'ERROR',
          title: `Volume anormal · ${connector.key}`,
          detail: msg,
          link: '/admin/recuperation',
          linkLabel: 'Voir le rapport',
        });
      }
      await recordChecks(
        run.id,
        {
          [`Volume (baisse ≥ ${dropPct} % des lignes)`]: {
            executed: prevCount ? 1 : 0,
            failed: blocking.some((b) => b.startsWith('Volume')) ? 1 : 0,
          },
          'Seuil de simulation obligatoire': { executed: 1, failed: 0 },
        },
        { replace: true },
      );
      const fresh = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const diff = (fresh.diff ?? {}) as {
        changeRatio?: number;
        alerts?: unknown;
        byAction?: Record<string, number>;
      };
      const checks = ((fresh.stats ?? {}) as { checks?: CheckCounts }).checks ?? {};
      await prisma.syncRun.update({
        where: { id: run.id },
        data: {
          diff: {
            ...diff,
            checks,
            alerts: alerts.map((a) => ({ code: a.code, title: a.title, count: a.count ?? 1 })),
          } as never,
          stats: { ...(fresh.stats as object), ...stats, checks, records: current } as never,
        },
      });
      stats.records = current;
      const firstImport = !previous;
      const ratio = diff.changeRatio ?? 0;
      const threshold = settings['data.previewThresholdPercent'] / 100;
      const mandatory = firstImport || ratio > threshold;
      if (blocking.length && !fresh.validatedAt) {
        await base.log('WARN', `contrôle bloquant : ${blocking.join(' ; ')}`);
        await prisma.syncRun.update({ where: { id: run.id }, data: { resumeFromStep: 'publish' } });
        return {
          status: 'AWAITING_VALIDATION',
          summary: `en attente de validation · ${blocking.join(' ; ')}`,
          stats,
          published: false,
        };
      }
      if (ctx.mode === 'PREVIEW') {
        await prisma.syncRun.update({ where: { id: run.id }, data: { resumeFromStep: 'publish' } });
        return {
          status: 'SUCCEEDED',
          summary: `simulation terminée · ${summarise(diff)}`,
          stats,
          published: false,
        };
      }
      if (mandatory && !fresh.validatedAt) {
        const why = firstImport
          ? 'premier import de la source'
          : `${Math.round(ratio * 100)} % des fiches modifiées (seuil ${settings['data.previewThresholdPercent']} %)`;
        await base.log('WARN', `simulation à valider avant application : ${why}`);
        await prisma.syncRun.update({
          where: { id: run.id },
          data: { resumeFromStep: 'publish', mode: 'PREVIEW' },
        });
        return {
          status: 'AWAITING_VALIDATION',
          summary: `simulation à valider (${why})`,
          stats,
          published: false,
        };
      }
    }

    if (step === 'publish') {
      const res = await connector.publish(ctx);
      Object.assign(stats, res);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { appliedAt: new Date(), resumeFromStep: null },
      });
      const fresh = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      if (fresh.sourceVersion)
        await prisma.dataSource.update({
          where: { id: run.sourceId },
          data: { version: fresh.sourceVersion },
        });
      return {
        status: 'SUCCEEDED',
        summary: `${res.created} créés, ${res.updated} mis à jour, ${res.unchanged} inchangés, ${res.skippedLocked} verrouillés, ${res.conflicts} conflits`,
        stats,
        published: true,
      };
    }
  }
  return { status: 'SUCCEEDED', summary: 'terminé', stats, published: false };
}

function summarise(diff: { byAction?: Record<string, number> }) {
  const a = diff.byAction ?? {};
  return `${a.create ?? 0} créations, ${a.update ?? 0} modifications, ${a.unchanged ?? 0} inchangés, ${(a.proposal ?? 0) + (a['merge-proposal'] ?? 0)} propositions`;
}

/**
 * Decision G: a decision requeues the simulation of its source from the match step (same staging,
 * no download), so « Appliquer » always works on a simulation that includes it.
 */
export async function requeueSimulations(sourceKeys: string[]) {
  const out: string[] = [];
  for (const key of new Set(sourceKeys)) {
    const run = await prisma.syncRun.findFirst({
      where: { source: { key }, staging: { some: {} } },
      orderBy: { queuedAt: 'desc' },
    });
    if (!run || run.appliedAt || ['QUEUED', 'RUNNING'].includes(run.status)) continue;
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        mode: 'PREVIEW',
        status: 'QUEUED',
        resumeFromStep: 'match',
        finishedAt: null,
        progress: 0,
        validatedAt: null,
        validatedById: null,
      },
    });
    out.push(key);
  }
  return out;
}

/** Validation by the Données role: requeues a PREVIEW / AWAITING_VALIDATION run from publish. */
export async function requestApply(runId: string, adminId: string) {
  const run = await prisma.syncRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false as const, error: 'Passage inconnu.' };
  if (run.appliedAt) return { ok: false as const, error: 'Ce passage a déjà été appliqué.' };
  if (
    run.resumeFromStep !== 'publish' ||
    !['SUCCEEDED', 'AWAITING_VALIDATION'].includes(run.status)
  )
    return { ok: false as const, error: 'Rien à appliquer : lancez d’abord une simulation.' };
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: run.sourceId } });
  if (run.decisionsStamp && run.decisionsStamp !== (await decisionsStamp(source.key)))
    return {
      ok: false as const,
      error:
        'Des décisions de rapprochement ont été prises depuis cette simulation : recalculez-la avant d’appliquer.',
      staleDecisions: true,
    };
  const newer = await prisma.syncRun.findFirst({
    where: {
      sourceId: run.sourceId,
      queuedAt: { gt: run.queuedAt },
      status: { notIn: ['FAILED', 'SKIPPED'] },
    },
  });
  if (newer)
    return { ok: false as const, error: 'Un passage plus récent existe : simulez de nouveau.' };
  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      mode: 'APPLY',
      status: 'QUEUED',
      validatedById: adminId,
      validatedAt: new Date(),
      finishedAt: null,
      progress: 0,
    },
  });
  return { ok: true as const, runId };
}
