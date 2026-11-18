/** CrawlHost-backed HostStore: robots.txt cache and pauses shared by every worker. */
import { prisma } from '@/lib/db';
import type { HostState, HostStore } from './http';
import type { TdmRule } from './tdm';

export class PrismaHostStore implements HostStore {
  async get(host: string): Promise<HostState | null> {
    const r = await prisma.crawlHost.findUnique({ where: { host } });
    if (!r) return null;
    return { ...r, tdmrep: (r.tdmrep as TdmRule[] | null) ?? null };
  }
  async save(host: string, patch: Partial<HostState>) {
    const data = {
      ...patch,
      tdmrep: patch.tdmrep === undefined ? undefined : (patch.tdmrep as never),
    };
    delete (data as { host?: string }).host;
    await prisma.crawlHost.upsert({ where: { host }, create: { host, ...data }, update: data });
  }
}
