/** Shared by the Mon Master connector and its publication (no import cycle). */
import type { StagingRecord } from '@/lib/db/generated/client';
import { stagedRecords } from '@/lib/data/pipeline';

export { DATASETS, datasetUrl } from './urls';
export const MM_STAT_SOURCE = 'Mon Master · données ouvertes';
export const sourceLabel = (session: number) =>
  `Mon Master, données ouvertes du ministère de l’Enseignement supérieur, session ${session}`;

export async function allStaged(runId: string, where: Record<string, unknown> = {}) {
  const out: StagingRecord[] = [];
  for await (const rows of stagedRecords(runId, where)) out.push(...rows);
  return out;
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Sur|Sous|En|Les|La|Le|De|Du|Des|Et|Aux?)\b(?=-)/g, (w) => w.toLowerCase());
}
