'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import {
  filterProposals,
  loadProposals,
  notRenewedPrograms,
  type ProposalFilters,
  type ProposalItem,
} from '@/lib/admin/proposals';
import { prisma } from '@/lib/db';
import { requeueSimulations as autoRecompute } from '@/lib/data/pipeline';

const keysSchema = z.array(z.string().min(1).max(200)).min(1).max(2000);

/** The decision a validation (or a rejection) of a proposal means. */
function decisionFor(item: ProposalItem, accept: boolean) {
  if (!accept) {
    // Rejected: a separate fiche for the latest session; history only for an older number.
    if (
      (item.type === 'succession' && !item.latestSession) ||
      item.type === 'mention' ||
      item.type === 'page'
    )
      return { decision: 'IGNORE' as const, targetId: null };
    return { decision: 'NEW' as const, targetId: null };
  }
  const target = item.right?.id ?? null;
  if (item.type === 'merge')
    return {
      decision: 'MERGE' as const,
      targetId: target ?? (item.targetIfc ? `ifc:${item.targetIfc}` : null),
    };
  return { decision: 'LINK' as const, targetId: target };
}

async function record(items: ProposalItem[], accept: boolean, admin: { id: string; name: string }) {
  let n = 0;
  for (const item of items) {
    const d = decisionFor(item, accept);
    if (accept && !d.targetId) continue;
    if (item.type === 'merge')
      await prisma.dataConflict.updateMany({
        where: { key: `merge:${item.key}`, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolvedById: admin.id,
          resolvedOption: accept ? 'merge' : 'split',
        },
      });
    await prisma.matchDecision.upsert({
      where: { sourceKey_recordKey: { sourceKey: item.sourceKey, recordKey: item.key } },
      create: {
        sourceKey: item.sourceKey,
        recordKey: item.key,
        decision: d.decision,
        targetType:
          item.type === 'university'
            ? 'UNIVERSITY'
            : item.type === 'mention'
              ? 'MENTION'
              : 'PROGRAM',
        targetId: d.targetId,
        authorId: admin.id,
        authorLabel: admin.name,
      },
      update: {
        decision: d.decision,
        targetId: d.targetId,
        authorId: admin.id,
        authorLabel: admin.name,
      },
    });
    n++;
  }
  return n;
}

/** « Valider la sélection » / « Rejeter la sélection ». */
export async function decideProposals(keys: unknown, accept: boolean) {
  return guard('data.edit', async (admin) => {
    const parsed = keysSchema.safeParse(keys);
    if (!parsed.success) return { ok: false as const, error: 'Sélection invalide.' };
    const { items } = await loadProposals();
    const chosen = items.filter((i) => parsed.data.includes(`${i.sourceKey}|${i.key}`));
    const n = await record(chosen, accept, admin);
    await audit(
      admin,
      'DATA',
      'Rapprochements à valider',
      `${n} proposition(s) ${accept ? 'validée(s)' : 'rejetée(s)'} : ${chosen
        .slice(0, 5)
        .map((i) => i.left.title)
        .join(', ')}${chosen.length > 5 ? '…' : ''}`,
    );
    const recomputed = await autoRecompute(chosen.map((i) => i.sourceKey));
    revalidatePath('/admin/recuperation/rapprochements');
    return { ok: true as const, count: n, recomputed };
  });
}

/**
 * « Sélectionner les 312 éléments du filtre », after a confirmation: every proposal matching the
 * filters (recomputed here, not the page the admin saw), validated or rejected.
 */
export async function decideFiltered(filters: ProposalFilters, accept: boolean) {
  return guard('data.edit', async (admin) => {
    const { items } = await loadProposals();
    const chosen = filterProposals(items, { ...filters, page: undefined });
    const n = await record(chosen, accept, admin);
    await audit(
      admin,
      'DATA',
      'Rapprochements à valider',
      `${n} proposition(s) du filtre ${accept ? 'validée(s)' : 'rejetée(s)'} en lot`,
    );
    const recomputed = await autoRecompute(chosen.map((i) => i.sourceKey));
    revalidatePath('/admin/recuperation/rapprochements');
    return { ok: true as const, count: n, recomputed };
  });
}

/** « Fusionner toutes les recommandées » (titles identical), after a confirmation in the page. */
export async function mergeAllRecommended() {
  return guard('data.edit', async (admin) => {
    const { items } = await loadProposals();
    const chosen = items.filter((i) => i.type === 'merge' && i.recommended);
    const n = await record(chosen, true, admin);
    await audit(
      admin,
      'DATA',
      'Rapprochements à valider',
      `Fusion de toutes les recommandées : ${n} numéro(s) Mon Master rattaché(s) à la fiche de leur parcours`,
    );
    const recomputed = await autoRecompute(chosen.map((i) => i.sourceKey));
    revalidatePath('/admin/recuperation/rapprochements');
    return { ok: true as const, count: n, recomputed };
  });
}

/** Recomputes a simulation from the match step (same staging, decisions applied), without re-downloading. */
export async function recomputeRun(runId: string) {
  return guard('sync.run', async (admin) => {
    const run = await prisma.syncRun.findUnique({
      where: { id: runId },
      include: { source: true },
    });
    if (!run) return { ok: false as const, error: 'Passage inconnu.' };
    if (run.appliedAt)
      return {
        ok: false as const,
        error: 'Passage déjà appliqué : lancez une nouvelle simulation.',
      };
    if (['QUEUED', 'RUNNING'].includes(run.status))
      return { ok: false as const, error: 'Passage déjà en cours.' };
    await prisma.syncRun.update({
      where: { id: runId },
      data: {
        mode: 'PREVIEW',
        status: 'QUEUED',
        resumeFromStep: 'match',
        finishedAt: null,
        progress: 0,
        validatedAt: null,
        validatedById: null,
      },
    });
    await audit(
      admin,
      'SYNC',
      run.source.name,
      'Simulation recalculée avec les décisions de rapprochement',
    );
    revalidatePath('/admin/recuperation');
    return { ok: true as const };
  });
}

/** Confirms the fiches not renewed in the latest session: status NOT_RENEWED (reviews stay). */
export async function confirmNotRenewed(ids: unknown) {
  return guard('data.edit', async (admin) => {
    const parsed = keysSchema.safeParse(ids);
    if (!parsed.success) return { ok: false as const, error: 'Sélection invalide.' };
    const { latest, programs } = await notRenewedPrograms();
    const chosen = programs.filter((p) => parsed.data.includes(p.id));
    await prisma.program.updateMany({
      where: { id: { in: chosen.map((p) => p.id) } },
      data: { status: 'NOT_RENEWED' },
    });
    if (latest)
      await prisma.dataAlert.updateMany({
        where: { key: `not-renewed:${latest}`, resolvedAt: null },
        data: { resolvedAt: new Date(), resolvedById: admin.id },
      });
    await audit(
      admin,
      'DATA',
      'Parcours non reconduits',
      `${chosen.length} fiche(s) marquée(s) « Plus proposé sur Mon Master en ${latest} » (avis conservés)`,
    );
    revalidatePath('/admin/recuperation/rapprochements');
    return { ok: true as const, count: chosen.length };
  });
}

/** Decision on a parent suggestion (établissement-composante): applied as soon as both fiches exist. */
export async function decideParent(childUai: string, parentUai: string, accept: boolean) {
  return guard('data.edit', async (admin) => {
    const { PARENTS_SOURCE, applyParentDecisions } = await import('@/lib/data/parents');
    const { normCode } = await import('@/lib/data/normalize');
    const child = normCode(childUai);
    await prisma.matchDecision.upsert({
      where: { sourceKey_recordKey: { sourceKey: PARENTS_SOURCE, recordKey: `parent:${child}` } },
      create: {
        sourceKey: PARENTS_SOURCE,
        recordKey: `parent:${child}`,
        decision: accept ? 'LINK' : 'IGNORE',
        targetType: 'UNIVERSITY',
        targetId: normCode(parentUai),
        authorId: admin.id,
        authorLabel: admin.name,
      },
      update: {
        decision: accept ? 'LINK' : 'IGNORE',
        targetId: normCode(parentUai),
        authorId: admin.id,
        authorLabel: admin.name,
      },
    });
    const linked = accept ? await applyParentDecisions() : 0;
    await audit(
      admin,
      'DATA',
      'Établissements-composantes',
      `${accept ? 'Rattachement validé' : 'Suggestion rejetée'} : ${child} → ${normCode(parentUai)}${accept && !linked ? ' (appliqué quand les deux fiches existeront)' : ''}`,
    );
    revalidatePath('/admin/recuperation/rapprochements');
    return { ok: true as const, linked };
  });
}
