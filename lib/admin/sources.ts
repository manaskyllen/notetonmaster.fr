import 'server-only';
import { prisma } from '@/lib/db';
import { SOURCE_ORDER, type SourceKey } from '@/lib/connectors/types';

export type SourceHealth = 'ok' | 'running' | 'warning' | 'error';

export const SOURCE_HEALTH_LABEL: Record<SourceHealth, string> = {
  ok: 'À jour',
  running: 'En cours',
  warning: 'Dégradée',
  error: 'Bloquée',
};

/** Sources with their health, derived from their state and last run. */
export async function getSourcesWithHealth() {
  const sources = await prisma.dataSource.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      runs: {
        orderBy: { queuedAt: 'desc' },
        take: 1,
        include: { logs: { where: { level: { in: ['WARN', 'ERROR'] } }, select: { level: true } } },
      },
    },
  });
  const order = (k: string) => {
    const i = SOURCE_ORDER.indexOf(k as SourceKey);
    return i < 0 ? 99 : i;
  };
  sources.sort((a, b) => order(a.key) - order(b.key));
  return sources.map((s) => {
    const last = s.runs[0] ?? null;
    let health: SourceHealth = 'ok';
    if (!s.enabled && s.blockedReason) health = 'error';
    else if (last && (last.status === 'RUNNING' || last.status === 'QUEUED')) health = 'running';
    else if (last?.status === 'FAILED') health = 'error';
    else if (last?.status === 'AWAITING_VALIDATION') health = 'warning';
    else if (last?.logs.some((l) => l.level === 'WARN')) health = 'warning';
    return { ...s, last, health };
  });
}
