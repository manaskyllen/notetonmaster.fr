/**
 * Établissements-composantes (decisions 4 and I): the parent is never set automatically from the
 * open data; it comes from a human decision, either versioned (fixtures/decisions) or taken in the
 * admin (MatchDecision, source « esr-parents »). A decision is applied as soon as both fiches
 * exist, and never replaces a parent already set.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { normCode } from './normalize';

export const PARENTS_SOURCE = 'esr-parents';

export interface ParentCandidate {
  childName: string;
  childUai: string | null;
  childPaysage?: string | null;
  parentName: string;
  parentUai: string;
  source: 'sise-diplomes' | 'rncp';
  strength: 'forte' | 'faible';
  evidence: string;
}

interface FileDecision {
  childUai: string;
  parentUai: string;
  decision: 'LINK' | 'REJECT';
}

async function fileDecisions(): Promise<{ decidedAt: string; decisions: FileDecision[] }> {
  try {
    return JSON.parse(
      await readFile(join(process.cwd(), 'fixtures/decisions/etablissements-parents.json'), 'utf8'),
    );
  } catch {
    return { decidedAt: '', decisions: [] };
  }
}

/** Every parent decision: versioned file first, then the admin decisions (which win). */
export async function parentDecisions(): Promise<
  Map<string, { parentUai: string; decision: 'LINK' | 'REJECT'; author: string }>
> {
  const out = new Map<string, { parentUai: string; decision: 'LINK' | 'REJECT'; author: string }>();
  const file = await fileDecisions();
  for (const d of file.decisions)
    out.set(normCode(d.childUai), {
      parentUai: normCode(d.parentUai),
      decision: d.decision,
      author: `décision du ${file.decidedAt}`,
    });
  for (const d of await prisma.matchDecision.findMany({ where: { sourceKey: PARENTS_SOURCE } }))
    out.set(d.recordKey.replace(/^parent:/, ''), {
      parentUai: d.targetId ?? '',
      decision: d.decision === 'LINK' ? 'LINK' : 'REJECT',
      author: d.authorLabel,
    });
  return out;
}

/** Starting list (open data), without the rejected pairs, the most reliable first. */
export async function parentCandidates(): Promise<ParentCandidate[]> {
  let list: ParentCandidate[] = [];
  try {
    const file = join(
      process.cwd(),
      'fixtures/live/esr-etablissements/etablissements-composantes-candidats.json',
    );
    list = (JSON.parse(await readFile(file, 'utf8')) as { candidates: ParentCandidate[] })
      .candidates;
  } catch {
    return [];
  }
  const decided = await parentDecisions();
  const weight = (c: ParentCandidate) =>
    Number(c.evidence.match(/(\d+) (?:lignes|fiches)/)?.[1] ?? 0);
  return list
    .filter((c) => c.childUai && decided.get(normCode(c.childUai))?.decision !== 'REJECT')
    .sort(
      (a, b) =>
        Number(b.strength === 'forte') - Number(a.strength === 'forte') ||
        weight(b) - weight(a) ||
        a.childName.localeCompare(b.childName),
    );
}

/** Applies the LINK decisions whose two fiches exist and whose child has no parent yet. */
export async function applyParentDecisions(log?: (msg: string) => Promise<void>) {
  const decisions = await parentDecisions();
  const unis = await prisma.university.findMany({
    select: { id: true, uai: true, name: true, parentId: true },
  });
  const byUai = new Map(unis.filter((u) => u.uai).map((u) => [normCode(u.uai), u]));
  let n = 0;
  for (const [childUai, d] of decisions) {
    if (d.decision !== 'LINK') continue;
    const child = byUai.get(childUai);
    const parent = byUai.get(d.parentUai);
    if (!child || !parent || child.parentId || child.id === parent.id) continue;
    await prisma.university.update({ where: { id: child.id }, data: { parentId: parent.id } });
    await prisma.fieldProvenance.upsert({
      where: {
        entityType_entityId_field: {
          entityType: 'UNIVERSITY',
          entityId: child.id,
          field: 'parentId',
        },
      },
      create: {
        entityType: 'UNIVERSITY',
        entityId: child.id,
        field: 'parentId',
        label: 'Établissement parent',
        value: parent.name,
        source: `Saisie manuelle (${d.author})`,
        sourceKey: 'manual',
        state: 'OK',
        locked: true,
        lockedAt: new Date(),
      },
      update: {},
    });
    await audit(null, 'DATA', child.name, `Établissement parent : ${parent.name} (${d.author})`);
    await log?.(`${child.name} rattachée à ${parent.name} (${d.author})`);
    n++;
  }
  return n;
}
