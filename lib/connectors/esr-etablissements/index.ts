/**
 * esr-etablissements: universities (UAI, former UAIs, Paysage, acronym, website, address,
 * coordinates) from `fr-esr-principaux-etablissements-enseignement-superieur`, implantations
 * (2017, coordinates only) and communes from geo.api.gouv.fr.
 *
 * Existing universities are completed; a university is not created here when no master
 * references it (monmaster-opendata creates it, with this source's reference data).
 * The parent of an établissement-composante is entered by hand (decision 4).
 */
import { prisma } from '@/lib/db';
import { MB } from '@/lib/data/http';
import { GEO_COMMUNES_URL, loadCommunes, type CommuneIndex } from '@/lib/data/geo';
import {
  planField,
  loadProvenance,
  applyFieldChange,
  type PublishCounters,
} from '@/lib/data/merge';
import {
  fromDecision,
  loadDecisions,
  loadUniversityIndex,
  matchUniversity,
} from '@/lib/data/match';
import { normCode, toFloat } from '@/lib/data/normalize';
import { ensureCity, resetPlaceCaches } from '@/lib/data/places';
import { applyParentDecisions } from '@/lib/data/parents';
import { saveSnapshot, snapshotPath } from '@/lib/data/snapshot';
import { stagedRecords, updateStaging } from '@/lib/data/pipeline';
import { planAction, type FieldChange, type RecordPlan } from '@/lib/data/diff';
import { getSettings } from '@/lib/settings';
import {
  datasetOf,
  esrDatasetVersion,
  esrExceptions,
  esrExport,
  identicalToApplied,
  readChecked,
  ESR_HOST,
} from '../opendata';
import { emptyStats, type PipelineConnector, type PipelineContext } from '../types';

export const DATASETS = {
  principaux: 'fr-esr-principaux-etablissements-enseignement-superieur',
  implantations: 'fr-esr-implantations_etablissements_d_enseignement_superieur_publics',
} as const;

const LABEL = 'Établissements de l’enseignement supérieur (MESR, Licence Ouverte 2.0)';

export interface EtabNorm {
  kind: 'etab';
  uai: string;
  oldUais: string[];
  paysage: string | null;
  name: string;
  /** `nom_court` (URCA, UVSQ): shown on chips. */
  shortName: string | null;
  /** `sigle` (NU, amU): a search keyword only. */
  acronym: string | null;
  type: string;
  /** `secteur_d_etablissement`: « public » or « privé ». */
  sector: 'PUBLIC' | 'PRIVATE' | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  comCode: string | null;
  comName: string | null;
  region: string | null;
  address: string | null;
  siren: string | null;
}

export function normalizeEtab(r: Record<string, string>): EtabNorm {
  const [lat, lng] = (r.coordonnees ?? '').split(',').map((x) => toFloat(x));
  const address = [
    r.adresse_uai,
    [r.code_postal_uai, r.localite_acheminement_uai].filter(Boolean).join(' '),
  ]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(', ');
  return {
    kind: 'etab',
    uai: normCode(r.uai),
    oldUais: (r.anciens_codes_uai ?? '')
      .split(/[;,]/)
      .map((x) => normCode(x))
      .filter(Boolean),
    paysage: r.etablissement_id_paysage?.trim() || null,
    name: r.uo_lib?.trim() ?? '',
    shortName: r.nom_court?.trim() || null,
    acronym: r.sigle?.trim() || null,
    type: r.type_d_etablissement ?? '',
    sector: /^priv/i.test(r.secteur_d_etablissement ?? '')
      ? 'PRIVATE'
      : /^public/i.test(r.secteur_d_etablissement ?? '')
        ? 'PUBLIC'
        : null,
    website: r.url?.trim() || null,
    lat: lat ?? null,
    lng: lng ?? null,
    comCode: r.com_code?.trim() || null,
    comName: r.com_nom?.trim() || null,
    region: r.reg_nom?.trim() || null,
    address: address || null,
    siren: r.siren?.split('.')[0]?.trim() || null,
  };
}

async function communesFor(ctx: PipelineContext): Promise<CommuneIndex | null> {
  const snap = await prisma.rawSnapshot.findFirst({
    where: { sourceId: ctx.sourceId, url: GEO_COMMUNES_URL },
    orderBy: { fetchedAt: 'desc' },
  });
  return snap ? loadCommunes(snap.storagePath) : null;
}

export const connector: PipelineConnector = {
  key: 'esr-etablissements',
  pipeline: true,
  http: {
    allowedDomains: [ESR_HOST, 'geo.api.gouv.fr'],
    openDataExceptions: esrExceptions(DATASETS.principaux, DATASETS.implantations),
  },

  async fetch(ctx) {
    const versions = [];
    for (const d of Object.values(DATASETS)) versions.push(await esrDatasetVersion(ctx, d));
    const version = `établissements ${versions[0]!.modified.slice(0, 10)} · implantations ${versions[1]!.modified.slice(0, 10)}`;
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: ctx.sourceId } });
    if (source.version === version && !ctx.force)
      return { nothingNew: true, reason: 'jeux non modifiés', sourceVersion: version };
    let identical = true;
    for (const v of versions) {
      const { snapshot } = await esrExport(ctx, v, {});
      identical &&= await identicalToApplied(snapshot);
    }
    if (identical && !ctx.force)
      return {
        nothingNew: true,
        reason: 'fichiers identiques au dernier import appliqué',
        sourceVersion: version,
      };
    // Communes: the whole list in one request (geo.api.gouv.fr allows robots), at most once a week.
    const lastGeo = await prisma.rawSnapshot.findFirst({
      where: { sourceId: ctx.sourceId, url: GEO_COMMUNES_URL },
      orderBy: { fetchedAt: 'desc' },
    });
    if (lastGeo && Date.now() - lastGeo.fetchedAt.getTime() < 7 * 24 * 3600_000) {
      const { id: _id, ...copy } = lastGeo;
      void _id;
      await prisma.rawSnapshot.create({ data: { ...copy, runId: ctx.runId } });
      await ctx.log(
        'INFO',
        `communes : liste du ${lastGeo.fetchedAt.toISOString().slice(0, 10)} réutilisée`,
      );
      return { nothingNew: false, sourceVersion: version };
    }
    const file = snapshotPath(ctx.sourceKey, 'communes.json');
    const r = await ctx.http.get(GEO_COMMUNES_URL, {
      accept: ['json'],
      toFile: file,
      maxBytes: 50 * MB,
      timeoutMs: 120_000,
    });
    if (r.kind === 'response' && r.status === 200 && r.file) {
      await saveSnapshot({
        sourceKey: ctx.sourceKey,
        runId: ctx.runId,
        url: GEO_COMMUNES_URL,
        fileName: 'communes.json',
        file: r.file,
        sha256: r.sha256,
        contentType: r.contentType,
        httpStatus: 200,
        sourceVersion: version,
      });
      await ctx.log('OK', `communes (geo.api.gouv.fr) : ${(r.bytes / MB).toFixed(1)} Mo`);
    } else
      await ctx.log(
        'WARN',
        `communes indisponibles (${r.kind === 'skip' ? r.reason : `HTTP ${r.kind === 'response' ? r.status : '?'}`}) : les villes ne seront pas complétées`,
      );
    return { nothingNew: false, sourceVersion: version };
  },

  async *parse(ctx, snapshots) {
    for (const s of snapshots) {
      const ds = datasetOf(s);
      if (ds === DATASETS.principaux)
        for await (const r of readChecked(ctx, s, 'principaux')) {
          const n = normalizeEtab(r);
          if (n.uai) yield { recordKey: `etab:${n.uai}`, payload: r, normalized: n as never };
        }
      else if (ds === DATASETS.implantations)
        for await (const r of readChecked(ctx, s, 'implantations')) {
          const [lat, lng] = (r.coordonnees ?? '').split(',').map((x) => toFloat(x));
          if (r.uai)
            yield {
              recordKey: `impl:${normCode(r.uai)}`,
              payload: {
                uai: r.uai,
                etablissement_uai: r.etablissement_uai,
                implantation_lib: r.implantation_lib,
                com_code: r.com_code,
                com_nom: r.com_nom,
              },
              normalized: {
                kind: 'impl',
                uai: normCode(r.uai),
                etabUai: normCode(r.etablissement_uai),
                label: r.implantation_lib,
                comCode: r.com_code,
                lat,
                lng,
              },
            };
        }
    }
  },

  async match(ctx) {
    const settings = await getSettings();
    const t = settings['data.matchThresholds'];
    const idx = await loadUniversityIndex();
    const decisions = await loadDecisions(ctx.sourceKey);
    const upd = [];
    for await (const rows of stagedRecords(ctx.runId))
      for (const s of rows) {
        const n = s.normalized as unknown as EtabNorm | { kind: 'impl' };
        if (n.kind !== 'etab') {
          upd.push({
            id: s.id,
            matchStatus: 'IGNORED',
            matchReason: 'implantation : complément de coordonnées',
          });
          continue;
        }
        const m =
          fromDecision(decisions.get(s.recordKey)) ??
          matchUniversity(
            idx,
            {
              uai: n.uai,
              oldUais: n.oldUais,
              paysage: n.paysage,
              name: n.name,
              commune: n.comName,
            },
            t,
          );
        upd.push({
          id: s.id,
          matchStatus: m.status,
          matchScore: m.score,
          matchReason: m.reason,
          targetType: 'UNIVERSITY',
          targetId: 'id' in m ? m.id : null,
        });
      }
    await updateStaging(upd);
    const linked = upd.filter((u) => u.matchStatus === 'LINKED').length;
    await ctx.log(
      'OK',
      `${linked} établissements reliés à une fiche, ${upd.filter((u) => u.matchStatus === 'PROPOSED').length} à valider`,
    );
  },

  async merge(ctx) {
    const all = [];
    for await (const rows of stagedRecords(ctx.runId)) all.push(...rows);
    const ids = all.filter((s) => s.targetId).map((s) => s.targetId!);
    const prov = await loadProvenance('UNIVERSITY', ids);
    const unis = new Map(
      (await prisma.university.findMany({ where: { id: { in: ids } } })).map((u) => [u.id, u]),
    );
    const upd = [];
    for (const s of all) {
      const n = s.normalized as unknown as EtabNorm | { kind: 'impl' };
      if (n.kind !== 'etab') {
        upd.push({ id: s.id, plan: null });
        continue;
      }
      const label = `${n.name} (${n.uai})`;
      if (s.matchStatus === 'PROPOSED') {
        upd.push({
          id: s.id,
          plan: {
            action: 'proposal',
            target: { type: 'university', id: s.targetId, label },
            changes: [],
            note: s.matchReason ?? '',
          } satisfies RecordPlan,
        });
        continue;
      }
      if (s.matchStatus !== 'LINKED' || !s.targetId) {
        upd.push({
          id: s.id,
          plan: {
            action: 'ignored',
            target: { type: 'university', id: null, label },
            changes: [],
            note: 'pas de fiche : créée par Mon Master si une formation la référence',
          } satisfies RecordPlan,
        });
        continue;
      }
      const u = unis.get(s.targetId)!;
      const src = {
        sourceKey: ctx.sourceKey,
        source: LABEL,
        sourceUrl: `https://${ESR_HOST}/explore/dataset/${DATASETS.principaux}/`,
      };
      const f = (field: string, lbl: string, value: unknown) =>
        planField(prov, 'UNIVERSITY', u.id, field, lbl, { ...src, value });
      const changes: FieldChange[] = [
        f('uai', 'UAI', n.uai),
        f('paysageId', 'Identifiant Paysage', n.paysage),
        f('universityName', 'Nom', n.name),
        f('website', 'Site officiel', n.website),
        f('address', 'Adresse', n.address),
        f(
          'coordinates',
          'Coordonnées',
          n.lat != null && n.lng != null ? `${n.lat}, ${n.lng}` : null,
        ),
        f('region', 'Région', n.region),
      ];
      if (n.shortName) changes.push(f('shortName', 'Sigle', n.shortName));
      upd.push({
        id: s.id,
        plan: {
          action: planAction(changes),
          target: { type: 'university', id: u.id, label: u.name },
          changes,
          ops: {
            identifiers: [n.uai, ...n.oldUais]
              .map((v) => ({ kind: 'UAI', value: v }))
              .concat(n.paysage ? [{ kind: 'PAYSAGE', value: n.paysage }] : []),
            comCode: n.comCode,
            keyword:
              n.acronym && !u.keywords.includes(n.acronym.toLowerCase())
                ? n.acronym.toLowerCase()
                : null,
          },
        } satisfies RecordPlan,
      });
    }
    await updateStaging(upd);
  },

  async publish(ctx) {
    const counters: PublishCounters = emptyStats();
    resetPlaceCaches();
    const communes = await communesFor(ctx);
    for await (const rows of stagedRecords(ctx.runId, { matchStatus: 'LINKED', appliedAt: null })) {
      const done = [];
      for (const s of rows) {
        const plan = s.plan as unknown as RecordPlan | null;
        if (!plan || !s.targetId) continue;
        const data: Record<string, unknown> = {};
        for (const c of plan.changes) {
          const v = await applyFieldChange(
            c,
            s.targetId,
            ctx.sourceKey,
            counters,
            `${c.label} · ${plan.target.label}`,
          );
          if (v === undefined) continue;
          if (c.field === 'uai') data.uai = v;
          else if (c.field === 'paysageId') data.paysageId = v;
          else if (c.field === 'universityName' && typeof v === 'string' && v) data.name = v;
          else if (c.field === 'shortName') data.shortName = v;
          else if (c.field === 'website') data.website = v;
          else if (c.field === 'address') data.address = v;
          else if (c.field === 'region' && typeof v === 'string' && v) data.region = v;
          else if (c.field === 'coordinates' && typeof v === 'string') {
            const [lat, lng] = v.split(',').map((x) => Number(x));
            data.lat = lat;
            data.lng = lng;
          }
        }
        const ops = (plan.ops ?? {}) as {
          identifiers?: { kind: 'UAI' | 'PAYSAGE'; value: string }[];
          comCode?: string | null;
          keyword?: string | null;
        };
        if (ops.keyword) data.keywords = { push: ops.keyword };
        // UAI / Paysage may already belong to another fiche (duplicate): never steal it silently.
        for (const key of ['uai', 'paysageId'] as const)
          if (
            data[key] &&
            (await prisma.university.findFirst({
              where: { [key]: data[key] as string, id: { not: s.targetId } },
            }))
          ) {
            await ctx.log(
              'WARN',
              `${plan.target.label} : ${key} ${String(data[key])} déjà porté par une autre fiche (doublon probable)`,
            );
            delete data[key];
          }
        if (Object.keys(data).length)
          await prisma.university.update({ where: { id: s.targetId }, data });
        for (const i of ops.identifiers ?? [])
          await prisma.identifier.upsert({
            where: {
              kind_value_entityId: {
                kind: i.kind,
                value: i.kind === 'UAI' ? normCode(i.value) : i.value,
                entityId: s.targetId,
              },
            },
            create: {
              entityType: 'UNIVERSITY',
              entityId: s.targetId,
              kind: i.kind,
              value: i.kind === 'UAI' ? normCode(i.value) : i.value,
              label: i.kind === 'UAI' ? 'UAI' : 'Paysage',
            },
            update: {},
          });
        const commune = ops.comCode && communes?.byCode.get(ops.comCode);
        if (commune) await ensureCity(commune);
        done.push({ id: s.id, appliedAt: new Date() });
      }
      await updateStaging(done);
      await ctx.report({
        progress: 90,
        step: `Publication · ${counters.updated + counters.created + counters.unchanged} champs`,
      });
    }
    await applyParentDecisions((m) => ctx.log('INFO', m));
    // Pilot cities seeded without coordinates are completed from the commune list.
    if (communes)
      for (const c of await prisma.city.findMany({
        where: { inseeCode: { not: null }, lat: null },
      })) {
        const commune = communes.byCode.get(c.inseeCode!);
        if (commune) await ensureCity(commune);
      }
    return counters;
  },
};

/** Index of the latest establishments file, for monmaster-opendata (creating universities). */
export async function establishmentsReference() {
  const snap = await prisma.rawSnapshot.findFirst({
    where: {
      source: { key: 'esr-etablissements' },
      url: { contains: `/datasets/${DATASETS.principaux}/` },
    },
    orderBy: { fetchedAt: 'desc' },
  });
  const byUai = new Map<string, EtabNorm>();
  const byPaysage = new Map<string, EtabNorm>();
  if (!snap) return { byUai, byPaysage, found: false };
  const { readCsv } = await import('@/lib/data/csv');
  for await (const r of readCsv(snap.storagePath)) {
    const n = normalizeEtab(r);
    if (!n.uai) continue;
    byUai.set(n.uai, n);
    for (const o of n.oldUais) if (!byUai.has(o)) byUai.set(o, n);
    if (n.paysage) byPaysage.set(n.paysage, n);
  }
  return { byUai, byPaysage, found: true };
}
