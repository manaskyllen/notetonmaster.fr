/**
 * monmaster-opendata: the national catalogue (universities, mentions, parcours, places,
 * work-study) and the admission figures of every published session (2023, 2024, 2025…), from the
 * ESR open data (`fr-esr-mon_master`, `fr-esr-mon_master_2023`, Licence Ouverte 2.0).
 * Matching: ./match.ts. Displayed rank: ./normalize.ts (decision 2). Publication: ./publish.ts
 * (batched, decision F).
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { StagingRecord } from '@/lib/db/generated/client';
import { loadProvenance, planField } from '@/lib/data/merge';
import { planAction, type FieldChange, type RecordPlan } from '@/lib/data/diff';
import { loadUniversityIndex } from '@/lib/data/match';
import { normCity, normCode, normMention, normProgramTitle, slugify } from '@/lib/data/normalize';
import { recordChecks, updateStaging } from '@/lib/data/pipeline';
import { getSettings } from '@/lib/settings';
import { establishmentsReference, type EtabNorm } from '../esr-etablissements';
import {
  datasetOf,
  esrDatasetVersion,
  esrExceptions,
  esrExport,
  identicalToApplied,
  readChecked,
  ESR_HOST,
} from '../opendata';
import type { PipelineConnector } from '../types';
import { matchFormations, notRenewed, type Decision, type ProgramRef } from './match';
import { lookupRncpName, mentionNames } from './mention-names';
import {
  RANK_PHASE_LABEL,
  boundsChecks,
  cleanTitle,
  displayTitle,
  displayedRank,
  looksLikeComponent,
  normalizeRow,
  ORIGIN_SOURCE_COLUMNS,
  prettyMention,
  specificPlaces,
  statsSummary,
  type MMRecord,
} from './normalize';
import { publishMonMaster, type MMOps } from './publish';
import { DATASETS, MM_STAT_SOURCE, allStaged, datasetUrl, sourceLabel, titleCase } from './shared';

export { DATASETS, MM_STAT_SOURCE };
type Norm = MMRecord;

const mm = (s: StagingRecord) => s.normalized as unknown as Norm;

// ───────────────────────────── loaders ─────────────────────────────

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function programRefs(): Promise<ProgramRef[]> {
  const ps = await prisma.program.findMany({
    select: {
      id: true,
      universityId: true,
      title: true,
      city: true,
      modality: true,
      monMasterEntries: {
        select: { code: true, inmp: true, firstSession: true, lastSession: true },
      },
    },
  });
  return ps.map((p) => ({
    id: p.id,
    universityId: p.universityId,
    titleKey: normProgramTitle(p.title),
    cityKey: normCity(p.city),
    workStudy: p.modality === 'WORK_STUDY',
    entries: p.monMasterEntries.map((e) => ({
      ifc: e.code,
      inmp: e.inmp,
      sessions: e.firstSession && e.lastSession ? range(e.firstSession, e.lastSession) : [],
    })),
  }));
}

async function decisionsByIfc(sourceKey: string): Promise<Map<string, Decision>> {
  const rows = await prisma.matchDecision.findMany({ where: { sourceKey } });
  return new Map(
    rows.map((r) => [
      r.recordKey,
      { decision: r.decision, targetId: r.targetId, author: r.authorLabel },
    ]),
  );
}

/** Slug free in `taken` (and reserved there): base, base-2, base-3… */
function uniqueSlug(base: string, taken: Set<string>) {
  let slug = base || 'fiche';
  for (let k = 2; taken.has(slug); k++) slug = `${base}-${k}`;
  taken.add(slug);
  return slug;
}

/** Deterministic pseudo-random order (seeded by the run id): the sample is the same when recomputed. */
function seededOrder<T>(items: T[], seed: string, key: (t: T) => string) {
  const h = (s: string) => createHash('sha256').update(`${seed}|${s}`).digest('hex');
  return [...items].sort((a, b) => h(key(a)).localeCompare(h(key(b))));
}

// ───────────────────────────── connector ─────────────────────────────

export const connector: PipelineConnector = {
  key: 'monmaster-opendata',
  pipeline: true,
  http: {
    allowedDomains: [ESR_HOST],
    openDataExceptions: esrExceptions(DATASETS.main, DATASETS.y2023),
  },

  async fetch(ctx) {
    const v = [
      await esrDatasetVersion(ctx, DATASETS.main),
      await esrDatasetVersion(ctx, DATASETS.y2023),
    ];
    const version = `2024-2025 ${v[0]!.modified.slice(0, 10)} · 2023 ${v[1]!.modified.slice(0, 10)}`;
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: ctx.sourceId } });
    if (source.version === version && !ctx.force)
      return { nothingNew: true, reason: 'jeux non modifiés', sourceVersion: version };
    let identical = true;
    for (const x of v) {
      // One snapshot per session file is kept beyond the retention (history of the admissions).
      const { snapshot } = await esrExport(ctx, x, { pinned: true });
      identical &&= await identicalToApplied(snapshot);
    }
    if (identical && !ctx.force)
      return {
        nothingNew: true,
        reason: 'fichiers identiques au dernier import appliqué',
        sourceVersion: version,
      };
    return { nothingNew: false, sourceVersion: version };
  },

  async *parse(ctx, snapshots) {
    for (const s of snapshots) {
      const ds = datasetOf(s);
      if (ds !== DATASETS.main && ds !== DATASETS.y2023) continue;
      const kind = ds === DATASETS.main ? 'main' : '2023';
      const onNew = async (cols: string[]) =>
        ctx.alert({
          key: `new-columns:${ds}:${cols.sort().join(',').slice(0, 120)}`,
          code: 'new-columns',
          severity: 'INFO',
          title: `Nouvelles colonnes dans ${ds}`,
          detail: `Colonnes apparues : ${cols.join(', ')}. Si ce sont des attendus ou des critères, elles peuvent être branchées (décision 11).`,
          link: '/admin/recuperation',
          linkLabel: 'Voir',
        });
      for await (const row of readChecked(ctx, s, ds, onNew)) {
        const n = normalizeRow(row, kind);
        if (!n.ifc || !n.session) continue;
        const payload: Record<string, string> = {};
        for (const k of KEEP) if (row[k] != null && row[k] !== '') payload[k] = row[k]!;
        yield { recordKey: `${n.session}:${n.ifc}`, payload, normalized: n as never };
      }
    }
  },

  async match(ctx) {
    const settings = await getSettings();
    const staged = await allStaged(ctx.runId);
    const records: Norm[] = [];
    const rejected = new Map<string, string>();
    const checks: Record<string, { executed: number; failed: number }> = {};
    for (const s of staged) {
      const n = mm(s);
      const failures: string[] = [];
      for (const [name, fail] of Object.entries(boundsChecks(n))) {
        const c = (checks[name] ??= { executed: 0, failed: 0 });
        c.executed++;
        if (fail) {
          c.failed++;
          failures.push(fail);
        }
      }
      if (failures.length) rejected.set(s.id, failures.join(' ; '));
      else records.push(n);
    }
    await recordChecks(ctx.runId, checks, { replace: true });
    const uniIdx = await loadUniversityIndex();
    const universityOf = (uai: string, paysage: string | null) =>
      uniIdx.byUai.get(normCode(uai)) ??
      (paysage ? uniIdx.byPaysage.get(paysage) : undefined) ??
      null;
    await ctx.report({ progress: 40, step: `Rapprochement de ${records.length} lignes` });
    const result = matchFormations({
      records,
      programs: await programRefs(),
      universityOf,
      decisions: await decisionsByIfc(ctx.sourceKey),
      thresholds: settings['data.matchThresholds'],
    });
    const upd: {
      id: string;
      matchStatus: string;
      matchScore?: number;
      matchReason?: string;
      matchInfo?: Record<string, unknown> | null;
      targetType?: string;
      targetId?: string | null;
    }[] = [];
    for (const s of staged) {
      const n = mm(s);
      const rej = rejected.get(s.id);
      if (rej) {
        upd.push({
          id: s.id,
          matchStatus: 'REJECTED',
          matchReason: rej,
          matchInfo: null,
          targetType: 'PROGRAM',
          targetId: null,
        });
        continue;
      }
      const m = result.get(n.ifc)!;
      upd.push({
        id: s.id,
        matchStatus: m.status,
        matchScore: m.score,
        matchReason: m.reason,
        matchInfo: m.status === 'NEW' && m.merge ? { merge: m.merge } : null,
        targetType: 'PROGRAM',
        targetId: 'programId' in m ? m.programId : null,
      });
    }
    await updateStaging(upd);
    if (rejected.size)
      await ctx.alert({
        key: `out-of-bounds:${ctx.sourceKey}`,
        code: 'out-of-bounds',
        severity: 'WARNING',
        title: `${rejected.size} lignes Mon Master écartées (valeurs hors bornes)`,
        detail: [...rejected.entries()]
          .slice(0, 20)
          .map(([id, r]) => `${staged.find((x) => x.id === id)!.recordKey} : ${r}`)
          .join(' ; '),
        link: '/admin/recuperation',
        linkLabel: 'Voir le rapport',
        count: rejected.size,
      });
    const count = (st: string) => upd.filter((u) => u.matchStatus === st).length;
    const merges = new Set(
      staged
        .filter(
          (s) =>
            result.get(mm(s).ifc)?.status === 'NEW' &&
            (result.get(mm(s).ifc) as { merge?: unknown }).merge,
        )
        .map((s) => mm(s).ifc),
    ).size;
    await ctx.log(
      'OK',
      `${count('LINKED')} lignes reliées, ${count('NEW')} nouvelles (dont ${merges} numéros avec fusion proposée), ${count('PROPOSED')} à valider, ${count('IGNORED')} historique sans fiche, ${rejected.size} écartées`,
    );
  },

  async merge(ctx) {
    const staged = await allStaged(ctx.runId);
    const latest = Math.max(...staged.map((s) => mm(s).session));
    const linkedIds = [
      ...new Set(
        staged
          .filter((s) => s.matchStatus === 'LINKED' && s.targetId && !s.targetId.startsWith('new:'))
          .map((s) => s.targetId!),
      ),
    ];
    const prov = await loadProvenance('PROGRAM', linkedIds);
    const programs = new Map(
      (
        await prisma.program.findMany({
          where: { id: { in: linkedIds } },
          include: { admissionStats: { include: { monMasterEntry: true } } },
        })
      ).map((p) => [p.id, p]),
    );
    const uniIdx = await loadUniversityIndex();
    const unis = new Map(
      (await prisma.university.findMany({ select: { id: true, name: true, shortName: true } })).map(
        (u) => [u.id, u],
      ),
    );
    const mentionByKey = new Map(
      (await prisma.mention.findMany({ select: { id: true, name: true } })).map((m) => [
        normMention(m.name),
        m,
      ]),
    );
    const names = await mentionNames();
    const esr = await establishmentsReference();
    if (!esr.found)
      await ctx.log(
        'WARN',
        'aucun fichier des établissements : lancer esr-etablissements d’abord (les universités créées n’auront que leur nom)',
      );

    // Planned slugs (stable from one simulation to the next, never rewritten after publication).
    const takenPrograms = new Set(
      (await prisma.program.findMany({ select: { slug: true } })).map((p) => p.slug),
    );
    const takenMentions = new Set(
      (await prisma.mention.findMany({ select: { slug: true } })).map((p) => p.slug),
    );
    const takenUnis = new Set(
      (await prisma.university.findMany({ select: { slug: true } })).map((p) => p.slug),
    );

    const keyOf = (s: StagingRecord) => s.targetId ?? `new:${mm(s).ifc}`;
    // The record carrying the program-level fields: latest session, smallest key.
    const lead = new Map<string, string>();
    for (const s of [...staged].sort(
      (a, b) => mm(b).session - mm(a).session || a.recordKey.localeCompare(b.recordKey),
    )) {
      if (s.matchStatus !== 'LINKED' && s.matchStatus !== 'NEW') continue;
      if (!lead.has(keyOf(s))) lead.set(keyOf(s), s.id);
    }
    const perProgramLatest = new Map<string, number>();
    for (const s of staged)
      if ((s.matchStatus === 'LINKED' || s.matchStatus === 'NEW') && mm(s).session === latest)
        perProgramLatest.set(keyOf(s), (perProgramLatest.get(keyOf(s)) ?? 0) + 1);

    // Plans for new universities and mentions (one name and one slug each, in a stable order).
    // Keyed by the current UAI of the establishment (an old UAI of a merged university is an alias).
    const newUnis = new Map<
      string,
      {
        name: string;
        slug: string;
        ref: EtabNorm | null;
        paysage: string | null;
        aliases: Set<string>;
      }
    >();
    const currentUai = (n: Norm) => {
      const ref = esr.byUai.get(n.uai) ?? (n.paysage ? esr.byPaysage.get(n.paysage) : undefined);
      return ref?.uai ?? n.uai;
    };
    const existingUni = (n: Norm) =>
      uniIdx.byUai.get(n.uai) ??
      (n.paysage ? uniIdx.byPaysage.get(n.paysage) : undefined) ??
      uniIdx.byUai.get(currentUai(n));
    const newMentions = new Map<
      string,
      {
        name: string;
        slug: string;
        fromRncp: string | null;
        domain: string | null;
        publish: boolean;
      }
    >();
    const ordered = [...staged].sort((a, b) => a.recordKey.localeCompare(b.recordKey));
    for (const s of ordered) {
      if (s.matchStatus !== 'LINKED' && s.matchStatus !== 'NEW') continue;
      const n = mm(s);
      if (!existingUni(n)) {
        const cu = currentUai(n);
        const planned = newUnis.get(cu);
        if (planned) planned.aliases.add(n.uai);
        else {
          const ref =
            esr.byUai.get(n.uai) ?? (n.paysage ? esr.byPaysage.get(n.paysage) : undefined) ?? null;
          const name = ref?.name ?? n.etaName;
          const base = slugify(name);
          newUnis.set(cu, {
            name,
            slug: uniqueSlug(takenUnis.has(base) ? `${base}-${cu.toLowerCase()}` : base, takenUnis),
            ref,
            paysage: ref?.paysage ?? n.paysage,
            aliases: new Set([n.uai]),
          });
        }
      }
      if (!mentionByKey.has(n.mentionKey)) {
        const m = newMentions.get(n.mentionKey);
        if (m) m.publish ||= n.session === latest;
        else {
          const rncp = lookupRncpName(names, n.mentionKey);
          const name = rncp?.title ?? prettyMention(n.mention);
          newMentions.set(n.mentionKey, {
            name,
            slug: uniqueSlug(slugify(name), takenMentions),
            fromRncp: rncp?.code ?? null,
            domain: n.domainSlug,
            publish: n.session === latest,
          });
        }
      }
    }
    const newProgramSlug = new Map<string, string>();
    for (const s of ordered) {
      if (lead.get(keyOf(s)) !== s.id || !keyOf(s).startsWith('new:')) continue;
      const n = mm(s);
      const uniId = existingUni(n);
      const nu = newUnis.get(currentUai(n));
      const uniLabel = uniId
        ? (unis.get(uniId)?.shortName ?? unis.get(uniId)?.name)
        : (nu?.ref?.shortName ?? nu?.name);
      newProgramSlug.set(
        keyOf(s),
        uniqueSlug(slugify(`${cleanTitle(n.title)} ${uniLabel ?? n.etaName}`), takenPrograms),
      );
    }

    const upd: { id: string; plan: RecordPlan }[] = [];
    let i = 0;
    for (const s of staged) {
      if (++i % 2000 === 0)
        await ctx.report({
          progress: 55 + Math.round((i / staged.length) * 20),
          step: `Fusion · ${i}/${staged.length}`,
        });
      const n = mm(s);
      const label = `${n.title} · ${n.etaName} (${n.ifc}, ${n.session})`;
      if (s.matchStatus === 'REJECTED' || s.matchStatus === 'IGNORED') {
        upd.push({
          id: s.id,
          plan: {
            action: s.matchStatus === 'REJECTED' ? 'rejected' : 'ignored',
            target: { type: 'program', id: null, label },
            changes: [],
            note: s.matchReason ?? '',
          },
        });
        continue;
      }
      if (s.matchStatus === 'PROPOSED') {
        upd.push({
          id: s.id,
          plan: {
            action: 'proposal',
            target: { type: 'program', id: s.targetId, label },
            changes: [],
            note: s.matchReason ?? '',
            ops: { ifc: n.ifc, session: n.session },
          },
        });
        continue;
      }
      const key = keyOf(s);
      const existing =
        s.targetId && !s.targetId.startsWith('new:') ? programs.get(s.targetId) : undefined;
      const isLead = lead.get(key) === s.id;
      const changes: FieldChange[] = [];
      const place = specificPlaces(n)[0] ?? null;
      const rank = displayedRank(n.stats, n.workStudy);
      const src = {
        sourceKey: ctx.sourceKey,
        source: sourceLabel(n.session),
        sourceUrl: datasetUrl(n.session),
      };
      if (isLead) {
        const pid = existing?.id ?? null;
        const f = (field: string, lbl: string, value: unknown, extra: Partial<typeof src> = {}) =>
          planField(prov, 'PROGRAM', pid, field, lbl, { ...src, ...extra, value });
        // Decision C: the existing title is kept when the normalised titles are identical;
        // a new title only gets a minimal typographic clean-up (no case change, no accent added).
        const title =
          existing && normProgramTitle(existing.title) === n.titleKey
            ? existing.title
            : cleanTitle(n.title);
        changes.push(f('title', 'Intitulé du parcours', title));
        changes.push(f('modality', 'Modalité', n.workStudy ? 'WORK_STUDY' : 'ONSITE'));
        if (place) {
          changes.push(f('city', 'Ville', titleCase(place.commune)));
          changes.push(f('campus', 'Lieu', place.label));
          if (looksLikeComponent(place.label))
            changes.push(f('component', 'Composante', place.label));
        }
        if ((perProgramLatest.get(key) ?? 0) <= 1 && n.session === latest)
          changes.push(f('capacity', 'Places en M1', n.stats.capacity));
        if (n.session === latest)
          changes.push(
            f('lastRankCalled', 'Rang du dernier appelé', rank.rank, {
              source: `${sourceLabel(n.session)} · ${rank.phase ? RANK_PHASE_LABEL[rank.phase] : `n.c. (${rank.reason})`}`,
            }),
          );
      }
      const statBefore = existing?.admissionStats.find(
        (a) =>
          a.monMasterEntry?.code === n.ifc &&
          a.session === n.session &&
          a.source === MM_STAT_SOURCE,
      );
      const statText = statsSummary(n.stats, rank.rank);
      const beforeText = statBefore
        ? statsSummary(
            {
              capacity: statBefore.capacity,
              applications: statBefore.applications,
              offers: statBefore.offers,
              accepted: statBefore.accepted ?? statBefore.seatsTaken,
            } as never,
            statBefore.lastRankCalled,
          )
        : null;
      changes.push({
        entityType: 'PROGRAM',
        entityId: existing?.id ?? null,
        field: `admissions:${n.session}:${n.ifc}`,
        label: `Admissions ${n.session} (${n.ifc})`,
        from: beforeText,
        to: statText,
        source: sourceLabel(n.session),
        outcome: beforeText === statText ? 'unchanged' : beforeText ? 'update' : 'create',
      });
      const uniId = existingUni(n) ?? null;
      const mention =
        mentionByKey.get(n.mentionKey) ??
        mentionByKey.get(normMention(lookupRncpName(names, n.mentionKey)?.title ?? '\u0000'));
      const cu = currentUai(n);
      const nu = newUnis.get(cu);
      const nm = newMentions.get(n.mentionKey);
      const ops: MMOps = {
        programKey: key,
        lead: isLead,
        session: n.session,
        ifc: n.ifc,
        programSlug: newProgramSlug.get(key) ?? null,
        university: uniId
          ? { id: uniId }
          : {
              id: null,
              uai: cu,
              aliases: [...nu!.aliases].filter((a) => a !== cu),
              name: nu!.name,
              slug: nu!.slug,
              paysage: nu!.paysage,
              ref: nu!.ref,
            },
        mention: mention
          ? { id: mention.id, publish: n.session === latest }
          : {
              id: null,
              key: n.mentionKey,
              name: nm!.name,
              slug: nm!.slug,
              rncp: nm!.fromRncp,
              domain: nm!.domain,
              publish: nm!.publish,
            },
        rankPhase: rank.phase,
        rankReason: rank.reason ?? null,
        merge: (s.matchInfo as { merge?: MMOps['merge'] } | null)?.merge ?? null,
      };
      upd.push({
        id: s.id,
        plan: {
          action: existing ? planAction(changes) : 'create',
          target: {
            type: 'program',
            id: existing?.id ?? null,
            label: existing ? `${existing.title} (${n.ifc}, ${n.session})` : label,
          },
          changes,
          ops: ops as never,
        },
      });
    }
    await updateStaging(upd);
  },

  async quality(ctx) {
    const staged = await allStaged(ctx.runId);
    const norm = staged.map(mm);
    const latest = Math.max(...norm.map((n) => n.session));
    const present = new Set(norm.filter((n) => n.session === latest).map((n) => n.ifc));
    const programs = await programRefs();
    const gone = notRenewed(programs, present);
    await recordChecks(
      ctx.runId,
      {
        'Parcours toujours présents dans la dernière session': {
          executed: programs.filter((p) => p.entries.length).length,
          failed: gone.length,
        },
      },
      { replace: true },
    );
    if (gone.length)
      await ctx.alert({
        key: `not-renewed:${latest}`,
        code: 'not-renewed',
        severity: 'INFO',
        title: `${gone.length} parcours non reconduits en ${latest}`,
        detail: `Leurs numéros Mon Master n’apparaissent plus dans la session ${latest}. À confirmer avant de les marquer « non reconduits » (rien n’est supprimé, les avis restent).`,
        link: '/admin/recuperation/rapprochements#non-reconduits',
        linkLabel: 'Confirmer',
        count: gone.length,
      });

    // National summary.
    const plans = staged.map((s) => ({
      s,
      plan: s.plan as unknown as RecordPlan | null,
      n: mm(s),
    }));
    const newUnis = new Set<string>();
    const knownUnis = new Set<string>();
    const newMentions = new Map<string, { name: string; rncp: string | null }>();
    const knownMentions = new Set<string>();
    const newPrograms = new Set<string>();
    const linkedPrograms = new Set<string>();
    const merges: { size: number; recommended: boolean }[] = [];
    for (const { plan, n } of plans) {
      const ops = (plan?.ops ?? {}) as unknown as MMOps;
      if (plan?.action === 'create' || plan?.action === 'update' || plan?.action === 'unchanged') {
        if (ops.university.id) knownUnis.add(ops.university.id);
        else newUnis.add((ops.university as { uai: string }).uai);
        if (ops.mention.id) knownMentions.add(ops.mention.id);
        else
          newMentions.set(ops.mention.key!, {
            name: ops.mention.name!,
            rncp: ops.mention.rncp ?? null,
          });
        if (ops.programKey.startsWith('new:')) newPrograms.add(ops.programKey);
        else linkedPrograms.add(ops.programKey);
        if (ops.merge && ops.lead && n.session === latest)
          merges.push({ size: ops.merge.groupSize, recommended: ops.merge.recommended });
      }
    }
    const distinct = (st: string) =>
      new Set(staged.filter((s) => s.matchStatus === st).map((s) => mm(s).ifc)).size;
    const national = {
      sessions: Object.fromEntries(
        [...new Set(norm.map((n) => n.session))]
          .sort()
          .map((x) => [x, norm.filter((n) => n.session === x).length]),
      ),
      formationsLatest: present.size,
      universities: { existing: knownUnis.size, new: newUnis.size },
      mentions: {
        existing: knownMentions.size,
        new: newMentions.size,
        namedFromRncp: [...newMentions.values()].filter((m) => m.rncp).length,
        namedFromMonMaster: [...newMentions.values()].filter((m) => !m.rncp).length,
      },
      accreditations: new Set(norm.map((n) => `${n.uai}:${n.inm}`)).size,
      programs: { linked: linkedPrograms.size, new: newPrograms.size },
      proposals: {
        succession: distinct('PROPOSED'),
        merge: merges.length,
        mergeRecommended: merges.filter((m) => m.recommended).length,
        mergeGroupsOf2: merges.filter((m) => m.size === 2).length,
      },
      historyOnly: distinct('IGNORED'),
      rejected: staged.filter((s) => s.matchStatus === 'REJECTED').length,
      notRenewed: gone.length,
    };

    // Sample (decision H): 20 random parcours (seeded by the run, pilots excluded), each field of
    // the plan compared with the raw source line, re-derived independently from the CSV columns.
    const pilots = new Set(
      (await prisma.program.findMany({ where: { origin: 'MANUAL' }, select: { id: true } })).map(
        (p) => p.id,
      ),
    );
    const candidates = plans.filter(({ plan, n }) => {
      const ops = (plan?.ops ?? {}) as unknown as MMOps;
      return (
        (plan?.action === 'create' || plan?.action === 'update') &&
        ops.lead &&
        n.session === latest &&
        !pilots.has(ops.programKey)
      );
    });
    const sample = seededOrder(candidates, ctx.runId, (c) => c.n.ifc)
      .slice(0, 20)
      .map(({ s, plan, n }) => {
        const raw = s.payload as Record<string, string>;
        const ops = plan!.ops as unknown as MMOps;
        const planned = (field: string) => plan!.changes.find((c) => c.field === field)?.to;
        const rank = displayedRank(n.stats, n.workStudy);
        const rawRank =
          raw.alternance === '1'
            ? null
            : raw.pc === '1' && raw.rang_dernier_appele_pc
              ? Number(raw.rang_dernier_appele_pc)
              : raw.rang_dernier_appele_pp
                ? Number(raw.rang_dernier_appele_pp)
                : null;
        const rawPlace = specificPlaces({
          places: normalizeRow(raw, 'main').places,
          etaName: raw.eta_nom ?? '',
        })[0];
        const fields = [
          {
            field: 'Intitulé',
            source: raw.parcours ?? raw.mention ?? '',
            planned: planned('title'),
            ok:
              normProgramTitle(String(planned('title') ?? '')) ===
              normProgramTitle(displayTitle(raw.parcours, raw.mention ?? '')),
          },
          {
            field: 'Université',
            source: `${raw.eta_nom} (${raw.eta_uai})`,
            planned:
              ops.university.id !== null ? 'fiche existante' : `${ops.university.name} (nouvelle)`,
            ok:
              ops.university.id !== null ||
              normCode(raw.eta_uai) === ops.university.uai ||
              ops.university.aliases.includes(normCode(raw.eta_uai)),
          },
          {
            field: 'Mention',
            source: raw.mention ?? '',
            planned: ops.mention.id ? 'fiche existante' : ops.mention.name,
            ok:
              !!ops.mention.id ||
              normMention(ops.mention.name) === normMention(raw.mention) ||
              !!ops.mention.rncp,
          },
          {
            field: 'Ville',
            source: raw.lieux ?? '',
            planned: planned('city'),
            ok: !rawPlace || normCity(String(planned('city') ?? '')) === normCity(rawPlace.commune),
          },
          {
            field: 'Modalité',
            source: `alternance=${raw.alternance}`,
            planned: planned('modality'),
            ok: planned('modality') === (raw.alternance === '1' ? 'WORK_STUDY' : 'ONSITE'),
          },
          {
            field: 'Places',
            source: raw.col ?? '',
            planned: n.stats.capacity,
            ok: String(n.stats.capacity ?? '') === (raw.col ?? ''),
          },
          {
            field: 'Candidatures (PP)',
            source: raw.n_can_pp ?? '',
            planned: n.stats.applications,
            ok: String(n.stats.applications ?? '') === (raw.n_can_pp ?? ''),
          },
          {
            field: 'Propositions',
            source: raw.n_prop_total ?? '',
            planned: n.stats.offers,
            ok: String(n.stats.offers ?? '') === (raw.n_prop_total ?? ''),
          },
          {
            field: 'Acceptations',
            source: raw.n_accept_total ?? '',
            planned: n.stats.accepted,
            ok: String(n.stats.accepted ?? '') === (raw.n_accept_total ?? ''),
          },
          {
            field: 'Rang affiché',
            source: `pp=${raw.rang_dernier_appele_pp ?? '∅'} pc=${raw.rang_dernier_appele_pc ?? '∅'} (pc=${raw.pc}, alternance=${raw.alternance})`,
            planned: rank.rank == null ? `n.c. (${rank.reason})` : `${rank.rank} (${rank.phase})`,
            ok: rank.rank === rawRank,
          },
        ];
        return {
          ifc: n.ifc,
          university: raw.eta_nom,
          title: planned('title'),
          slug: ops.programSlug,
          fields,
        };
      });
    const compared = sample.reduce((a, x) => a + x.fields.length, 0);
    const mismatches = sample.reduce((a, x) => a + x.fields.filter((f) => !f.ok).length, 0);
    await recordChecks(
      ctx.runId,
      {
        'Échantillon : champs conformes à la ligne source': {
          executed: compared,
          failed: mismatches,
        },
      },
      { replace: true },
    );

    const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: ctx.runId } });
    await prisma.syncRun.update({
      where: { id: ctx.runId },
      data: { diff: { ...(run.diff as object), national, sample } as never },
    });
    await ctx.log(
      'OK',
      `bilan : ${national.universities.new} universités nouvelles, ${national.mentions.new} mentions nouvelles (${national.mentions.namedFromRncp} nommées d’après le RNCP), ${national.programs.new} parcours nouveaux, ${national.programs.linked} reliés, ${national.proposals.succession} successions et ${national.proposals.merge} fusions proposées · échantillon : ${compared - mismatches}/${compared} champs conformes`,
    );
    return mismatches
      ? { blocking: `échantillon : ${mismatches} champ(s) non conforme(s) à la ligne source` }
      : {};
  },

  async publish(ctx) {
    return publishMonMaster(ctx);
  },
};

/**
 * Columns of the payload kept in staging (not the 150 columns). The origin columns are read by the
 * publication into AdmissionOrigin and the three accepted counts, then left out of AdmissionStat.raw.
 */
const KEEP = [
  ...ORIGIN_SOURCE_COLUMNS,
  'session',
  'pp',
  'pc',
  'eta_uai',
  'eta_nom',
  'ifc',
  'inm',
  'mention',
  'inmp',
  'parcours',
  'alternance',
  'modalite_enseignement',
  'lieux',
  'lieux_formation',
  'disci_master',
  'secteur_disci_lib',
  'acad_lib',
  'col',
  'n_can',
  'n_can_pp',
  'n_can_pc',
  'n_clas',
  'n_clas_total',
  'n_prop',
  'n_prop_total',
  'n_accept',
  'n_accept_total',
  'rang_dernier',
  'rang_dernier_appele_pp',
  'rang_dernier_appele_pc',
  'n_recrut_comp',
  'id_paysage',
  'id_paysage_actuel',
];
