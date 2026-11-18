import 'server-only';
import { prisma } from '@/lib/db';
import type { StagingRecord } from '@/lib/db/generated/client';
import type { MMRecord } from '@/lib/connectors/monmaster-opendata/normalize';
import { specificPlaces } from '@/lib/connectors/monmaster-opendata/normalize';

export type ProposalType = 'succession' | 'merge' | 'university' | 'mention' | 'page';

export interface ProposalItem {
  /** MatchDecision key: `ifc:<ifc>` (Mon Master) or the record key (other sources). */
  key: string;
  sourceKey: string;
  runId: string;
  type: ProposalType;
  score: number;
  recommended: boolean;
  latestSession: boolean;
  reason: string;
  left: {
    title: string;
    university: string;
    codes: string;
    sessions: string;
    place: string;
    mention: string;
  };
  right: {
    id: string | null;
    title: string;
    university: string;
    city: string;
    codes: string;
    mention: string;
  } | null;
  /** Merge: the canonical number (its fiche may not exist yet). */
  targetIfc?: string;
  /** Merge: numbers in the group (recommended only for 2, decision B). */
  groupSize?: number;
  diffs: string[];
}

export interface ProposalFilters {
  type?: ProposalType | '';
  source?: string;
  university?: string;
  scoreMin?: number;
  scoreMax?: number;
  recommended?: boolean;
  page?: number;
}

export const PAGE_SIZE = 50;

/** Latest run of each source that staged records (its proposals are the current ones). */
async function currentRuns() {
  const sources = await prisma.dataSource.findMany({ select: { id: true, key: true } });
  const out = [];
  for (const s of sources) {
    const run = await prisma.syncRun.findFirst({
      where: { sourceId: s.id, staging: { some: {} } },
      orderBy: { queuedAt: 'desc' },
      select: {
        id: true,
        mode: true,
        appliedAt: true,
        status: true,
        resumeFromStep: true,
        finishedAt: true,
      },
    });
    if (run) out.push({ sourceKey: s.key, ...run });
  }
  return out;
}

const mm = (s: StagingRecord) => s.normalized as unknown as MMRecord;

/** Every open proposal of the current runs, without the ones already decided. */
export async function loadProposals(): Promise<{
  items: ProposalItem[];
  runs: Awaited<ReturnType<typeof currentRuns>>;
}> {
  const runs = await currentRuns();
  const items: ProposalItem[] = [];
  for (const run of runs) {
    // Successions (PROPOSED) and merge proposals (separate new fiches carrying matchInfo.merge).
    const proposed = await prisma.stagingRecord.findMany({
      where: {
        runId: run.id,
        OR: [{ matchStatus: 'PROPOSED' }, { matchInfo: { path: ['merge'], not: 'null' } }],
      },
    });
    if (!proposed.length) continue;
    const decided = new Set(
      (
        await prisma.matchDecision.findMany({
          where: { sourceKey: run.sourceKey },
          select: { recordKey: true },
        })
      ).map((d) => d.recordKey),
    );
    if (run.sourceKey === 'monmaster-opendata') {
      const latest = (
        await prisma.stagingRecord.findFirst({
          where: { runId: run.id },
          orderBy: { recordKey: 'desc' },
        })
      )?.recordKey.split(':')[0];
      const byIfc = new Map<string, StagingRecord[]>();
      for (const s of proposed) byIfc.set(mm(s).ifc, [...(byIfc.get(mm(s).ifc) ?? []), s]);
      const mergeOf = (s: StagingRecord) =>
        (
          s.matchInfo as {
            merge?: {
              withIfc: string;
              programId: string | null;
              recommended: boolean;
              groupSize: number;
            };
          } | null
        )?.merge ?? null;
      const entryProgram = new Map(
        (
          await prisma.monMasterEntry.findMany({
            where: {
              code: {
                in: proposed.map((s) => mergeOf(s)?.withIfc).filter((x): x is string => !!x),
              },
            },
            select: { code: true, programId: true },
          })
        ).map((e) => [e.code, e.programId]),
      );
      // target of a proposal: the candidate fiche, or the fiche of the canonical number of a merge
      const targetOf = (s: StagingRecord) => {
        const m = mergeOf(s);
        return m ? (m.programId ?? entryProgram.get(m.withIfc) ?? `new:${m.withIfc}`) : s.targetId;
      };
      const targetIds = [
        ...new Set(proposed.map(targetOf).filter((x): x is string => !!x && !x.startsWith('new:'))),
      ];
      const programs = new Map(
        (
          await prisma.program.findMany({
            where: { id: { in: targetIds } },
            include: {
              university: { select: { name: true } },
              mention: { select: { name: true } },
              monMasterEntries: { select: { code: true } },
            },
          })
        ).map((p) => [p.id, p]),
      );
      // Canonical records of merge proposals towards a fiche not created yet.
      const virtualIfcs = [
        ...new Set(
          proposed
            .map(targetOf)
            .filter((x): x is string => !!x?.startsWith('new:'))
            .map((x) => x.slice(4)),
        ),
      ];
      const canon = new Map<string, MMRecord>();
      if (virtualIfcs.length)
        for (const s of await prisma.stagingRecord.findMany({
          where: { runId: run.id, recordKey: { in: virtualIfcs.map((i) => `${latest}:${i}`) } },
        }))
          canon.set(mm(s).ifc, mm(s));
      for (const [ifc, rows] of byIfc) {
        if (decided.has(`ifc:${ifc}`)) continue;
        rows.sort((a, b) => mm(b).session - mm(a).session);
        const r = mm(rows[0]!);
        const s0 = rows[0]!;
        const merge = mergeOf(s0);
        if (merge && String(r.session) !== latest) continue; // merges concern the latest session only
        const type: ProposalType = merge ? 'merge' : 'succession';
        const target = targetOf(s0);
        const place = specificPlaces(r)[0];
        const left = {
          title: r.title,
          university: r.etaName,
          codes: `${ifc}${r.inmp ? ` · inmp ${r.inmp}` : ''} · inm ${r.inm}`,
          sessions: rows
            .map((x) => mm(x).session)
            .sort()
            .join(', '),
          place: place ? `${place.label} · ${place.commune}` : '—',
          mention: r.mention,
        };
        let right: ProposalItem['right'] = null;
        const diffs: string[] = [];
        if (target?.startsWith('new:')) {
          const c = canon.get(target.slice(4));
          if (c) {
            const cp = specificPlaces(c)[0];
            right = {
              id: null,
              title: c.title,
              university: c.etaName,
              city: cp?.commune ?? '—',
              codes: `${c.ifc} (fiche créée à l’application)`,
              mention: c.mention,
            };
          }
        } else if (target) {
          const p = programs.get(target);
          if (p) {
            right = {
              id: p.id,
              title: p.title,
              university: p.university.name,
              city: p.city,
              codes: p.monMasterEntries.map((e) => e.code).join(', ') || '—',
              mention: p.mention.name,
            };
            if (p.title !== r.title) diffs.push('intitulé');
            if (place && p.city.toLowerCase() !== place.commune.toLowerCase()) diffs.push('ville');
            if ((p.modality === 'WORK_STUDY') !== r.workStudy) diffs.push('modalité');
            if (p.mention.name.toLowerCase() !== r.mention.toLowerCase()) diffs.push('mention');
          }
        }
        items.push({
          key: `ifc:${ifc}`,
          sourceKey: run.sourceKey,
          runId: run.id,
          type,
          score: s0.matchScore ?? 0,
          recommended: !!merge?.recommended,
          latestSession: String(r.session) === latest,
          reason: s0.matchReason ?? '',
          left,
          right,
          diffs,
          targetIfc: merge ? merge.withIfc : undefined,
          groupSize: merge?.groupSize,
        });
      }
    } else if (run.sourceKey === 'rncp') {
      const mentions = new Map(
        (
          await prisma.mention.findMany({
            where: { id: { in: proposed.map((s) => s.targetId!).filter(Boolean) } },
            select: { id: true, name: true, slug: true },
          })
        ).map((m) => [m.id, m]),
      );
      for (const s of proposed) {
        if (decided.has(s.recordKey)) continue;
        const f = s.normalized as { code: string; mentionTitle: string; validTo: string | null };
        const m = s.targetId ? mentions.get(s.targetId) : undefined;
        items.push({
          key: s.recordKey,
          sourceKey: run.sourceKey,
          runId: run.id,
          type: 'mention',
          score: s.matchScore ?? 0,
          recommended: false,
          latestSession: true,
          reason: s.matchReason ?? '',
          left: {
            title: f.mentionTitle,
            university: 'Fiche nationale RNCP',
            codes: f.code,
            sessions: '',
            place: f.validTo ? `valide jusqu’au ${f.validTo}` : '—',
            mention: '',
          },
          right: m
            ? {
                id: m.id,
                title: m.name,
                university: 'Mention du site',
                city: '',
                codes: `/mentions/${m.slug}`,
                mention: '',
              }
            : null,
          diffs: m && m.name !== f.mentionTitle ? ['intitulé'] : [],
        });
      }
    } else if (run.sourceKey === 'univ-sites') {
      // Page of a university site ↔ parcours (score between 0.75 and 0.90, or ambiguous)
      const programs = new Map(
        (
          await prisma.program.findMany({
            where: { id: { in: proposed.map((s) => s.targetId!).filter(Boolean) } },
            select: {
              id: true,
              title: true,
              city: true,
              university: { select: { name: true } },
              mention: { select: { name: true } },
              monMasterEntries: { select: { code: true } },
            },
          })
        ).map((p) => [p.id, p]),
      );
      for (const s of proposed) {
        if (decided.has(s.recordKey)) continue;
        const f = s.normalized as { title?: string; mentionHint?: string; rncp?: string[] };
        const p = s.targetId ? programs.get(s.targetId) : undefined;
        items.push({
          key: s.recordKey,
          sourceKey: run.sourceKey,
          runId: run.id,
          type: 'page',
          score: s.matchScore ?? 0,
          recommended: false,
          latestSession: true,
          reason: s.matchReason ?? '',
          left: {
            title: f.title || s.recordKey,
            university: new URL(s.recordKey).hostname,
            codes: (f.rncp ?? []).join(', ') || '—',
            sessions: '',
            place: s.recordKey,
            mention: f.mentionHint ?? '',
          },
          right: p
            ? {
                id: p.id,
                title: p.title,
                university: p.university.name,
                city: p.city,
                codes: p.monMasterEntries.map((e) => e.code).join(', ') || '—',
                mention: p.mention.name,
              }
            : null,
          diffs: p && p.title !== f.title ? ['intitulé'] : [],
        });
      }
    } else {
      const unis = new Map(
        (
          await prisma.university.findMany({
            where: { id: { in: proposed.map((s) => s.targetId!).filter(Boolean) } },
          })
        ).map((u) => [u.id, u]),
      );
      for (const s of proposed) {
        if (decided.has(s.recordKey)) continue;
        const n = s.normalized as { name?: string; uai?: string; comName?: string };
        const u = s.targetId ? unis.get(s.targetId) : undefined;
        items.push({
          key: s.recordKey,
          sourceKey: run.sourceKey,
          runId: run.id,
          type: 'university',
          score: s.matchScore ?? 0,
          recommended: false,
          latestSession: true,
          reason: s.matchReason ?? '',
          left: {
            title: n.name ?? s.recordKey,
            university: n.name ?? '',
            codes: `UAI ${n.uai ?? '—'}`,
            sessions: '',
            place: n.comName ?? '—',
            mention: '',
          },
          right: u
            ? {
                id: u.id,
                title: u.name,
                university: u.name,
                city: u.city,
                codes: `UAI ${u.uai ?? '—'}`,
                mention: '',
              }
            : null,
          diffs: u && n.name !== u.name ? ['nom'] : [],
        });
      }
    }
  }
  // After publication, a merge proposal lives on as an open MERGE conflict (both fiches exist).
  const mmDecided = new Set(
    (
      await prisma.matchDecision.findMany({
        where: { sourceKey: 'monmaster-opendata' },
        select: { recordKey: true },
      })
    ).map((d) => d.recordKey),
  );
  const seen = new Set(items.map((i) => i.key));
  const conflicts = await prisma.dataConflict.findMany({
    where: { kind: 'MERGE', resolvedAt: null, key: { startsWith: 'merge:ifc:' } },
  });
  const ids = conflicts.flatMap((c) => [
    c.entityId,
    (c.options as { value?: { fromProgramId?: string } }[])[0]?.value?.fromProgramId ?? '',
  ]);
  const progs = new Map(
    (
      await prisma.program.findMany({
        where: { id: { in: ids.filter(Boolean) } },
        include: {
          university: { select: { name: true } },
          mention: { select: { name: true } },
          monMasterEntries: { select: { code: true } },
        },
      })
    ).map((p) => [p.id, p]),
  );
  for (const c of conflicts) {
    const ifc = c.key.slice('merge:ifc:'.length);
    const key = `ifc:${ifc}`;
    if (seen.has(key) || mmDecided.has(key)) continue;
    const from = progs.get(
      (c.options as { value?: { fromProgramId?: string } }[])[0]?.value?.fromProgramId ?? '',
    );
    const to = progs.get(c.entityId);
    if (!to) continue;
    items.push({
      key,
      sourceKey: 'monmaster-opendata',
      runId: '',
      type: 'merge',
      score: c.score ?? 0,
      recommended: c.recommended,
      latestSession: true,
      reason: c.detail ?? '',
      left: {
        title: from?.title ?? ifc,
        university: from?.university.name ?? '',
        codes: ifc,
        sessions: '',
        place: from?.city ?? '—',
        mention: from?.mention.name ?? '',
      },
      right: {
        id: to.id,
        title: to.title,
        university: to.university.name,
        city: to.city,
        codes: to.monMasterEntries.map((e) => e.code).join(', '),
        mention: to.mention.name,
      },
      diffs: [],
      groupSize: Number(c.detail?.match(/groupe de (\d+)/)?.[1] ?? 0) || undefined,
    });
  }
  items.sort((a, b) => b.score - a.score);
  return { items, runs };
}

export function filterProposals(items: ProposalItem[], f: ProposalFilters) {
  const q = (f.university ?? '').trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.type || i.type === f.type) &&
      (!f.source || i.sourceKey === f.source) &&
      (!q ||
        i.left.university.toLowerCase().includes(q) ||
        (i.right?.university ?? '').toLowerCase().includes(q)) &&
      (f.scoreMin == null || i.score >= f.scoreMin) &&
      (f.scoreMax == null || i.score <= f.scoreMax) &&
      (!f.recommended || i.recommended),
  );
}

/** Fiches whose Mon Master numbers all left the latest session (alert « non reconduits »). */
export async function notRenewedPrograms() {
  const latest = (await prisma.monMasterEntry.aggregate({ _max: { lastSession: true } }))._max
    .lastSession;
  if (!latest) return { latest: null, programs: [] };
  const programs = await prisma.program.findMany({
    where: {
      status: 'ACTIVE',
      monMasterEntries: { some: {}, every: { lastSession: { lt: latest } } },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      university: { select: { name: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: { title: 'asc' },
    take: 500,
  });
  return { latest, programs };
}
