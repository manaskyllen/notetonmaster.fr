/**
 * Names of the national mentions from the RNCP (decision D): a mention created by Mon Master takes
 * the title of its active « fiche nationale » (accents, case), so names and slugs are final from
 * the first publication. Sources: the Certification table (applied RNCP) and the latest RNCP
 * staging (a simulation is enough: nothing has to be applied first).
 */
import { prisma } from '@/lib/db';
import { normMention, similarity } from '@/lib/data/normalize';

export interface RncpName {
  code: string;
  title: string;
}

/** "Culture, patrimoine et médiation (fiche nationale)" → "Culture, patrimoine et médiation". */
export function mentionTitleFromRncp(intitule: string): string {
  return intitule
    .replace(/\(\s*fiche nationale\s*\)/i, '')
    .replace(/^\s*master\s+(mention\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function mentionNames(): Promise<Map<string, RncpName>> {
  const out = new Map<string, RncpName>();
  const add = (code: string, title: string) => {
    const name = mentionTitleFromRncp(title);
    const key = normMention(name);
    if (key && !out.has(key)) out.set(key, { code, title: name });
  };
  for (const c of await prisma.certification.findMany({
    where: { status: 'ACTIVE', level: 7 },
    orderBy: { code: 'desc' },
  }))
    add(c.code, c.title);
  const run = await prisma.syncRun.findFirst({
    where: { source: { key: 'rncp' }, staging: { some: {} } },
    orderBy: { queuedAt: 'desc' },
    select: { id: true },
  });
  if (run)
    for (const s of await prisma.stagingRecord.findMany({
      where: { runId: run.id },
      select: { normalized: true },
    })) {
      const n = s.normalized as {
        code?: string;
        title?: string;
        active?: boolean;
        master?: boolean;
      } | null;
      if (n?.code && n.title && n.active && n.master) add(n.code, n.title);
    }
  return out;
}

/** RNCP name of a mention key: exact normalised title, else trigram similarity ≥ 0.92 (§5.2). */
export function lookupRncpName(
  names: Map<string, RncpName>,
  key: string,
  min = 0.92,
): RncpName | null {
  const exact = names.get(key);
  if (exact) return exact;
  let best: { n: RncpName; s: number } | null = null;
  for (const [k, n] of names) {
    const s = similarity(k, key);
    if (s >= min && (!best || s > best.s)) best = { n, s };
  }
  return best?.n ?? null;
}
