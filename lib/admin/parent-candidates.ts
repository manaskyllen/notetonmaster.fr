import 'server-only';
import { prisma } from '@/lib/db';
import { normCode } from '@/lib/data/normalize';
import { parentCandidates } from '@/lib/data/parents';

/**
 * Parent suggestions for a university (decision 4): starting list deduced from the open data,
 * without the rejected pairs, the most reliable first. Nothing is applied without a human.
 */
export async function parentSuggestions(university: {
  id: string;
  uai: string | null;
  parentId: string | null;
}) {
  if (!university.uai || university.parentId) return [];
  const mine = (await parentCandidates()).filter(
    (c) => c.childUai && normCode(c.childUai) === normCode(university.uai!),
  );
  const out = [];
  for (const c of mine) {
    const parent = await prisma.university.findFirst({
      where: { uai: normCode(c.parentUai), id: { not: university.id } },
    });
    if (parent)
      out.push({
        parentId: parent.id,
        parentName: parent.name,
        strength: c.strength,
        evidence: c.evidence,
      });
  }
  return out;
}
