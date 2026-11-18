/**
 * Pipeline integration test on the test database, with a fake
 * pipeline connector: PREVIEW then APPLY, idempotence, locks, resume, blocking volume check.
 * No network: the fake connector reads an in-memory list.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { requestApply, runPipeline, stagedRecords, updateStaging } from '@/lib/data/pipeline';
import { applyFieldChange, loadProvenance, planField } from '@/lib/data/merge';
import type { RecordPlan } from '@/lib/data/diff';
import {
  emptyStats,
  type PipelineConnector,
  type RunContext,
  type SourceKey,
} from '@/lib/connectors/types';
import { FX } from '../fixtures/ids';
import { fixtureAdmin } from '../fixtures/lookup';

// A new source for each test (beforeEach): no test depends on what another one published.
let runs = 0;
let KEY = '';
const ids = (n: string) => `${KEY}-${n}`;
let rows: { id: string; capacity: number }[] = [];
let version = 'v1';
const calls = { fetch: 0, parse: 0, match: 0 };
let crashInMatch = false;
const logs: string[] = [];
const base: RunContext = {
  report: async () => {},
  log: async (l, m) => void logs.push(`${l} ${m}`),
};

const connector: PipelineConnector = {
  get key() {
    return KEY as SourceKey;
  },
  pipeline: true,
  http: { allowedDomains: ['example.test'] },
  async fetch(ctx) {
    calls.fetch++;
    const src = await prisma.dataSource.findUniqueOrThrow({ where: { id: ctx.sourceId } });
    return src.version === version
      ? { nothingNew: true, reason: 'même version', sourceVersion: version }
      : { nothingNew: false, sourceVersion: version };
  },
  async *parse() {
    calls.parse++;
    for (const r of rows) yield { recordKey: r.id, payload: r, normalized: r };
  },
  async match(ctx) {
    calls.match++;
    if (crashInMatch) {
      crashInMatch = false;
      throw new Error('panne simulée');
    }
    const upd = [];
    for await (const batch of stagedRecords(ctx.runId))
      for (const s of batch)
        upd.push({
          id: s.id,
          matchStatus: 'LINKED',
          targetType: 'PROGRAM',
          targetId: ids(s.recordKey),
        });
    await updateStaging(upd);
  },
  async merge(ctx) {
    const all = [];
    for await (const batch of stagedRecords(ctx.runId)) all.push(...batch);
    const prov = await loadProvenance(
      'PROGRAM',
      all.map((s) => s.targetId!),
    );
    await updateStaging(
      all.map((s) => {
        const p = s.payload as { capacity: number };
        const change = planField(prov, 'PROGRAM', s.targetId, 'capacity', 'Places', {
          value: p.capacity,
          sourceKey: 'monmaster-opendata',
          source: 'Test',
        });
        const plan: RecordPlan = {
          action:
            change.outcome === 'create'
              ? 'create'
              : change.outcome === 'update'
                ? 'update'
                : 'unchanged',
          target: { type: 'program', id: s.targetId, label: s.recordKey },
          changes: [change],
        };
        return { id: s.id, plan };
      }),
    );
  },
  async publish(ctx) {
    const stats = emptyStats();
    for await (const batch of stagedRecords(ctx.runId))
      for (const s of batch) {
        const plan = s.plan as unknown as RecordPlan;
        for (const c of plan.changes)
          await applyFieldChange(c, s.targetId!, 'monmaster-opendata', stats);
      }
    return stats;
  },
};

let sourceId = '';
async function newRun(mode: 'PREVIEW' | 'APPLY', force = false) {
  return prisma.syncRun.create({
    // A fresh heartbeat: the dev worker claims RUNNING runs without one as stalled (claimNextRun),
    // which made this test race with it.
    data: {
      sourceId,
      trigger: 'manual',
      mode,
      status: 'RUNNING',
      heartbeatAt: new Date(),
      stats: force ? { options: { force: true } } : undefined,
    },
    include: { source: true },
  });
}
async function exec(runId: string) {
  const run = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    include: { source: true },
  });
  return runPipeline(run, connector, base);
}
const capacityOf = async (n: string) =>
  (await prisma.fieldProvenance.findFirst({ where: { entityId: ids(n), field: 'capacity' } }))
    ?.value;

/**
 * The 10 rows of version v1 applied, the published state some tests start from. A first import
 * always goes through a validated simulation, as in the admin.
 */
async function baseline() {
  const run = await newRun('PREVIEW');
  await runPipeline(run, connector, base);
  await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED' } });
  const admin = await fixtureAdmin();
  expect((await requestApply(run.id, admin.id)).ok).toBe(true);
  expect((await exec(run.id)).published).toBe(true);
  expect(await capacityOf('p3')).toBe(13);
}

describe('pipeline PREVIEW / APPLY', () => {
  beforeEach(async () => {
    runs += 1;
    KEY = `test-pipeline-${process.pid}-${runs}`;
    version = 'v1';
    crashInMatch = false;
    sourceId = (
      await prisma.dataSource.create({
        data: {
          key: KEY,
          name: 'Test pipeline',
          host: 'example.test',
          method: 'test',
          enabled: true,
        },
      })
    ).id;
    rows = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, capacity: 10 + i }));
  });
  afterEach(async () => {
    await prisma.fieldProvenance.deleteMany({ where: { entityId: { startsWith: KEY } } });
    await prisma.dataConflict.deleteMany({ where: { entityId: { startsWith: KEY } } });
    await prisma.dataAlert.deleteMany({ where: { sourceKey: KEY } });
    await prisma.matchDecision.deleteMany({ where: { sourceKey: KEY } });
    await prisma.syncRun.deleteMany({ where: { sourceId } });
    await prisma.dataSource.delete({ where: { id: sourceId } });
  });

  it('a preview writes nothing, then « Appliquer » publishes from the same staging', async () => {
    const run = await newRun('PREVIEW');
    const out = await runPipeline(run, connector, base);
    expect(out.status).toBe('SUCCEEDED');
    expect(out.published).toBe(false);
    const diff = (await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).diff as {
      byAction: Record<string, number>;
    };
    expect(diff.byAction.create).toBe(10);
    expect(await capacityOf('p0')).toBeUndefined();

    await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED' } });
    const fetchesBefore = calls.fetch;
    const admin = await fixtureAdmin();
    expect((await requestApply(run.id, admin.id)).ok).toBe(true);
    const applied = await exec(run.id);
    expect(applied.published).toBe(true);
    expect(calls.fetch).toBe(fetchesBefore); // no new download
    expect(await capacityOf('p3')).toBe(13);
  });

  it('a second identical run says « rien de nouveau », a forced one changes nothing', async () => {
    await baseline();
    const run = await newRun('APPLY');
    const out = await runPipeline(run, connector, base);
    expect(out.summary).toMatch(/rien de nouveau/);
    const forced = await newRun('APPLY', true);
    const res = await runPipeline(forced, connector, base);
    expect(res.published).toBe(true);
    expect(res.stats.created + res.stats.updated + res.stats.conflicts).toBe(0);
    expect(res.stats.unchanged).toBe(10);
  });

  it('never overwrites a locked field', async () => {
    await baseline();
    await prisma.fieldProvenance.updateMany({
      where: { entityId: ids('p0'), field: 'capacity' },
      data: { value: 99, locked: true },
    });
    rows = rows.map((r) => (r.id === 'p0' ? { ...r, capacity: 11 } : r));
    version = 'v2';
    const res = await runPipeline(await newRun('APPLY'), connector, base);
    expect(res.stats.skippedLocked).toBe(1);
    expect(await capacityOf('p0')).toBe(99);
  });

  it('resumes an interrupted run at the step that failed', async () => {
    await baseline();
    version = 'v3';
    rows = rows.map((r) => (r.id === 'p1' ? { ...r, capacity: 12 } : r));
    const run = await newRun('APPLY');
    crashInMatch = true;
    await expect(runPipeline(run, connector, base)).rejects.toThrow('panne simulée');
    const stored = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.resumeFromStep).toBe('match');
    const parses = calls.parse;
    const out = await exec(run.id);
    expect(calls.parse).toBe(parses); // fetch and parse were not replayed
    expect(out.published).toBe(true);
    expect(await capacityOf('p1')).toBe(12);
  });

  it('refuses to apply a simulation computed before newer matching decisions', async () => {
    version = 'v3b';
    const run = await newRun('PREVIEW');
    await runPipeline(run, connector, base);
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED' } });
    await prisma.matchDecision.create({
      data: { sourceKey: KEY, recordKey: 'p9', decision: 'IGNORE', authorLabel: 'test' },
    });
    const admin = await fixtureAdmin();
    const res = await requestApply(run.id, admin.id);
    expect(res).toMatchObject({ ok: false, staleDecisions: true });
    await prisma.matchDecision.deleteMany({ where: { sourceKey: KEY } });
    expect((await requestApply(run.id, admin.id)).ok).toBe(true);
    await exec(run.id);
  });

  it('stops awaiting validation when the volume drops by 20 % or more', async () => {
    await baseline();
    version = 'v4';
    rows = rows.slice(0, 5);
    const out = await runPipeline(await newRun('APPLY'), connector, base);
    expect(out.status).toBe('AWAITING_VALIDATION');
    expect(out.summary).toMatch(/Volume anormal/);
    expect(await prisma.dataAlert.count({ where: { key: `volume-drop:${KEY}` } })).toBe(1);
  });
});
