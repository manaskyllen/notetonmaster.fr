/**
 * Runs one sync in this process, without the worker:
 *   pnpm tsx scripts/data-run.ts <source> [preview|apply] [--force] [--templates A,B] [--apply-run <runId>]
 * --templates (univ-sites) : limits the run to these templates (AMETYS_ODF_HTML, KSUP, DRUPAL…).
 * Used by `make data-smoke` / `make data-national-preview` (CONNECTORS_MODE=live, PREVIEW: nothing
 * is published). Prints the difference report.
 */
import { prisma } from '../lib/db';
import { executeRun } from '../lib/connectors/runner';

async function main() {
  const args = process.argv.slice(2);
  const applyIdx = args.indexOf('--apply-run');
  let runId: string;
  if (applyIdx >= 0) {
    runId = args[applyIdx + 1]!;
    const admin = await prisma.adminUser.findFirstOrThrow({
      where: { role: { in: ['ADMIN', 'DATA_EDITOR'] } },
    });
    const { requestApply } = await import('../lib/data/pipeline');
    const res = await requestApply(runId, admin.id);
    if (!res.ok) throw new Error(res.error);
  } else {
    const key = args[0];
    const mode = (args[1] ?? 'preview').toUpperCase() === 'APPLY' ? 'APPLY' : 'PREVIEW';
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key } });
    const tIdx = args.indexOf('--templates');
    const options = {
      ...(args.includes('--force') ? { force: true } : {}),
      ...(tIdx >= 0 ? { templates: (args[tIdx + 1] ?? '').split(',').filter(Boolean) } : {}),
    };
    const run = await prisma.syncRun.create({
      data: {
        sourceId: source.id,
        trigger: 'manual',
        mode,
        stats: Object.keys(options).length ? { options } : undefined,
      },
    });
    runId = run.id;
  }
  const run = await prisma.syncRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date(), heartbeatAt: new Date() },
    include: { source: true },
  });
  console.log(
    `[data-run] ${run.source.key} · ${run.mode} · run ${run.id} (CONNECTORS_MODE=${process.env.CONNECTORS_MODE ?? 'mock'})`,
  );
  await executeRun(run);
  const done = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    include: { logs: { orderBy: { at: 'asc' } } },
  });
  for (const l of done.logs) console.log(`  ${l.level.padEnd(5)} ${l.message}`);
  console.log(`[data-run] statut : ${done.status}`);
  console.log(
    JSON.stringify(
      {
        stats: done.stats,
        diff: done.diff && {
          ...(done.diff as object),
          samples: ((done.diff as { samples?: unknown[] }).samples ?? []).slice(0, 15),
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
