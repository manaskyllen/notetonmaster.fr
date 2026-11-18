'use server';

import { refreshSearchIndex } from '@/lib/search-index';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import { enqueueRun } from '@/lib/connectors/runner';
import { SOURCE_ORDER, type SourceKey } from '@/lib/connectors/types';
import { requeueSimulations, requestApply } from '@/lib/data/pipeline';
import { prisma } from '@/lib/db';

/** « Simuler » (PREVIEW: everything but publish) or « Lancer » (APPLY). */
export async function runSource(key: string, mode: 'PREVIEW' | 'APPLY' = 'APPLY') {
  return guard('sync.run', async (admin) => {
    const source = await prisma.dataSource.findUnique({ where: { key } });
    if (!source) return { ok: false as const, error: 'Source inconnue.' };
    if (!source.enabled && source.blockedReason)
      return { ok: false as const, error: 'Collecte interdite pour cette source.' };
    const run = await enqueueRun(source.id, 'manual', admin.id, { mode });
    await audit(
      admin,
      'SYNC',
      source.name,
      mode === 'PREVIEW'
        ? 'Simulation lancée (aucune écriture)'
        : 'Lancement manuel de la récupération',
    );
    return { ok: true as const, runId: run.id };
  });
}

/** « Appliquer » / « Valider quand même »: replays publish from the same staging (role Données). */
export async function applyRun(runId: string) {
  return guard('sync.validate', async (admin) => {
    const run = await prisma.syncRun.findUnique({
      where: { id: runId },
      include: { source: true },
    });
    if (!run) return { ok: false as const, error: 'Passage inconnu.' };
    const res = await requestApply(runId, admin.id);
    if (!res.ok) return res;
    await audit(
      admin,
      'SYNC',
      run.source.name,
      `Simulation validée, application lancée (${run.status === 'AWAITING_VALIDATION' ? 'contrôle bloquant levé' : 'rapport relu'})`,
    );
    revalidatePath('/admin/recuperation');
    return { ok: true as const, runId };
  });
}

/** « Tout synchroniser »: enabled sources queued in dependency order (one run per source). */
export async function runAll() {
  return guard('sync.run', async (admin) => {
    const sources = await prisma.dataSource.findMany({ where: { enabled: true } });
    const order = (k: string) => SOURCE_ORDER.indexOf(k as SourceKey);
    sources.sort((a, b) => order(a.key) - order(b.key));
    const runs = [];
    for (const s of sources)
      runs.push({ key: s.key, runId: (await enqueueRun(s.id, 'all', admin.id)).id });
    await audit(
      admin,
      'SYNC',
      'Toutes les sources',
      `Synchronisation générale lancée (${runs.length} sources)`,
    );
    return { ok: true as const, runs };
  });
}

/** Applies the chosen option of a data conflict and locks the field. */
export async function resolveConflict(conflictId: string, optionId: string) {
  return guard('data.edit', async (admin) => {
    const c = await prisma.dataConflict.findUnique({ where: { id: conflictId } });
    if (!c || c.resolvedAt) return { ok: false as const, error: 'Conflit déjà arbitré.' };
    const option = (
      c.options as { id: string; label: string; value: unknown; source: string }[]
    ).find((o) => o.id === optionId);
    if (!option) return { ok: false as const, error: 'Option inconnue.' };

    if (c.kind === 'MERGE') {
      // Two Mon Master numbers for one parcours: the choice is a MatchDecision (no field lock),
      // applied by the next Mon Master sync; never an automatic merge.
      const v = option.value as { decision: 'MERGE' | 'NEW'; ifc: string; targetId?: string };
      await prisma.matchDecision.upsert({
        where: {
          sourceKey_recordKey: { sourceKey: 'monmaster-opendata', recordKey: `ifc:${v.ifc}` },
        },
        create: {
          sourceKey: 'monmaster-opendata',
          recordKey: `ifc:${v.ifc}`,
          decision: v.decision,
          targetType: 'PROGRAM',
          targetId: v.targetId ?? null,
          authorId: admin.id,
          authorLabel: admin.name,
        },
        update: {
          decision: v.decision,
          targetId: v.targetId ?? null,
          authorId: admin.id,
          authorLabel: admin.name,
        },
      });
      await prisma.dataConflict.update({
        where: { id: c.id },
        data: { resolvedOption: option.id, resolvedById: admin.id, resolvedAt: new Date() },
      });
      await prisma.dataAlert.updateMany({
        where: { key: { startsWith: c.key }, resolvedAt: null },
        data: { resolvedAt: new Date(), resolvedById: admin.id },
      });
      const recomputed = await requeueSimulations(['monmaster-opendata']);
      await audit(
        admin,
        'DATA',
        c.title,
        `${option.label} (n° ${v.ifc}) · décision mémorisée${recomputed.length ? ', simulation recalculée' : ', appliquée à la prochaine synchro'}`,
      );
      revalidatePath('/admin/recuperation');
      return { ok: true as const };
    }

    const { applyConflictOption } = await import('@/lib/admin/conflicts');
    const reindex = await applyConflictOption(c, option, admin, { lock: true });
    if (reindex) {
      await refreshSearchIndex();
      expireTags([TAGS.footer, TAGS.catalog]);
    }
    const { refreshIssues } = await import('@/lib/admin/refresh-issues');
    await refreshIssues(
      c.entityType === 'PROGRAM'
        ? { programIds: [c.entityId] }
        : c.entityType === 'UNIVERSITY'
          ? { universityIds: [c.entityId] }
          : { mentionIds: [c.entityId] },
      admin.id,
    );
    await audit(
      admin,
      'DATA',
      c.title,
      `Conflit arbitré : ${option.label} (${option.source}) · champ verrouillé`,
      {
        action: 'a arbitré un conflit sur',
        target: { type: c.entityType, id: c.entityId },
        diff: [
          {
            field: c.title.split(' · ')[0] ?? c.field,
            before: (c.options as { id: string; label: string; source: string }[])
              .filter((o) => o.id !== option.id)
              .map((o) => `${o.label} (${o.source})`)
              .join(' / '),
            after: `${option.label} (${option.source})`,
          },
        ],
      },
    );
    revalidatePath('/admin/recuperation');
    revalidatePath('/admin');
    return { ok: true as const };
  });
}

/** « Toujours : … » of a group of conflicts (Récupération, fiche): SourceRule + the whole group. */
export async function applyRule(groupKey: string, sourceKey: string) {
  return guard('data.edit', async (admin) => {
    const { applySourceRule } = await import('@/lib/admin/conflicts');
    const r = await applySourceRule(groupKey, sourceKey, admin);
    revalidatePath('/admin/recuperation');
    revalidatePath('/admin/fiches');
    return r;
  });
}

// ───────────── Redesigned Récupération: collect errors, groups, journal, profiles ─────────────

/** « Relancer » a collect in error: the source, or the establishment (its hosts out of pause). */
export async function retryCollect(issueId: string) {
  return guard('sync.run', async (admin) => {
    const issue = await prisma.dataIssue.findUnique({ where: { id: issueId } });
    if (!issue || issue.kind !== 'COLLECT_ERROR')
      return { ok: false as const, error: 'Erreur déjà réglée.' };
    if (issue.targetType === 'SOURCE') {
      const source = await prisma.dataSource.findUnique({ where: { id: issue.targetId } });
      if (!source) return { ok: false as const, error: 'Source inconnue.' };
      if (!source.enabled && source.blockedReason)
        return { ok: false as const, error: 'Collecte interdite pour cette source.' };
      const run = await enqueueRun(source.id, 'manual', admin.id);
      await audit(admin, 'SYNC', source.name, 'Relance après une erreur de collecte', {
        action: 'a relancé la collecte de',
        target: { type: 'SOURCE', id: source.key },
      });
      return { ok: true as const, runId: run.id };
    }
    const uni = await prisma.university.findUnique({
      where: { id: issue.targetId },
      select: { id: true, name: true, siteDomains: true },
    });
    const source = await prisma.dataSource.findUnique({ where: { key: 'univ-sites' } });
    if (!uni || !source) return { ok: false as const, error: 'Établissement inconnu.' };
    await prisma.crawlHost.updateMany({
      where: { host: { in: uni.siteDomains } },
      data: { pausedUntil: null, pausedReason: null, failures: 0 },
    });
    await prisma.extractionProfile.updateMany({
      where: { universityId: uni.id, status: 'PAUSED' },
      data: { status: 'ACTIVE', pausedReason: null },
    });
    const run = await enqueueRun(source.id, 'manual', admin.id, {
      options: { universityIds: [uni.id] },
    });
    await audit(
      admin,
      'SYNC',
      uni.name,
      'Relance de la collecte du site après une erreur (pause levée)',
      {
        action: 'a relancé la collecte du site de',
        target: { type: 'UNIVERSITY', id: uni.id },
      },
    );
    return { ok: true as const, runId: run.id };
  });
}

/** « Pause 7 jours »: no pass and no error shown for 7 days, then back to normal. */
export async function pauseCollect(issueId: string) {
  return guard('sync.run', async (admin) => {
    const issue = await prisma.dataIssue.findUnique({ where: { id: issueId } });
    if (!issue || issue.kind !== 'COLLECT_ERROR')
      return { ok: false as const, error: 'Erreur déjà réglée.' };
    const until = new Date(Date.now() + 7 * 86_400_000);
    let label = issue.targetId;
    if (issue.targetType === 'SOURCE') {
      const s = await prisma.dataSource.update({
        where: { id: issue.targetId },
        data: { pausedUntil: until },
      });
      label = s.name;
    } else {
      const uni = await prisma.university.findUniqueOrThrow({
        where: { id: issue.targetId },
        select: { name: true, siteDomains: true },
      });
      label = uni.name;
      for (const host of uni.siteDomains)
        await prisma.crawlHost.upsert({
          where: { host },
          create: { host, pausedUntil: until, pausedReason: 'Pause manuelle de 7 jours' },
          update: { pausedUntil: until, pausedReason: 'Pause manuelle de 7 jours' },
        });
    }
    // Out of « À traiter » (and of the counters) until then.
    await prisma.dataIssue.updateMany({
      where: {
        kind: 'COLLECT_ERROR',
        OR: [
          { id: issueId },
          { universityId: issue.targetType === 'UNIVERSITY' ? issue.targetId : '-' },
        ],
      },
      data: { ignoredUntil: until, ignoredById: admin.id },
    });
    expireTags([TAGS.admin]);
    await audit(
      admin,
      'SYNC',
      label,
      `Collecte mise en pause 7 jours (jusqu’au ${until.toLocaleDateString('fr-FR')})`,
      {
        action: 'a mis en pause 7 jours la collecte de',
        target: {
          type: issue.targetType,
          id: issue.targetType === 'SOURCE' ? null : issue.targetId,
        },
      },
    );
    revalidatePath('/admin/recuperation');
    return { ok: true as const };
  });
}

/** « Voir les n fiches » of a group of conflicts. */
export async function loadGroupItems(key: string) {
  return guard('dashboard.view', async () => {
    const { conflictGroupItems } = await import('@/lib/admin/conflict-groups');
    return { ok: true as const, items: await conflictGroupItems(key) };
  });
}

/** Log lines of one pass (journal unfolded), newest last. */
export async function loadRunLines(runId: string) {
  return guard('dashboard.view', async () => {
    const lines = await prisma.syncLog.findMany({
      where: { runId },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, at: true, level: true, message: true },
    });
    return {
      ok: true as const,
      lines: lines.map((l) => ({
        id: l.id,
        t: l.at.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' }),
        level: l.level,
        message: l.message,
      })),
      purged: !lines.length,
    };
  });
}

/** « Configurer un profil »: template and catalogue address; the next collect reads the site. */
export async function configureProfile(universityId: string, template: string, rawUrl: string) {
  return guard('data.edit', async (admin) => {
    const { profileConfig, TEMPLATES } = await import('@/lib/connectors/univ-sites/profiles');
    if (!(TEMPLATES as readonly string[]).includes(template))
      return { ok: false as const, error: 'Gabarit inconnu.' };
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      return { ok: false as const, error: 'Adresse invalide : elle doit commencer par https://.' };
    }
    const parsed = profileConfig.safeParse({
      template,
      hosts: [url.hostname],
      entryUrls: [url.toString()],
    });
    if (!parsed.success) return { ok: false as const, error: 'Profil invalide.' };
    const uni = await prisma.university.findUnique({
      where: { id: universityId },
      select: { name: true, siteDomains: true },
    });
    if (!uni) return { ok: false as const, error: 'Établissement inconnu.' };
    await prisma.extractionProfile.upsert({
      where: { universityId },
      create: {
        universityId,
        kind: template as never,
        config: parsed.data as never,
        status: 'ACTIVE',
        updatedById: admin.id,
      },
      update: {
        kind: template as never,
        config: parsed.data as never,
        status: 'ACTIVE',
        updatedById: admin.id,
      },
    });
    if (!uni.siteDomains.includes(url.hostname))
      await prisma.university.update({
        where: { id: universityId },
        data: { siteDomains: { push: url.hostname } },
      });
    expireTags([TAGS.admin]);
    await audit(
      admin,
      'SYNC',
      uni.name,
      `Profil de collecte configuré : ${template} · ${url.hostname}`,
      {
        action: 'a configuré le profil de collecte de',
        target: { type: 'UNIVERSITY', id: universityId },
        diff: [{ field: 'Profil', before: 'Sans profil', after: `${template} · ${url.hostname}` }],
      },
    );
    revalidatePath('/admin/recuperation');
    return { ok: true as const };
  });
}

/** « Passages plus anciens »: the next page of the journal, by cursor. */
export async function loadRuns(
  filters: { source: string | null; level: 'err' | 'warn' | null; days: number | null },
  before: string,
) {
  return guard('dashboard.view', async () => {
    const { runsPage } = await import('@/lib/admin/recuperation');
    return { ok: true as const, ...(await runsPage({ ...filters, before })) };
  });
}
