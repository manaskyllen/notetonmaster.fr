/**
 * univ-sites, lot 3: page ↔ parcours matching, merge of the pages of a parcours (M1 and M2 pages,
 * on-site and work-study versions), coverage per parcours, publication.
 *
 * - A page linked to a parcours fills its rubrics; a mention page fills the common fields of the
 *   mention only (objectives → description, skills), never the units of a parcours.
 * - Several pages for one parcours: each rubric comes from the page that has the most rubrics,
 *   the units and admission lists are united.
 * - A value older than the previous academic year is STALE. Locks and priorities: lib/data/merge.
 */
import { prisma } from '@/lib/db';
import type { FieldChange, RecordPlan } from '@/lib/data/diff';
import { loadDecisions, fromDecision } from '@/lib/data/match';
import {
  applyFieldChangesBulk,
  loadProvenance,
  planField,
  type ProvenanceIndex,
} from '@/lib/data/merge';
import { recordChecks, stagedRecords, updateStaging } from '@/lib/data/pipeline';
import { emptyStats, type PipelineContext, type RunStats } from '../types';
import { writeProgramme } from '@/lib/catalog/program-courses';
import {
  programmeFromSemesters,
  splitLegacySemester,
  type SemesterPlan,
} from '@/lib/domain/program-outline';
import { matchPage, type Candidate } from './match';
import {
  semestersOf,
  type CourseUnit,
  type Field,
  type PageExtraction,
  type Rubric,
} from './sections';
import type { PageFacts } from './index';
import type { Template } from './profiles';

export const SOURCE_LABEL = 'Site de l’université';
const SOURCE_KEY = 'univ-sites';

interface MatchInfo {
  level: 'PARCOURS' | 'MENTION' | null;
  programIds: string[];
  mentionId: string | null;
}

/** Start year of the current academic year (September → August). */
export function academicStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

/** A value read in a document older than the previous academic year is STALE. */
export function stateOf(year: string | null, now = new Date()): 'OK' | 'STALE' {
  if (!year) return 'OK';
  const start = Number(year.slice(0, 4));
  return start < academicStart(now) - 1 ? 'STALE' : 'OK';
}

// ───────────────────────────── match ─────────────────────────────

async function candidatesByUniversity(universityIds: string[]): Promise<Map<string, Candidate[]>> {
  const children = await prisma.university.findMany({
    where: { parentId: { in: universityIds } },
    select: { id: true, parentId: true },
  });
  const owners = new Map<string, string[]>(universityIds.map((id) => [id, [id]]));
  for (const c of children) owners.get(c.parentId!)?.push(c.id);
  const all = [...new Set([...owners.values()].flat())];
  // only the parcours of the open cities: the others are not collected
  const programs = await prisma.program.findMany({
    where: { universityId: { in: all }, status: 'ACTIVE', inOpenZone: true },
    select: {
      id: true,
      title: true,
      city: true,
      universityId: true,
      mentionId: true,
      mention: { select: { name: true, rncpCode: true } },
      monMasterEntries: { select: { code: true } },
    },
  });
  const out = new Map<string, Candidate[]>();
  for (const [uni, ids] of owners)
    out.set(
      uni,
      programs
        .filter((p) => ids.includes(p.universityId))
        .map((p) => ({
          id: p.id,
          title: p.title,
          city: p.city,
          mentionId: p.mentionId,
          mentionName: p.mention.name,
          rncp: p.mention.rncpCode ? p.mention.rncpCode.toUpperCase().replace(/\s+/g, '') : null,
          ifcs: p.monMasterEntries.map((e) => e.code),
        })),
    );
  return out;
}

export async function matchStep(ctx: PipelineContext) {
  const facts: { id: string; key: string; f: PageFacts }[] = [];
  for await (const rows of stagedRecords(ctx.runId))
    for (const r of rows)
      facts.push({ id: r.id, key: r.recordKey, f: r.normalized as unknown as PageFacts });
  const cands = await candidatesByUniversity([...new Set(facts.map((x) => x.f.universityId))]);
  const decisions = await loadDecisions(SOURCE_KEY);
  const upd: Parameters<typeof updateStaging>[0] = [];
  const count = { LINKED: 0, PROPOSED: 0, NEW: 0, MENTION: 0, decided: 0 };
  for (const { id, key, f } of facts) {
    const d = fromDecision(decisions.get(key));
    if (d) {
      count.decided++;
      const linked = d.status === 'LINKED' && 'id' in d;
      upd.push({
        id,
        matchStatus: linked ? 'LINKED' : d.status,
        matchScore: d.score,
        matchReason: d.reason,
        targetType: linked ? 'PROGRAM' : null,
        targetId: linked ? d.id : null,
        matchInfo: {
          level: linked ? 'PARCOURS' : null,
          programIds: linked ? [d.id] : [],
          mentionId: null,
        } satisfies MatchInfo as never,
      });
      continue;
    }
    const m = matchPage(f, cands.get(f.universityId) ?? []);
    if (m.status === 'LINKED') count[m.level === 'MENTION' ? 'MENTION' : 'LINKED']++;
    else count[m.status]++;
    upd.push({
      id,
      matchStatus: m.status,
      matchScore: Math.round(m.score * 1000) / 1000,
      matchReason: m.reason,
      targetType: m.level === 'MENTION' ? 'MENTION' : m.programIds.length ? 'PROGRAM' : null,
      targetId: m.level === 'MENTION' ? m.mentionId : (m.programIds[0] ?? null),
      matchInfo: {
        level: m.level,
        programIds: m.programIds,
        mentionId: m.mentionId,
      } satisfies MatchInfo as never,
    });
  }
  await updateStaging(upd);
  await ctx.log(
    'OK',
    `${facts.length} pages : ${count.LINKED} rapprochées d’un parcours, ${count.MENTION} pages de mention, ${count.PROPOSED} à valider, ${count.NEW} sans parcours${count.decided ? `, ${count.decided} décisions appliquées` : ''}`,
  );
}

// ───────────────────────────── combine the pages of a parcours ─────────────────────────────

export interface Combined {
  rubrics: Partial<Record<Rubric, Field<string> & { url: string }>>;
  units: (Field<CourseUnit[]> & { url: string }) | null;
  admission: Partial<
    Record<
      'expectations' | 'selectionCriteria' | 'advisedDegrees' | 'requirements' | 'examModes',
      Field<string[]> & { url: string }
    >
  >;
  languages: (Field<string[]> & { url: string }) | null;
  /** Rubrics found over all the pages (the « 3 rubriques ou plus » measure). */
  rubricCount: number;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function combine(pages: { url: string; x: PageExtraction }[]): Combined {
  const sorted = [...pages].sort((a, b) => b.x.rubricCount - a.x.rubricCount);
  const out: Combined = {
    rubrics: {},
    units: null,
    admission: {},
    languages: null,
    rubricCount: 0,
  };
  for (const { url, x } of sorted) {
    for (const [k, v] of Object.entries(x.rubrics) as [Rubric, Field<string>][])
      if (!out.rubrics[k]) out.rubrics[k] = { ...v, url };
    if (x.units) {
      const units = [...(out.units?.value ?? []), ...x.units.value];
      const seen = new Set<string>();
      const value = units.filter((u) => {
        const k = `${u.title.toLowerCase()}|${u.semester ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      out.units =
        out.units && out.units.value.length >= x.units.value.length
          ? { ...out.units, value }
          : { ...x.units, url, value };
    }
    for (const [k, v] of Object.entries(x.admission) as [
      keyof Combined['admission'],
      Field<string[]>,
    ][]) {
      const cur = out.admission[k];
      out.admission[k] = cur ? { ...cur, value: uniq([...cur.value, ...v.value]) } : { ...v, url };
    }
    if (x.languages)
      out.languages = out.languages
        ? { ...out.languages, value: uniq([...out.languages.value, ...x.languages.value]) }
        : { ...x.languages, url };
  }
  const found = new Set<string>(Object.keys(out.rubrics));
  if (out.units) found.add('programme');
  if (out.languages) found.add('langues');
  out.rubricCount = found.size;
  return out;
}

/** Program fields written from the rubrics (field → label). */
export const PROGRAM_FIELDS: Record<string, string> = {
  objectives: 'Objectifs',
  skills: 'Compétences',
  admissionCriteria: 'Admission',
  expectations: 'Attendus',
  selectionCriteria: 'Critères d’examen',
  advisedDegrees: 'Diplômes conseillés',
  requirements: 'Prérequis',
  examModes: 'Modalités d’examen',
  semesters: 'Programme',
  internships: 'Stages',
  furtherStudies: 'Poursuite d’études',
  languages: 'Langues',
  tuitionFees: 'Frais',
};

const RUBRIC_FIELD: Partial<Record<Rubric, string>> = {
  objectifs: 'objectives',
  competences: 'skills',
  admission: 'admissionCriteria',
  stages: 'internships',
  poursuite: 'furtherStudies',
  frais: 'tuitionFees',
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** Field changes of one parcours (or mention) from its combined pages. */
export function planChanges(
  prov: ProvenanceIndex,
  entityType: 'PROGRAM' | 'MENTION',
  entityId: string,
  c: Combined,
  now = new Date(),
): FieldChange[] {
  const changes: FieldChange[] = [];
  const add = (
    field: string,
    label: string,
    f: { url: string; evidence: string; year: string | null },
    value: unknown,
  ) =>
    changes.push(
      planField(prov, entityType, entityId, field, label, {
        value,
        sourceKey: SOURCE_KEY,
        source: `${SOURCE_LABEL} · ${hostOf(f.url)}${f.year ? ` · ${f.year}` : ''}`,
        sourceUrl: f.url,
        state: stateOf(f.year, now),
        evidence: f.evidence,
      }),
    );
  if (entityType === 'MENTION') {
    if (c.rubrics.objectifs)
      add('description', 'Objectifs de la mention', c.rubrics.objectifs, c.rubrics.objectifs.value);
    if (c.rubrics.competences)
      add(
        'skills',
        'Compétences de la mention',
        c.rubrics.competences,
        c.rubrics.competences.value,
      );
    return changes;
  }
  for (const [rubric, field] of Object.entries(RUBRIC_FIELD) as [Rubric, string][]) {
    const f = c.rubrics[rubric];
    if (f) add(field, PROGRAM_FIELDS[field]!, f, f.value);
  }
  for (const [k, f] of Object.entries(c.admission))
    if (f) add(k, PROGRAM_FIELDS[k]!, f, k === 'requirements' ? f.value.join(' ; ') : f.value);
  if (c.units)
    add(
      'semesters',
      PROGRAM_FIELDS.semesters!,
      c.units,
      semestersOf(c.units.value).map((s) => ({ label: s.label, content: s.content })),
    );
  if (c.languages) add('languages', PROGRAM_FIELDS.languages!, c.languages, c.languages.value);
  return changes;
}

function actionOf(changes: FieldChange[]): RecordPlan['action'] {
  return changes.some(
    (c) => c.outcome === 'create' || c.outcome === 'update' || c.outcome === 'conflict',
  )
    ? 'update'
    : 'unchanged';
}

export async function mergeStep(ctx: PipelineContext) {
  const rows: {
    id: string;
    key: string;
    status: string | null;
    reason: string | null;
    info: MatchInfo;
    f: PageFacts;
  }[] = [];
  for await (const batch of stagedRecords(ctx.runId))
    for (const r of batch)
      rows.push({
        id: r.id,
        key: r.recordKey,
        status: r.matchStatus,
        reason: r.matchReason,
        info: (r.matchInfo ?? {
          level: null,
          programIds: [],
          mentionId: null,
        }) as unknown as MatchInfo,
        f: r.normalized as unknown as PageFacts,
      });

  // groups: one per parcours (all its programs share the pages), one per mention page set
  const groups = new Map<
    string,
    { type: 'PROGRAM' | 'MENTION'; ids: string[]; rows: typeof rows }
  >();
  for (const r of rows) {
    if (r.status !== 'LINKED') continue;
    const key =
      r.info.level === 'MENTION'
        ? `M:${r.info.mentionId}`
        : `P:${[...r.info.programIds].sort().join(',')}`;
    const g = groups.get(key) ?? {
      type: r.info.level === 'MENTION' ? ('MENTION' as const) : ('PROGRAM' as const),
      ids: r.info.level === 'MENTION' ? [r.info.mentionId!] : r.info.programIds,
      rows: [],
    };
    g.rows.push(r);
    groups.set(key, g);
  }
  const programIds = [...groups.values()].filter((g) => g.type === 'PROGRAM').flatMap((g) => g.ids);
  const mentionIds = [...groups.values()].filter((g) => g.type === 'MENTION').flatMap((g) => g.ids);
  const [provP, provM] = await Promise.all([
    loadProvenance('PROGRAM', programIds),
    loadProvenance('MENTION', mentionIds),
  ]);
  const labels = new Map(
    (
      await prisma.program.findMany({
        where: { id: { in: programIds } },
        select: { id: true, title: true, university: { select: { shortName: true, name: true } } },
      })
    ).map((p) => [p.id, `${p.title} · ${p.university.shortName ?? p.university.name}`]),
  );
  const mentionNames = new Map(
    (
      await prisma.mention.findMany({
        where: { id: { in: mentionIds } },
        select: { id: true, name: true },
      })
    ).map((m) => [m.id, m.name]),
  );

  const plans = new Map<string, RecordPlan>();
  for (const g of groups.values()) {
    const c = combine(g.rows.map((r) => ({ url: r.key, x: r.f.extraction })));
    const prov = g.type === 'MENTION' ? provM : provP;
    const changes = g.ids.flatMap((id) => planChanges(prov, g.type, id, c));
    const primary = [...g.rows].sort(
      (a, b) => b.f.extraction.rubricCount - a.f.extraction.rubricCount,
    )[0]!;
    const label =
      g.type === 'MENTION'
        ? `Mention ${mentionNames.get(g.ids[0]!) ?? ''}`
        : (labels.get(g.ids[0]!) ?? primary.f.title);
    plans.set(primary.id, {
      action: actionOf(changes),
      target: { type: g.type === 'MENTION' ? 'mention' : 'program', id: g.ids[0] ?? null, label },
      changes,
      ops: {
        programIds: g.type === 'PROGRAM' ? g.ids : [],
        mentionId: g.type === 'MENTION' ? g.ids[0] : null,
        pages: g.rows.map((r) => r.key),
        rubricCount: c.rubricCount,
        units: c.units?.value.length ?? 0,
        semesters: c.units
          ? programmeFromSemesters(semestersOf(c.units.value), c.rubrics.stages?.value ?? null)
          : null,
        semesterSource: c.units ? { url: c.units.url, year: c.units.year } : null,
      },
      note: g.rows.length > 1 ? `${g.rows.length} pages réunies` : (primary.reason ?? undefined),
    });
    for (const r of g.rows)
      if (r.id !== primary.id)
        plans.set(r.id, {
          action: 'ignored',
          target: {
            type: g.type === 'MENTION' ? 'mention' : 'program',
            id: g.ids[0] ?? null,
            label,
          },
          changes: [],
          note: `réunie avec ${primary.key}`,
        });
  }
  const upd = rows.map((r) => ({
    id: r.id,
    plan:
      plans.get(r.id) ??
      ({
        action: r.status === 'PROPOSED' ? 'proposal' : 'ignored',
        target: { type: 'page', id: r.info.programIds[0] ?? null, label: r.f.title || r.key },
        changes: [],
        note: r.reason ?? undefined,
      } satisfies RecordPlan),
  }));
  await updateStaging(upd);
}

// ───────────────────────────── coverage per parcours ─────────────────────────────

export interface ProgramCoverage {
  programs: number;
  zero: number;
  few: number;
  threeOrMore: number;
  rate: number;
}

export async function coverageStep(
  ctx: PipelineContext,
  templates: Map<string, Template>,
  activeTemplates: Set<Template> | null,
) {
  const rubricsOf = new Map<string, number>();
  const pages = {
    byTemplate: new Map<
      string,
      { pages: number; linked: number; mention: number; proposed: number; none: number }
    >(),
  };
  for await (const batch of stagedRecords(ctx.runId))
    for (const r of batch) {
      const f = r.normalized as unknown as PageFacts;
      const plan = r.plan as RecordPlan | null;
      const info = (r.matchInfo ?? {}) as Partial<MatchInfo>;
      const t = pages.byTemplate.get(f.template) ?? {
        pages: 0,
        linked: 0,
        mention: 0,
        proposed: 0,
        none: 0,
      };
      t.pages++;
      if (r.matchStatus === 'LINKED') t[info.level === 'MENTION' ? 'mention' : 'linked']++;
      else if (r.matchStatus === 'PROPOSED') t.proposed++;
      else t.none++;
      pages.byTemplate.set(f.template, t);
      const ops = plan?.ops as { programIds?: string[]; rubricCount?: number } | undefined;
      for (const id of ops?.programIds ?? [])
        rubricsOf.set(id, Math.max(rubricsOf.get(id) ?? 0, ops?.rubricCount ?? 0));
    }
  const unis = [...templates.keys()];
  const programs = await prisma.program.findMany({
    where: {
      status: 'ACTIVE',
      inOpenZone: true,
      OR: [{ universityId: { in: unis } }, { university: { parentId: { in: unis } } }],
    },
    select: { id: true, universityId: true, university: { select: { parentId: true } } },
  });
  const empty = (): ProgramCoverage => ({ programs: 0, zero: 0, few: 0, threeOrMore: 0, rate: 0 });
  const byTemplate: Record<string, ProgramCoverage> = {};
  const byUniversity: Record<string, ProgramCoverage> = {};
  for (const p of programs) {
    const owner = templates.has(p.universityId) ? p.universityId : p.university.parentId!;
    const t = templates.get(owner);
    if (!t || (activeTemplates && !activeTemplates.has(t))) continue;
    const n = rubricsOf.get(p.id) ?? 0;
    for (const c of [(byTemplate[t] ??= empty()), (byUniversity[owner] ??= empty())]) {
      c.programs++;
      if (n === 0) c.zero++;
      else if (n < 3) c.few++;
      else c.threeOrMore++;
    }
  }
  for (const c of [...Object.values(byTemplate), ...Object.values(byUniversity)])
    c.rate = c.programs ? c.threeOrMore / c.programs : 0;
  const matching = Object.fromEntries(
    [...pages.byTemplate].map(([k, v]) => [
      k,
      { ...v, autoRate: v.pages ? (v.linked + v.mention) / v.pages : 0 },
    ]),
  );
  for (const [t, c] of Object.entries(byTemplate))
    await ctx.log(
      c.rate >= 0.7 ? 'OK' : 'WARN',
      `${t} : ${c.threeOrMore} / ${c.programs} parcours avec 3 rubriques ou plus (${Math.round(c.rate * 100)} %, objectif 70 %)`,
    );
  for (const [t, m] of Object.entries(matching))
    await ctx.log(
      'INFO',
      `${t} : rapprochement automatique de ${m.linked + m.mention} pages sur ${m.pages} (${Math.round(m.autoRate * 100)} %), ${m.proposed} à valider, ${m.none} sans parcours`,
    );
  await recordChecks(
    ctx.runId,
    {
      'Pages rapprochées automatiquement': {
        executed: [...pages.byTemplate.values()].reduce((a, v) => a + v.pages, 0),
        failed: 0,
      },
    },
    { replace: true },
  );
  return { programs: { byTemplate, byUniversity }, matching };
}

// ───────────────────────────── publish ─────────────────────────────

const COLUMN: Record<string, string> = {
  objectives: 'objectives',
  skills: 'skills',
  admissionCriteria: 'admissionCriteria',
  expectations: 'expectations',
  selectionCriteria: 'selectionCriteria',
  advisedDegrees: 'advisedDegrees',
  requirements: 'requirements',
  examModes: 'examModes',
  internships: 'internships',
  furtherStudies: 'furtherStudies',
  languages: 'languages',
  tuitionFees: 'tuitionFees',
};

export async function publishStep(ctx: PipelineContext): Promise<RunStats> {
  const stats = emptyStats();
  const items: { change: FieldChange; entityId: string }[] = [];
  const ops: {
    programIds: string[];
    mentionId: string | null;
    pages: string[];
    semesters:
      (Partial<SemesterPlan> & { position: number; label: string; content: string })[] | null;
    semesterSource: { url: string; year: string | null } | null;
  }[] = [];
  for await (const batch of stagedRecords(ctx.runId))
    for (const r of batch) {
      const plan = r.plan as RecordPlan | null;
      if (!plan || (plan.action !== 'update' && plan.action !== 'unchanged')) continue;
      for (const c of plan.changes) if (c.entityId) items.push({ change: c, entityId: c.entityId });
      if (plan.ops) ops.push(plan.ops as never);
    }
  const values = await applyFieldChangesBulk(items, SOURCE_KEY, stats, async (done, total) =>
    ctx.report({ progress: 90, step: `Publication · ${done} / ${total} champs` }),
  );
  const mentionIds = new Set(ops.map((o) => o.mentionId).filter(Boolean) as string[]);
  for (const [entityId, fields] of values) {
    if (mentionIds.has(entityId)) {
      const data: Record<string, unknown> = {};
      if (fields.has('description')) data.description = fields.get('description');
      if (fields.has('skills')) data.skills = fields.get('skills');
      if (Object.keys(data).length) await prisma.mention.update({ where: { id: entityId }, data });
      continue;
    }
    const data: Record<string, unknown> = {};
    for (const [field, value] of fields) {
      const col = COLUMN[field];
      if (!col || value === undefined) continue;
      data[col] = value;
    }
    if (Object.keys(data).length) await prisma.program.update({ where: { id: entityId }, data });
  }
  // rows: semesters, only where the field was written (never over a lock)
  for (const o of ops) {
    for (const programId of o.programIds) {
      const written = values.get(programId);
      if (o.semesters && written?.has('semesters') && written.get('semesters') !== undefined) {
        // runs staged before the courses lot only carry the text: split it the same way
        await writeProgramme(
          programId,
          o.semesters.map((sem) => {
            const plan = sem.courses
              ? { courses: sem.courses, milestones: sem.milestones ?? [] }
              : splitLegacySemester(sem.content);
            return { label: sem.label, content: sem.content, ...plan };
          }),
          {
            document: `${SOURCE_LABEL} · ${hostOf(o.semesterSource?.url ?? '')}`,
            year: o.semesterSource?.year ?? null,
            course: `${SOURCE_LABEL} · ${hostOf(o.semesterSource?.url ?? '')}`,
          },
        );
      }
    }
    await prisma.crawlPage.updateMany({
      where: { url: { in: o.pages } },
      data: { programId: o.programIds[0] ?? null, mentionId: o.mentionId },
    });
  }
  await ctx.log(
    'OK',
    `${stats.created} champs créés, ${stats.updated} mis à jour, ${stats.unchanged} inchangés, ${stats.skippedLocked} verrouillés, ${stats.conflicts} conflits`,
  );
  return stats;
}
