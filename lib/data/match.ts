/**
 * Record matching. An automatic link needs the same identifiers and an identical normalised title;
 * anything else becomes a proposal to validate in the admin.
 * Universities: UAI (and former UAIs) → Paysage → normalised name + commune (score).
 * A stored MatchDecision always wins over the automatic match.
 */
import { prisma } from '@/lib/db';
import type { MatchDecision } from '@/lib/db/generated/client';
import { normCity, normCode, normText, similarity } from './normalize';

export interface Thresholds {
  high: number;
  autoLink: number;
  propose: number;
  duplicate: number;
}

export type MatchResult =
  | { status: 'LINKED'; id: string; score: number; reason: string }
  | { status: 'PROPOSED'; id: string; score: number; reason: string }
  | { status: 'NEW'; score: number; reason: string }
  | { status: 'IGNORED'; score: number; reason: string };

export async function loadDecisions(sourceKey: string): Promise<Map<string, MatchDecision>> {
  const rows = await prisma.matchDecision.findMany({ where: { sourceKey } });
  return new Map(rows.map((r) => [r.recordKey, r]));
}

/** A decision as a match result (LINK/MERGE → linked to the target, NEW, IGNORE). */
export function fromDecision(d: MatchDecision | undefined): MatchResult | null {
  if (!d) return null;
  if ((d.decision === 'LINK' || d.decision === 'MERGE') && d.targetId)
    return { status: 'LINKED', id: d.targetId, score: 1, reason: `décision de ${d.authorLabel}` };
  if (d.decision === 'NEW')
    return { status: 'NEW', score: 0, reason: `décision de ${d.authorLabel} : nouvelle fiche` };
  if (d.decision === 'IGNORE')
    return { status: 'IGNORED', score: 0, reason: `décision de ${d.authorLabel} : ignoré` };
  return null;
}

// ───────────────────────────── universities ─────────────────────────────

export interface UniRef {
  id: string;
  name: string;
  key: string; // normText(name)
  city: string; // normCity
}

export interface UniversityIndex {
  byUai: Map<string, string>;
  byPaysage: Map<string, string>;
  list: UniRef[];
}

export async function loadUniversityIndex(): Promise<UniversityIndex> {
  const [unis, ids] = await Promise.all([
    prisma.university.findMany({
      select: { id: true, name: true, uai: true, paysageId: true, city: true },
    }),
    prisma.identifier.findMany({
      where: { entityType: 'UNIVERSITY', kind: { in: ['UAI', 'PAYSAGE'] } },
    }),
  ]);
  const byUai = new Map<string, string>();
  const byPaysage = new Map<string, string>();
  for (const u of unis) {
    if (u.uai) byUai.set(normCode(u.uai), u.id);
    if (u.paysageId) byPaysage.set(u.paysageId, u.id);
  }
  for (const i of ids)
    (i.kind === 'UAI' ? byUai : byPaysage).set(
      i.kind === 'UAI' ? normCode(i.value) : i.value,
      i.entityId,
    );
  return {
    byUai,
    byPaysage,
    list: unis.map((u) => ({
      id: u.id,
      name: u.name,
      key: normText(u.name),
      city: normCity(u.city),
    })),
  };
}

export interface UniversityCandidate {
  uai?: string | null;
  oldUais?: string[];
  paysage?: string | null;
  name: string;
  commune?: string | null;
}

/** Matches a university record: UAI, former UAI, Paysage, then name + commune (similarity). */
export function matchUniversity(
  idx: UniversityIndex,
  c: UniversityCandidate,
  t: Thresholds,
): MatchResult {
  for (const u of [c.uai, ...(c.oldUais ?? [])].filter(Boolean) as string[]) {
    const id = idx.byUai.get(normCode(u));
    if (id) return { status: 'LINKED', id, score: 1, reason: `UAI ${u}` };
  }
  if (c.paysage) {
    const id = idx.byPaysage.get(c.paysage);
    if (id) return { status: 'LINKED', id, score: 1, reason: `Paysage ${c.paysage}` };
  }
  const key = normText(c.name);
  const city = normCity(c.commune);
  let best: { ref: UniRef; score: number } | null = null;
  for (const ref of idx.list) {
    let s = similarity(key, ref.key);
    if (city && ref.city && city !== ref.city) s *= 0.85; // another commune weakens the match
    if (!best || s > best.score) best = { ref, score: s };
  }
  if (best && best.score >= t.high)
    return {
      status: 'LINKED',
      id: best.ref.id,
      score: best.score,
      reason: `nom proche de « ${best.ref.name} »`,
    };
  if (best && best.score >= t.propose)
    return {
      status: 'PROPOSED',
      id: best.ref.id,
      score: best.score,
      reason: `nom proche de « ${best.ref.name} » (à valider)`,
    };
  return { status: 'NEW', score: best?.score ?? 0, reason: 'aucune fiche correspondante' };
}
