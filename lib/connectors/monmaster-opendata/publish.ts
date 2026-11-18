/**
 * Batched publication of a Mon Master simulation (decision F): phases writing by batches of
 * 1 000 rows in short transactions (createMany, grouped upserts, raw SQL), never row by row.
 * Every phase is idempotent and recorded in SyncRun.stats.publishPhase: an interrupted
 * publication resumes at the first phase not completed. The search index is rebuilt once, at the
 * end, by the runner.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { StagingRecord } from '@/lib/db/generated/client';
import type { RecordPlan } from '@/lib/data/diff';
import {
  GEO_COMMUNES_URL,
  centre,
  loadCommunes,
  resolveCommune,
  type Commune,
  type CommuneIndex,
} from '@/lib/data/geo';
import {
  applyFieldChangesBulk,
  chunks,
  type BulkChange,
  type PublishCounters,
} from '@/lib/data/merge';
import { normCode, normMention, normText, slugify } from '@/lib/data/normalize';
import { applyParentDecisions } from '@/lib/data/parents';
import type { EtabNorm } from '../esr-etablissements';
import { emptyStats, type PipelineContext } from '../types';
import { displayedRank, specificPlaces, type MMRecord } from './normalize';
import {
  detailRow,
  rawWithoutOrigins,
  writeAdmissionDetails,
  type AdmissionDetailRow,
} from './origins';
import { MM_STAT_SOURCE, allStaged, datasetUrl, sourceLabel, titleCase } from './shared';

export interface MMOps {
  programKey: string;
  lead: boolean;
  session: number;
  ifc: string;
  programSlug: string | null;
  university:
    | { id: string }
    | {
        id: null;
        uai: string;
        aliases: string[];
        name: string;
        slug: string;
        paysage: string | null;
        ref: EtabNorm | null;
      };
  mention:
    | {
        id: string;
        publish: boolean;
        key?: undefined;
        name?: undefined;
        slug?: undefined;
        rncp?: undefined;
        domain?: undefined;
      }
    | {
        id: null;
        key: string;
        name: string;
        slug: string;
        rncp: string | null;
        domain: string | null;
        publish: boolean;
      };
  rankPhase: 'PP' | 'PC' | null;
  rankReason: string | null;
  merge: {
    withIfc: string;
    programId: string | null;
    recommended: boolean;
    groupSize: number;
  } | null;
}

const PHASES = [
  'universités',
  'mentions',
  'accréditations',
  'villes, campus et composantes',
  'fiches parcours',
  'champs et provenance',
  'numéros Mon Master',
  'statistiques d’admission',
  'identifiants',
  'propositions de fusion',
  'successions et finitions',
] as const;

interface Item {
  s: StagingRecord;
  n: MMRecord;
  plan: RecordPlan;
  ops: MMOps;
}

async function setPhase(runId: string, phase: number) {
  const r = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    select: { stats: true },
  });
  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      heartbeatAt: new Date(),
      stats: { ...((r.stats as object) ?? {}), publishPhase: phase } as never,
    },
  });
}

const uniqueSlug = (base: string, taken: Set<string>) => {
  let slug = base || 'fiche';
  for (let k = 2; taken.has(slug); k++) slug = `${base}-${k}`;
  taken.add(slug);
  return slug;
};

export async function publishMonMaster(
  ctx: PipelineContext,
): Promise<PublishCounters & Record<string, unknown>> {
  const t0 = Date.now();
  const counters: PublishCounters & Record<string, unknown> = { ...emptyStats() };
  const runRow = await prisma.syncRun.findUniqueOrThrow({
    where: { id: ctx.runId },
    select: { stats: true },
  });
  const startPhase = Number(((runRow.stats ?? {}) as { publishPhase?: number }).publishPhase ?? 0);
  if (startPhase > 0)
    await ctx.log('INFO', `publication reprise à la phase « ${PHASES[startPhase] ?? 'fin'} »`);

  const items: Item[] = (await allStaged(ctx.runId))
    .map((s) => ({
      s,
      n: s.normalized as unknown as MMRecord,
      plan: s.plan as unknown as RecordPlan,
    }))
    .filter((x) => x.plan && ['create', 'update', 'unchanged'].includes(x.plan.action))
    .map((x) => ({ ...x, ops: x.plan.ops as unknown as MMOps }));
  const leads = items.filter((i) => i.ops.lead);
  const timings: Record<string, number> = {};
  const phase = async (k: number, fn: () => Promise<void>) => {
    if (k < startPhase) return;
    const t = Date.now();
    await ctx.report({
      progress: 80 + Math.round((k / PHASES.length) * 19),
      step: `Publication · ${PHASES[k]}`,
    });
    await fn();
    const name = PHASES[k]!;
    timings[name] = Math.round((Date.now() - t) / 100) / 10;
    await ctx.log('OK', `publication · ${name} (${timings[name]} s)`);
    await setPhase(ctx.runId, k + 1);
  };

  // ── lookups, rebuilt from the database (so a resumed publication finds what was written) ──
  const uniByUai = async () => {
    const m = new Map<string, string>();
    for (const u of await prisma.university.findMany({ select: { id: true, uai: true } }))
      if (u.uai) m.set(normCode(u.uai), u.id);
    for (const i of await prisma.identifier.findMany({
      where: { entityType: 'UNIVERSITY', kind: 'UAI' },
    }))
      if (!m.has(i.value)) m.set(i.value, i.entityId);
    return m;
  };
  const mentionByKey = async () =>
    new Map(
      (await prisma.mention.findMany({ select: { id: true, name: true } })).map((m) => [
        normMention(m.name),
        m.id,
      ]),
    );
  const uniOf = (i: Item, map: Map<string, string>) =>
    i.ops.university.id !== null
      ? i.ops.university.id
      : (map.get(normCode(i.ops.university.uai)) ?? map.get(normCode(i.n.uai))!);
  const mentionOf = (i: Item, map: Map<string, string>) =>
    i.ops.mention.id ?? map.get(normMention(i.ops.mention.name!))!;

  // 1. universities
  await phase(0, async () => {
    const existing = await uniByUai();
    const paysages = new Set(
      (await prisma.university.findMany({ select: { paysageId: true } }))
        .map((u) => u.paysageId)
        .filter(Boolean),
    );
    const slugs = new Set(
      (await prisma.university.findMany({ select: { slug: true } })).map((u) => u.slug),
    );
    const todo = new Map<string, Extract<MMOps['university'], { id: null }>>();
    const aliases = new Map<string, Set<string>>();
    for (const i of items) {
      const u = i.ops.university;
      if (u.id !== null) continue;
      for (const a of [...u.aliases, normCode(i.n.uai)])
        if (a !== u.uai) (aliases.get(u.uai) ?? aliases.set(u.uai, new Set()).get(u.uai)!).add(a);
      if (!existing.has(normCode(u.uai))) todo.set(normCode(u.uai), u);
    }
    const rows = [...todo.entries()].map(([uai, u]) => {
      const ref = u.ref;
      return {
        id: randomUUID(),
        name: u.name,
        slug: slugs.has(u.slug)
          ? uniqueSlug(`${u.slug}-${uai.toLowerCase()}`, slugs)
          : (slugs.add(u.slug), u.slug),
        uai,
        paysageId: u.paysage && !paysages.has(u.paysage) ? u.paysage : null,
        shortName: ref?.shortName ?? null,
        city: ref?.comName ?? '',
        cities: ref?.comName ? [ref.comName] : [],
        region: ref?.region ?? '',
        website: ref?.website ?? null,
        address: ref?.address ?? null,
        lat: ref?.lat ?? null,
        lng: ref?.lng ?? null,
        keywords: ref?.acronym ? [ref.acronym.toLowerCase()] : [],
        origin: 'SYNC' as const,
      };
    });
    for (const part of chunks(rows)) {
      await prisma.$transaction([
        prisma.university.createMany({ data: part, skipDuplicates: true }),
        prisma.identifier.createMany({
          data: part.flatMap((u) => [
            {
              entityType: 'UNIVERSITY' as const,
              entityId: u.id,
              kind: 'UAI' as const,
              value: u.uai,
              label: 'UAI',
            },
            // former UAIs of a merged university, as they appear in older Mon Master sessions
            ...[...(aliases.get(u.uai) ?? [])].map((a) => ({
              entityType: 'UNIVERSITY' as const,
              entityId: u.id,
              kind: 'UAI' as const,
              value: a,
              label: 'UAI (ancien)',
            })),
            ...(u.paysageId
              ? [
                  {
                    entityType: 'UNIVERSITY' as const,
                    entityId: u.id,
                    kind: 'PAYSAGE' as const,
                    value: u.paysageId,
                    label: 'Paysage',
                  },
                ]
              : []),
          ]),
          skipDuplicates: true,
        }),
      ]);
    }
    counters.universitiesCreated = rows.length;
  });

  // 2. mentions (names from the RNCP when found, decided at simulation time)
  await phase(1, async () => {
    const existing = await mentionByKey();
    const slugs = new Set(
      (await prisma.mention.findMany({ select: { slug: true } })).map((m) => m.slug),
    );
    const domains = new Map((await prisma.domain.findMany()).map((d) => [d.slug, d.id]));
    const todo = new Map<string, Extract<MMOps['mention'], { id: null }>>();
    for (const i of items)
      if (!i.ops.mention.id && !existing.has(normMention(i.ops.mention.name!))) {
        const cur = todo.get(i.ops.mention.key!);
        if (cur) cur.publish ||= i.ops.mention.publish;
        else
          todo.set(i.ops.mention.key!, {
            ...(i.ops.mention as Extract<MMOps['mention'], { id: null }>),
          });
      }
    const rows = [...todo.values()].map((m) => ({
      id: randomUUID(),
      name: m.name,
      slug: slugs.has(m.slug) ? uniqueSlug(m.slug, slugs) : (slugs.add(m.slug), m.slug),
      domainId: m.domain ? (domains.get(m.domain) ?? null) : null,
      levels: ['M1', 'M2'],
      keywords: [],
      origin: 'SYNC' as const,
      isPublished: m.publish,
    }));
    for (const part of chunks(rows))
      await prisma.mention.createMany({ data: part, skipDuplicates: true });
    counters.mentionsCreated = rows.length;
  });

  const unis = await uniByUai();
  const mentions = await mentionByKey();

  // 3. accreditations (inm × university), with the sessions where they were seen
  await phase(2, async () => {
    const agg = new Map<
      string,
      { inm: string; universityId: string; mentionId: string; first: number; last: number }
    >();
    for (const i of items) {
      const universityId = uniOf(i, unis);
      const k = `${i.n.inm}|${universityId}`;
      const a = agg.get(k);
      if (a) {
        a.first = Math.min(a.first, i.n.session);
        a.last = Math.max(a.last, i.n.session);
      } else
        agg.set(k, {
          inm: i.n.inm,
          universityId,
          mentionId: mentionOf(i, mentions),
          first: i.n.session,
          last: i.n.session,
        });
    }
    const rows = [...agg.values()];
    for (const part of chunks(rows)) {
      await prisma.mentionAccreditation.createMany({
        data: part.map((a) => ({
          id: randomUUID(),
          inm: a.inm,
          universityId: a.universityId,
          mentionId: a.mentionId,
          firstSeenSession: a.first,
          lastSeenSession: a.last,
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "MentionAccreditation" AS a SET "firstSeenSession" = LEAST(COALESCE(a."firstSeenSession", v.first), v.first),
           "lastSeenSession" = GREATEST(COALESCE(a."lastSeenSession", v.last), v.last), "updatedAt" = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(inm text, "universityId" text, first int, last int)
         WHERE a.inm = v.inm AND a."universityId" = v."universityId"`,
        JSON.stringify(part),
      );
    }
  });
  const accs = new Map(
    (
      await prisma.mentionAccreditation.findMany({
        select: { id: true, inm: true, universityId: true },
      })
    ).map((a) => [`${a.inm}|${a.universityId}`, a.id]),
  );
  const accOf = (i: Item) => accs.get(`${i.n.inm}|${uniOf(i, unis)}`)!;

  // 4. cities, campuses, components
  let communes: CommuneIndex | null = null;
  const snap = await prisma.rawSnapshot.findFirst({
    where: { source: { key: 'esr-etablissements' }, url: GEO_COMMUNES_URL },
    orderBy: { fetchedAt: 'desc' },
  });
  if (snap) communes = await loadCommunes(snap.storagePath);
  else
    await ctx.log(
      'WARN',
      'liste des communes absente (lancer esr-etablissements) : campus non créés',
    );
  const placeOf = (i: Item) => specificPlaces(i.n)[0] ?? null;
  const communeOf = new Map<string, Commune>();
  if (communes)
    for (const i of leads) {
      const p = placeOf(i);
      const c = p ? resolveCommune(communes, p.commune, p.department) : null;
      if (c) communeOf.set(i.s.id, c);
    }
  await phase(3, async () => {
    const existingCities = new Set(
      (await prisma.city.findMany({ select: { inseeCode: true } })).map((c) => c.inseeCode),
    );
    const slugs = new Set(
      (await prisma.city.findMany({ select: { slug: true } })).map((c) => c.slug),
    );
    const todo = new Map<string, Commune>();
    for (const c of communeOf.values()) if (!existingCities.has(c.code)) todo.set(c.code, c);
    const cityRows = [...todo.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((c) => {
        const base = slugify(c.nom);
        const pos = centre(c);
        return {
          id: randomUUID(),
          inseeCode: c.code,
          name: c.nom,
          slug: slugs.has(base)
            ? uniqueSlug(`${base}-${c.codeDepartement.toLowerCase()}`, slugs)
            : (slugs.add(base), base),
          department: c.departement?.nom ?? c.codeDepartement,
          departmentCode: c.codeDepartement,
          region: c.region?.nom ?? '',
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        };
      });
    for (const part of chunks(cityRows))
      await prisma.city.createMany({ data: part, skipDuplicates: true });
    const cities = new Map(
      (await prisma.city.findMany({ select: { id: true, inseeCode: true } })).map((c) => [
        c.inseeCode,
        c.id,
      ]),
    );
    const campusRows = new Map<
      string,
      {
        id: string;
        universityId: string;
        cityId: string;
        key: string;
        name: string;
        lat: number | null;
        lng: number | null;
      }
    >();
    const componentRows = new Map<string, { id: string; universityId: string; name: string }>();
    for (const i of leads) {
      const c = communeOf.get(i.s.id);
      const p = placeOf(i);
      const universityId = uniOf(i, unis);
      if (c && p) {
        const key = normText(p.label) || 'campus';
        const cityId = cities.get(c.code)!;
        const pos = centre(c);
        campusRows.set(`${universityId}|${cityId}|${key}`, {
          id: randomUUID(),
          universityId,
          cityId,
          key,
          name: p.label,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        });
      }
      const comp = i.plan.changes.find((x) => x.field === 'component');
      if (comp && typeof comp.to === 'string')
        componentRows.set(`${universityId}|${comp.to}`, {
          id: randomUUID(),
          universityId,
          name: comp.to,
          updatedAt: new Date(),
        } as never);
    }
    for (const part of chunks([...campusRows.values()]))
      await prisma.campus.createMany({ data: part, skipDuplicates: true });
    for (const part of chunks([...componentRows.values()]))
      await prisma.component.createMany({ data: part, skipDuplicates: true });
    counters.citiesCreated = cityRows.length;
  });

  // 5. new program fiches, with the Mon Master number that carries each of them
  await phase(4, async () => {
    const known = new Set(
      (
        await prisma.monMasterEntry.findMany({
          where: { code: { in: leads.map((i) => i.n.ifc) } },
          select: { code: true },
        })
      ).map((e) => e.code),
    );
    const slugs = new Set(
      (await prisma.program.findMany({ select: { slug: true } })).map((p) => p.slug),
    );
    const todo = leads.filter(
      (i) => i.ops.programKey.startsWith('new:') && !known.has(i.ops.programKey.slice(4)),
    );
    let created = 0;
    for (const part of chunks(todo, 500)) {
      const programs = part.map((i) => {
        const p = placeOf(i);
        const title = String(i.plan.changes.find((c) => c.field === 'title')?.to ?? i.n.title);
        const slug =
          i.ops.programSlug && !slugs.has(i.ops.programSlug)
            ? (slugs.add(i.ops.programSlug), i.ops.programSlug)
            : uniqueSlug(slugify(`${title} ${i.n.etaName}`), slugs);
        return {
          id: randomUUID(),
          title,
          slug,
          mentionId: mentionOf(i, mentions),
          universityId: uniOf(i, unis),
          accreditationId: accOf(i),
          city: p ? titleCase(p.commune) : '',
          campus: p?.label ?? null,
          modality: i.n.workStudy ? ('WORK_STUDY' as const) : ('ONSITE' as const),
          origin: 'SYNC' as const,
          status: 'ACTIVE' as const,
          firstSeenSession: i.n.session,
          lastSeenSession: i.n.session,
          applicationPlatform: 'Mon Master',
          keywords: i.n.aliases.map((a) => a.toLowerCase()),
          shortName: i.n.aliases[0] ?? null,
          updatedAt: new Date(),
        };
      });
      await prisma.$transaction([
        prisma.program.createMany({ data: programs }),
        prisma.monMasterEntry.createMany({
          data: part.map((i, k) => ({
            id: randomUUID(),
            code: i.n.ifc,
            label: programs[k]!.title,
            programId: programs[k]!.id,
            inm: i.n.inm,
            inmp: i.n.inmp,
            workStudy: i.n.workStudy,
            places: i.n.placesRaw,
            firstSession: i.n.session,
            lastSession: i.n.session,
          })),
          skipDuplicates: true,
        }),
      ]);
      created += part.length;
      await ctx.report({
        progress: 85,
        step: `Publication · fiches parcours ${created}/${todo.length}`,
      });
    }
    counters.programsCreated = created;
  });

  // program id of every record: existing target, or the fiche carried by its number
  const entryProgram = new Map(
    (await prisma.monMasterEntry.findMany({ select: { code: true, programId: true } })).map((e) => [
      e.code,
      e.programId,
    ]),
  );
  const programOf = (i: Item) =>
    i.ops.programKey.startsWith('new:')
      ? entryProgram.get(i.ops.programKey.slice(4))
      : i.ops.programKey;

  // 6. fields (provenance, decided again against locks) and program columns
  await phase(5, async () => {
    const changes: BulkChange[] = [];
    for (const i of leads) {
      const pid = programOf(i);
      if (!pid) continue;
      for (const c of i.plan.changes)
        if (!c.field.startsWith('admissions:'))
          changes.push({
            change: { ...c, entityId: pid },
            entityId: pid,
            conflictTitle: `${c.label} · ${i.n.title}`,
          });
    }
    const values = await applyFieldChangesBulk(
      changes,
      ctx.sourceKey,
      counters,
      async (done, total) =>
        ctx.report({ progress: 88, step: `Publication · champs ${done}/${total}` }),
    );
    const cities = new Map(
      (await prisma.city.findMany({ select: { id: true, inseeCode: true } })).map((c) => [
        c.inseeCode,
        c.id,
      ]),
    );
    const campuses = new Map(
      (
        await prisma.campus.findMany({
          select: { id: true, universityId: true, cityId: true, key: true },
        })
      ).map((c) => [`${c.universityId}|${c.cityId}|${c.key}`, c.id]),
    );
    const components = new Map(
      (
        await prisma.component.findMany({ select: { id: true, universityId: true, name: true } })
      ).map((c) => [`${c.universityId}|${c.name}`, c.id]),
    );
    // sessions seen per program (every record, not only the leads)
    const seen = new Map<string, { first: number; last: number }>();
    for (const i of items) {
      const pid = programOf(i);
      if (!pid) continue;
      const cur = seen.get(pid);
      seen.set(pid, {
        first: Math.min(cur?.first ?? i.n.session, i.n.session),
        last: Math.max(cur?.last ?? i.n.session, i.n.session),
      });
    }
    const current = new Map(
      (
        await prisma.program.findMany({
          where: { id: { in: [...seen.keys()] } },
          select: {
            id: true,
            title: true,
            modality: true,
            city: true,
            campus: true,
            componentId: true,
            campusId: true,
            accreditationId: true,
            firstSeenSession: true,
            lastSeenSession: true,
          },
        })
      ).map((p) => [p.id, p]),
    );
    const rows = [];
    for (const i of leads) {
      const pid = programOf(i);
      const p = pid ? current.get(pid) : undefined;
      if (!pid || !p) continue;
      const v = values.get(pid) ?? new Map<string, unknown>();
      const universityId = uniOf(i, unis);
      const c = communeOf.get(i.s.id);
      const place = placeOf(i);
      const comp = v.get('component');
      const s = seen.get(pid)!;
      rows.push({
        id: pid,
        title: typeof v.get('title') === 'string' && v.get('title') ? v.get('title') : p.title,
        modality: v.has('modality') ? v.get('modality') : p.modality,
        city: typeof v.get('city') === 'string' ? v.get('city') : p.city,
        campus: v.has('campus') ? v.get('campus') : p.campus,
        componentId:
          typeof comp === 'string' && comp
            ? (components.get(`${universityId}|${comp}`) ?? p.componentId)
            : p.componentId,
        campusId:
          c && place
            ? (campuses.get(
                `${universityId}|${cities.get(c.code)}|${normText(place.label) || 'campus'}`,
              ) ?? p.campusId)
            : p.campusId,
        accreditationId: accOf(i),
        firstSeenSession: Math.min(p.firstSeenSession ?? s.first, s.first),
        lastSeenSession: Math.max(p.lastSeenSession ?? s.last, s.last),
      });
    }
    for (const part of chunks(rows))
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "Program" AS p SET "title" = v."title", "modality" = v."modality"::"Modality", "city" = v."city", "campus" = v."campus",
           "componentId" = v."componentId", "campusId" = v."campusId", "accreditationId" = v."accreditationId",
           "firstSeenSession" = v."firstSeenSession", "lastSeenSession" = v."lastSeenSession", "updatedAt" = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(id text, "title" text, "modality" text, "city" text, "campus" text, "componentId" text,
           "campusId" text, "accreditationId" text, "firstSeenSession" int, "lastSeenSession" int)
         WHERE p.id = v.id`,
        JSON.stringify(part),
      );
  });

  // 7. Mon Master numbers (all sessions): program, inm, inmp, places of the latest session
  await phase(6, async () => {
    const agg = new Map<
      string,
      {
        code: string;
        programId: string;
        inm: string;
        inmp: string | null;
        workStudy: boolean;
        places: string;
        label: string;
        first: number;
        last: number;
      }
    >();
    for (const i of items) {
      const pid = programOf(i);
      if (!pid) continue;
      const cur = agg.get(i.n.ifc);
      if (!cur || i.n.session > cur.last)
        agg.set(i.n.ifc, {
          code: i.n.ifc,
          programId: pid,
          inm: i.n.inm,
          inmp: i.n.inmp,
          workStudy: i.n.workStudy,
          places: i.n.placesRaw,
          label: i.n.title,
          first: Math.min(cur?.first ?? i.n.session, i.n.session),
          last: i.n.session,
        });
      else cur.first = Math.min(cur.first, i.n.session);
    }
    const rows = [...agg.values()];
    for (const part of chunks(rows)) {
      await prisma.monMasterEntry.createMany({
        data: part.map((e) => ({
          id: randomUUID(),
          code: e.code,
          programId: e.programId,
          label: e.label,
          inm: e.inm,
          inmp: e.inmp,
          workStudy: e.workStudy,
          places: e.places,
          firstSession: e.first,
          lastSession: e.last,
        })),
        skipDuplicates: true,
      });
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "MonMasterEntry" AS e SET "programId" = v."programId", "inm" = v.inm, "inmp" = v.inmp, "workStudy" = v."workStudy",
           "places" = CASE WHEN v.last >= COALESCE(e."lastSession", 0) THEN v.places ELSE e.places END,
           "label" = CASE WHEN v.last >= COALESCE(e."lastSession", 0) THEN v.label ELSE e.label END,
           "firstSession" = LEAST(COALESCE(e."firstSession", v.first), v.first),
           "lastSession" = GREATEST(COALESCE(e."lastSession", v.last), v.last)
         FROM jsonb_to_recordset($1::jsonb) AS v(code text, "programId" text, inm text, inmp text, "workStudy" boolean, places text, label text, first int, last int)
         WHERE e.code = v.code`,
        JSON.stringify(part),
      );
    }
  });

  // 8. admission figures: one row per number and session (grouped upsert)
  await phase(7, async () => {
    const entries = new Map(
      (
        await prisma.monMasterEntry.findMany({ select: { id: true, code: true, programId: true } })
      ).map((e) => [e.code, e]),
    );
    const rows = [];
    const details: AdmissionDetailRow[] = [];
    for (const i of items) {
      const e = entries.get(i.n.ifc);
      if (!e) continue;
      const st = i.n.stats;
      const raw = {
        ...rawWithoutOrigins(i.s.payload as Record<string, unknown>),
        lieux: i.n.placesRaw,
        rankPhase: i.ops.rankPhase,
        rankReason: i.ops.rankReason,
      };
      details.push(detailRow(e.id, i.n.session, st));
      rows.push({
        id: randomUUID(),
        programId: e.programId,
        monMasterEntryId: e.id,
        session: i.n.session,
        source: MM_STAT_SOURCE,
        sourceUrl: datasetUrl(i.n.session),
        capacity: st.capacity,
        applications: st.applications,
        applicationsPp: st.applicationsPp,
        applicationsPc: st.applicationsPc,
        ranked: st.ranked,
        offers: st.offers,
        accepted: st.accepted,
        seatsTaken: st.accepted,
        lastRankPp: st.rankPp,
        lastRankPc: st.rankPc,
        participatedPp: st.participatedPp,
        participatedPc: st.participatedPc,
        offPlatformRecruits: st.offPlatformRecruits,
        lastRankCalled: displayedRank(st, i.n.workStudy).rank,
        raw,
      });
    }
    let done = 0;
    for (const part of chunks(rows)) {
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AdmissionStat" ("id","programId","monMasterEntryId","session","source","sourceUrl","capacity","applications","applicationsPp",
           "applicationsPc","ranked","offers","accepted","seatsTaken","lastRankPp","lastRankPc","participatedPp","participatedPc",
           "offPlatformRecruits","lastRankCalled","raw","createdAt","updatedAt")
         SELECT v.id, v."programId", v."monMasterEntryId", v.session, v.source, v."sourceUrl", v.capacity, v.applications, v."applicationsPp",
           v."applicationsPc", v.ranked, v.offers, v.accepted, v."seatsTaken", v."lastRankPp", v."lastRankPc", v."participatedPp", v."participatedPc",
           v."offPlatformRecruits", v."lastRankCalled", v.raw, now(), now()
         FROM jsonb_to_recordset($1::jsonb) AS v(id text, "programId" text, "monMasterEntryId" text, session int, source text, "sourceUrl" text,
           capacity int, applications int, "applicationsPp" int, "applicationsPc" int, ranked int, offers int, accepted int, "seatsTaken" int,
           "lastRankPp" int, "lastRankPc" int, "participatedPp" boolean, "participatedPc" boolean, "offPlatformRecruits" int, "lastRankCalled" int, raw jsonb)
         ON CONFLICT ("programId","monMasterEntryId","session","source") DO UPDATE SET
           "sourceUrl" = EXCLUDED."sourceUrl", "capacity" = EXCLUDED."capacity", "applications" = EXCLUDED."applications",
           "applicationsPp" = EXCLUDED."applicationsPp", "applicationsPc" = EXCLUDED."applicationsPc", "ranked" = EXCLUDED."ranked",
           "offers" = EXCLUDED."offers", "accepted" = EXCLUDED."accepted", "seatsTaken" = EXCLUDED."seatsTaken",
           "lastRankPp" = EXCLUDED."lastRankPp", "lastRankPc" = EXCLUDED."lastRankPc", "participatedPp" = EXCLUDED."participatedPp",
           "participatedPc" = EXCLUDED."participatedPc", "offPlatformRecruits" = EXCLUDED."offPlatformRecruits",
           "lastRankCalled" = EXCLUDED."lastRankCalled", "raw" = EXCLUDED."raw", "updatedAt" = now()`,
        JSON.stringify(part),
      );
      done += part.length;
      await ctx.report({ progress: 93, step: `Publication · admissions ${done}/${rows.length}` });
    }
    // a number moved to another fiche (merge decision) takes its rows with it
    // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
    await prisma.$executeRawUnsafe(
      `UPDATE "AdmissionStat" AS s SET "programId" = e."programId", "updatedAt" = now() FROM "MonMasterEntry" AS e
       WHERE s."monMasterEntryId" = e.id AND s."programId" <> e."programId"`,
    );
    // « D'où viennent les admis »: origins and the three accepted counts, in real fields
    await writeAdmissionDetails(details);
    counters.admissionRows = rows.length;
  });

  // 9. identifiers (search: n° Mon Master, inmp, UAI, inm)
  await phase(8, async () => {
    const rows = new Map<
      string,
      {
        entityType: 'PROGRAM' | 'MENTION';
        entityId: string;
        kind: 'MONMASTER' | 'MM_PARCOURS' | 'UAI' | 'MM_MENTION';
        value: string;
        label: string;
      }
    >();
    for (const i of items) {
      const pid = programOf(i);
      if (!pid) continue;
      const add = (r: {
        entityType: 'PROGRAM' | 'MENTION';
        entityId: string;
        kind: 'MONMASTER' | 'MM_PARCOURS' | 'UAI' | 'MM_MENTION';
        value: string;
        label: string;
      }) => rows.set(`${r.kind}|${r.value}|${r.entityId}`, r);
      add({
        entityType: 'PROGRAM',
        entityId: pid,
        kind: 'MONMASTER',
        value: i.n.ifc,
        label: 'Mon Master',
      });
      if (i.n.inmp)
        add({
          entityType: 'PROGRAM',
          entityId: pid,
          kind: 'MM_PARCOURS',
          value: normCode(i.n.inmp),
          label: 'Mon Master (parcours)',
        });
      add({ entityType: 'PROGRAM', entityId: pid, kind: 'UAI', value: i.n.uai, label: 'UAI' });
      add({
        entityType: 'MENTION',
        entityId: mentionOf(i, mentions),
        kind: 'MM_MENTION',
        value: i.n.inm,
        label: 'Mon Master (mention)',
      });
    }
    for (const part of chunks([...rows.values()]))
      await prisma.identifier.createMany({
        data: part.map((r) => ({ ...r, id: randomUUID() })),
        skipDuplicates: true,
      });
  });

  // 10. merge proposals: separate fiches until a human decides (decision B)
  await phase(9, async () => {
    const titles = new Map(
      (
        await prisma.program.findMany({
          where: { id: { in: [...new Set(leads.map(programOf).filter(Boolean))] as string[] } },
          select: { id: true, title: true },
        })
      ).map((p) => [p.id, p.title]),
    );
    const rows = [];
    for (const i of leads) {
      if (!i.ops.merge || i.n.session !== Math.max(...items.map((x) => x.n.session))) continue;
      const sibling = programOf(i);
      const target = i.ops.merge.programId ?? entryProgram.get(i.ops.merge.withIfc) ?? null;
      if (!sibling || !target || sibling === target) continue;
      rows.push({
        id: randomUUID(),
        key: `merge:ifc:${i.n.ifc}`,
        kind: 'MERGE' as const,
        entityType: 'PROGRAM' as const,
        entityId: target,
        field: 'monMasterEntries',
        title: `Même parcours, deux fiches · ${titles.get(target) ?? i.n.title}`,
        detail: `${i.n.ifc} (fiche séparée) et ${i.ops.merge.withIfc} : même UAI, même parcours (inmp ${i.n.inmp ?? '—'}), même lieu et même modalité · groupe de ${i.ops.merge.groupSize} numéros.`,
        score: i.s.matchScore,
        recommended: i.ops.merge.recommended,
        options: [
          {
            id: 'merge',
            label: 'Fusionner sous une seule fiche',
            value: { decision: 'MERGE', ifc: i.n.ifc, targetId: target, fromProgramId: sibling },
            source: sourceLabel(i.n.session),
          },
          {
            id: 'split',
            label: 'Garder deux fiches',
            value: { decision: 'NEW', ifc: i.n.ifc },
            source: sourceLabel(i.n.session),
          },
        ] as never,
      });
    }
    for (const part of chunks(rows))
      await prisma.dataConflict.createMany({ data: part, skipDuplicates: true });
    counters.mergeProposals = rows.length;
  });

  // 11. successions, work-study variants, mentions to publish, fiches emptied by a merge, staging
  await phase(10, async () => {
    const accByProgram = new Map<string, Map<string, number>>();
    for (const i of items) {
      const pid = programOf(i);
      if (!pid) continue;
      const m = accByProgram.get(pid) ?? new Map<string, number>();
      m.set(accOf(i), Math.max(m.get(accOf(i)) ?? 0, i.n.session));
      accByProgram.set(pid, m);
    }
    const links = new Map<string, string>();
    for (const m of accByProgram.values()) {
      if (m.size < 2) continue;
      const ordered = [...m.entries()].sort((a, b) => b[1] - a[1]);
      if (!links.has(ordered[0]![0])) links.set(ordered[0]![0], ordered[1]![0]);
    }
    for (const part of chunks(
      [...links.entries()].map(([id, predecessorId]) => ({ id, predecessorId })),
    ))
      // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
      await prisma.$executeRawUnsafe(
        `UPDATE "MentionAccreditation" AS a SET "predecessorId" = v."predecessorId", "updatedAt" = now()
         FROM jsonb_to_recordset($1::jsonb) AS v(id text, "predecessorId" text)
         WHERE a.id = v.id AND a."predecessorId" IS NULL AND v."predecessorId" <> a.id`,
        JSON.stringify(part),
      );
    counters.successions = links.size;
    // work-study version of an on-site parcours (same UAI and inmp): « même parcours, autre modalité »
    // raw-sql: constant SQL; every value is a $n parameter (jsonb_to_recordset batch).
    await prisma.$executeRawUnsafe(
      `UPDATE "Program" AS w SET "variantOfId" = o.id, "updatedAt" = now()
       FROM "MonMasterEntry" ew, "MonMasterEntry" eo, "Program" o
       WHERE ew."programId" = w.id AND eo."programId" = o.id AND ew.inmp IS NOT NULL AND ew.inmp = eo.inmp
         AND w."universityId" = o."universityId" AND w.modality = 'WORK_STUDY' AND o.modality <> 'WORK_STUDY'
         AND w."variantOfId" IS NULL AND w.id <> o.id`,
    );
    await prisma.mention.updateMany({
      where: { origin: 'SYNC', isPublished: false, programs: { some: {} } },
      data: { isPublished: true },
    });
    // a SYNC fiche left without any number after a merge decision: hidden if nothing hangs on it
    const emptied = await prisma.program.findMany({
      where: { origin: 'SYNC', status: 'ACTIVE', monMasterEntries: { none: {} } },
      select: { id: true, title: true, _count: { select: { reviews: true, favorites: true } } },
    });
    for (const p of emptied) {
      if (p._count.reviews || p._count.favorites)
        await ctx.alert({
          key: `merged-with-reviews:${p.id}`,
          code: 'merged-with-reviews',
          severity: 'WARNING',
          title: `Fiche fusionnée avec des avis : ${p.title}`,
          detail:
            'Ses numéros Mon Master ont été rattachés à une autre fiche, mais elle a des avis ou des suivis : à traiter à la main.',
          entityType: 'PROGRAM',
          entityId: p.id,
        });
      else
        await prisma.program.update({
          where: { id: p.id },
          data: { isPublished: false, status: 'DRAFT' },
        });
    }
    counters.parentsLinked = await applyParentDecisions((m) => ctx.log('INFO', m));
    await prisma.stagingRecord.updateMany({
      where: { runId: ctx.runId, appliedAt: null },
      data: { appliedAt: new Date() },
    });
  });

  counters.publishSeconds = Math.round((Date.now() - t0) / 1000);
  counters.publishTimings = timings;
  await ctx.log('OK', `publication terminée en ${counters.publishSeconds} s`);
  return counters;
}
