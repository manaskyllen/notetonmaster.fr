/**
 * Background worker: same image as the app, different command.
 * - generic jobs (Job table: data export…)
 * - sync runs (SyncRun table) executed with the source connectors
 * - schedules: syncs by cron, daily maintenance (retention purges, inactive accounts)
 */
import { assertEnv } from '../lib/env';
import { prisma } from '../lib/db';
import { claimNextRun, executeRun } from '../lib/connectors/runner';
import { runNextJob } from './jobs';
import { flushIndexNow } from '../lib/seo/indexnow';
import {
  dailyMaintenance,
  scheduleSyncs,
  weeklyDigest,
  weeklyQuestionDigest,
  yearlyZoneCommunes,
} from './schedule';

// Refuses to start on a missing, development or demo configuration in production (lib/env.ts).
assertEnv();

const POLL_MS = 1_500;
const SCHEDULE_EVERY_MS = 60_000;
let stopping = false;
let lastSchedule = 0;

async function tick() {
  const run = await claimNextRun();
  if (run) {
    console.log(`[worker] sync ${run.source.key} (${run.id})`);
    await executeRun(run);
  }
  if (Date.now() - lastSchedule > SCHEDULE_EVERY_MS) {
    lastSchedule = Date.now();
    await scheduleSyncs();
    await dailyMaintenance();
    await weeklyDigest();
    await weeklyQuestionDigest();
    await yearlyZoneCommunes();
    // At most one IndexNow request a minute, every queued address merged (lib/seo/indexnow.ts).
    await flushIndexNow().catch((e) => console.error('[worker] indexnow failed', e));
  }
}

/**
 * Jobs (bulk actions of the admin, exports) have their own loop: a sync run can last an hour,
 * a bulk action never waits for it.
 */
async function jobLoop() {
  while (!stopping) {
    try {
      while (!stopping && (await runNextJob())) {
        /* drain jobs */
      }
    } catch (err) {
      console.error('[worker] job loop failed', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  console.log(`[worker] started (connectors: ${process.env.CONNECTORS_MODE ?? 'mock'})`);
  const jobs = jobLoop();
  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      console.error('[worker] tick failed', err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await jobs;
  await prisma.$disconnect();
  console.log('[worker] stopped');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

void main();
