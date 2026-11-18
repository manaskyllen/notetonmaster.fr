/**
 * `univ-sites`: programs read on the university sites, by declarative profiles per template
 * (docs/sources/programmes.md).
 *
 * fetch : profiles from fixtures/decisions/univ-sites-profils.json (never overwriting a profile
 *         edited in the admin), discovery of the program pages (sitemaps, then links), polite
 *         download with conditional requests (CrawlPage), one snapshot per page.
 * parse : generic extractor by rubrics with the template's options; one staged record per page.
 * match/merge/publish : page ↔ parcours, pages of a parcours united, fields with their evidence
 *         (lib/connectors/univ-sites/apply.ts).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db';
import type { ExtractionKind, ProfileStatus } from '@/lib/db/generated/enums';
import { MB } from '@/lib/data/http';
import { saveSnapshot } from '@/lib/data/snapshot';
import { scrubPii } from '@/lib/data/pii';
import { normCity } from '@/lib/data/normalize';
import { recordChecks, stagedRecords } from '@/lib/data/pipeline';
import { type PipelineConnector, type PipelineContext } from '../types';
import { coverageStep, matchStep, mergeStep, publishStep } from './apply';
import { discover } from './discovery';
import { inlineText, parseHtml, query, queryAll, textOf } from './html';
import {
  TEMPLATE_RULES,
  configFromSeed,
  extractOptions,
  pageLevel,
  profileConfig,
  readSeedProfiles,
  type ProfileConfig,
  type Template,
} from './profiles';
import { extractSections, type PageExtraction } from './sections';

export const LABEL = 'Site de l’université';
const RNCP_IN_PAGE =
  /\bRNCP\s*(?:n°|:|-)?\s*(\d{4,6})\b|(?:fiche|code|num[ée]ro|r[ée]f[ée]rentiel|identifiant)\s+RNCP\s*(?:n°|:)?\s*(\d{4,6})\b/gi;
const IFC_IN_PAGE = /\b(\d{7}[A-Z0-9]{5})\b/g;

/** Registrable domain (« formations.univ-lille.fr » → « univ-lille.fr »). */
export const domainOf = (host: string) => host.split('.').slice(-2).join('.');

export interface ProfileRow {
  id: string;
  universityId: string;
  universityName: string;
  status: ProfileStatus;
  cfg: ProfileConfig;
}

/** Profiles of the database, created from the starting file when missing (never overwritten). */
export async function ensureProfiles(): Promise<ProfileRow[]> {
  const seeds = readSeedProfiles();
  const unis = new Map(
    (await prisma.university.findMany({ select: { id: true, uai: true } })).map((u) => [
      u.uai,
      u.id,
    ]),
  );
  const existing = new Set(
    (await prisma.extractionProfile.findMany({ select: { universityId: true } })).map(
      (p) => p.universityId,
    ),
  );
  for (const s of seeds) {
    const universityId = s.uai ? unis.get(s.uai) : undefined;
    if (!universityId || existing.has(universityId)) continue;
    const cfg = configFromSeed(s);
    await prisma.extractionProfile.create({
      data: {
        universityId,
        kind: cfg.template as ExtractionKind,
        config: cfg as never,
        status: cfg.blocked ? 'BLOCKED' : 'UNCONFIGURED',
        pausedReason: cfg.blocked ?? null,
      },
    });
  }
  const rows = await prisma.extractionProfile.findMany({
    include: { university: { select: { name: true } } },
  });
  const out: ProfileRow[] = [];
  for (const r of rows) {
    const parsed = profileConfig.safeParse(r.config);
    if (!parsed.success) continue; // an invalid profile is shown in the admin, never used
    out.push({
      id: r.id,
      universityId: r.universityId,
      universityName: r.university.name,
      status: r.status,
      cfg: parsed.data,
    });
  }
  return out;
}

/**
 * Establishments with at least one parcours in an open launch zone (theirs or one of their
 * établissements-composantes'): the only ones the crawl visits.
 */
export async function establishmentsInOpenZones(): Promise<Set<string>> {
  const rows = await prisma.program.findMany({
    where: { inOpenZone: true, status: 'ACTIVE' },
    distinct: ['universityId'],
    select: { universityId: true, university: { select: { parentId: true } } },
  });
  return new Set(
    rows.flatMap((r) => [r.universityId, r.university.parentId].filter(Boolean) as string[]),
  );
}

/** Templates this run is limited to (`stats.options.templates`), all by default. */
async function runTemplates(runId: string): Promise<Set<Template> | null> {
  const run = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    select: { stats: true },
  });
  const t = (run.stats as { options?: { templates?: string[] } } | null)?.options?.templates;
  return t?.length ? new Set(t as Template[]) : null;
}

/** Establishments this run is limited to (`stats.options.universityIds`: « Resynchroniser »). */
async function runUniversities(runId: string): Promise<Set<string> | null> {
  const run = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    select: { stats: true },
  });
  const u = (run.stats as { options?: { universityIds?: string[] } } | null)?.options
    ?.universityIds;
  return u?.length ? new Set(u) : null;
}

export interface SiteSummary {
  universityId: string;
  name: string;
  template: Template;
  status: 'ACTIVE' | 'BLOCKED' | 'PAUSED';
  reason: string | null;
  discovered: number;
  fetched: number;
  notModified: number;
  failed: number;
  via: string[];
}

async function mergeRunStats(runId: string, patch: Record<string, unknown>) {
  const run = await prisma.syncRun.findUniqueOrThrow({
    where: { id: runId },
    select: { stats: true },
  });
  await prisma.syncRun.update({
    where: { id: runId },
    data: { stats: { ...((run.stats as object) ?? {}), ...patch } as never },
  });
}

async function fetchSite(
  ctx: PipelineContext,
  p: ProfileRow,
  onPage: () => void = () => {},
): Promise<SiteSummary> {
  const sum: SiteSummary = {
    universityId: p.universityId,
    name: p.universityName,
    template: p.cfg.template,
    status: 'ACTIVE',
    reason: null,
    discovered: 0,
    fetched: 0,
    notModified: 0,
    failed: 0,
    via: [],
  };
  const d = await discover(ctx.http, p.cfg, (m) => ctx.log('INFO', `${p.universityName} : ${m}`));
  sum.status = d.status;
  sum.reason = d.reason;
  sum.via = d.via;
  sum.discovered = d.urls.length;
  await prisma.extractionProfile.update({
    where: { id: p.id },
    data: {
      status: d.status === 'ACTIVE' ? 'ACTIVE' : d.status,
      pausedReason: d.status === 'ACTIVE' ? null : d.reason,
      lastTestedAt: new Date(),
    },
  });
  if (d.status !== 'ACTIVE') {
    await ctx.log(
      'WARN',
      `${p.universityName} : ${d.status === 'BLOCKED' ? 'bloqué' : 'en pause'} (${d.reason})`,
    );
    return sum;
  }
  const pages = new Map(
    (await prisma.crawlPage.findMany({ where: { url: { in: d.urls } } })).map((c) => [c.url, c]),
  );
  for (const url of d.urls) {
    const prev = pages.get(url);
    let r: Awaited<ReturnType<typeof ctx.http.get>>;
    try {
      r = await ctx.http.get(url, {
        accept: ['html'],
        maxBytes: 8 * MB,
        etag: prev?.etag,
        lastModified: prev?.lastModified,
      });
    } catch (e) {
      sum.failed++;
      await ctx.log('WARN', `${url} : ${(e as Error).message}`);
      continue;
    }
    if (r.kind === 'skip') {
      sum.failed++;
      await prisma.crawlPage.upsert({
        where: { url },
        create: {
          url,
          universityId: p.universityId,
          robotsAllowed: false,
          template: p.cfg.template,
          lastFetchedAt: new Date(),
        },
        update: { robotsAllowed: false, lastFetchedAt: new Date() },
      });
      continue;
    }
    if (r.kind === 'not-modified') {
      const last = await prisma.rawSnapshot.findFirst({
        where: { sourceId: ctx.sourceId, url },
        orderBy: { fetchedAt: 'desc' },
      });
      if (last) {
        const { id: _id, fetchedAt: _f, ...copy } = last;
        void _id;
        void _f;
        await prisma.rawSnapshot.create({ data: { ...copy, runId: ctx.runId } });
        sum.notModified++;
        continue;
      }
    }
    if (r.kind !== 'response' || r.status !== 200 || !r.body) {
      sum.failed++;
      if (r.kind === 'response')
        await prisma.crawlPage.upsert({
          where: { url },
          create: {
            url,
            universityId: p.universityId,
            httpStatus: r.status,
            template: p.cfg.template,
            lastFetchedAt: new Date(),
          },
          update: { httpStatus: r.status, lastFetchedAt: new Date() },
        });
      continue;
    }
    const name = `${createHash('sha1').update(url).digest('hex').slice(0, 20)}.html`;
    await saveSnapshot({
      sourceKey: ctx.sourceKey,
      runId: ctx.runId,
      url,
      fileName: name,
      body: r.body,
      sha256: r.sha256,
      contentType: r.contentType,
      httpStatus: 200,
      etag: r.etag,
      lastModified: r.lastModified,
    });
    await prisma.crawlPage.upsert({
      where: { url },
      create: {
        url,
        universityId: p.universityId,
        lastFetchedAt: new Date(),
        etag: r.etag,
        lastModified: r.lastModified,
        sha256: r.sha256,
        httpStatus: 200,
        robotsAllowed: true,
        template: p.cfg.template,
      },
      update: {
        universityId: p.universityId,
        lastFetchedAt: new Date(),
        etag: r.etag,
        lastModified: r.lastModified,
        sha256: r.sha256,
        httpStatus: 200,
        robotsAllowed: true,
        template: p.cfg.template,
      },
    });
    sum.fetched++;
    onPage();
    if (sum.fetched % 50 === 0)
      await ctx.log('INFO', `${p.universityName} : ${sum.fetched} / ${d.urls.length} pages`);
  }
  await ctx.log(
    'OK',
    `${p.universityName} : ${sum.fetched} pages lues, ${sum.notModified} inchangées, ${sum.failed} en échec`,
  );
  return sum;
}

/** What a page tells about itself, besides its rubrics (used by the matching, lot 3). */
export interface PageFacts {
  url: string;
  universityId: string;
  template: Template;
  title: string;
  /** Breadcrumb or parent title: usually the mention. */
  mentionHint: string;
  rncp: string[];
  ifc: string[];
  /** Cities of the university's programs named in the page. */
  cities: string[];
  /** From the URL structure when the template knows it (Ametys). */
  level: 'PARCOURS' | 'MENTION' | null;
  extraction: PageExtraction;
}

export function pageFacts(
  html: string,
  url: string,
  universityId: string,
  cfg: ProfileConfig,
  knownCities: string[],
): PageFacts {
  const doc = parseHtml(html);
  const title = scrubPii(inlineText(query(doc, 'h1') ?? query(doc, 'title') ?? doc)).text.slice(
    0,
    300,
  );
  const mentionHint = queryAll(doc, TEMPLATE_RULES[cfg.template].mentionSelector)
    .map((e) => inlineText(e))
    .filter((t) => t && t.length <= 200)
    .join(' › ')
    .slice(0, 500);
  const text = textOf(doc);
  const rncp = [...new Set([...text.matchAll(RNCP_IN_PAGE)].map((m) => `RNCP${m[1] ?? m[2]}`))];
  const ifc = [...new Set([...text.matchAll(IFC_IN_PAGE)].map((m) => m[1]!))].filter((c) =>
    /[A-Z]/.test(c.slice(7)),
  );
  const normText = ` ${normCity(text)} `;
  const cities = knownCities.filter((c) => normText.includes(` ${normCity(c)} `));
  const extraction = extractSections(doc, extractOptions(cfg, url));
  return {
    url,
    universityId,
    template: cfg.template,
    title,
    mentionHint,
    rncp,
    ifc,
    cities,
    level: pageLevel(cfg, url),
    extraction,
  };
}

/** Coverage of a set of pages: share with at least 3 rubrics. */
export function coverage(rubricCounts: number[]) {
  const n = rubricCounts.length;
  const zero = rubricCounts.filter((c) => c === 0).length;
  const few = rubricCounts.filter((c) => c > 0 && c < 3).length;
  const three = rubricCounts.filter((c) => c >= 3).length;
  return { pages: n, zero, few, threeOrMore: three, rate: n ? three / n : 0 };
}

export async function loadConnector(): Promise<PipelineConnector> {
  const seeds = readSeedProfiles();
  const dbHosts = (await prisma.extractionProfile.findMany({ select: { config: true } })).flatMap(
    (r) => (r.config as { hosts?: string[] }).hosts ?? [],
  );
  const domains = [...new Set([...seeds.flatMap((s) => s.hosts), ...dbHosts].map(domainOf))];
  return {
    key: 'univ-sites',
    pipeline: true,
    http: {
      allowedDomains: domains,
      deniedHosts: [
        /(^|[.-])(test|preprod|recette|staging|qualif|intranet|cas|ent)[.-]/i,
        /testksup/i,
      ],
    },

    async fetch(ctx) {
      // Heartbeat: the crawl lasts long; without it the worker would think the run abandoned
      // (STALE_RUN_MS) and resume it in parallel, doubling the requests to every host.
      let pagesDone = 0;
      const beat = setInterval(
        () =>
          void ctx
            .report({ progress: 5, step: `Téléchargement · ${pagesDone} pages` })
            .catch(() => {}),
        60_000,
      );
      try {
        const only = await runTemplates(ctx.runId);
        // Launch limited to some cities: only the establishments with a
        // parcours in an open city are crawled; a city opened enters at the next run.
        const inZone = await establishmentsInOpenZones();
        const all = (await ensureProfiles()).filter((p) => !only || only.has(p.cfg.template));
        const onlyUnis = await runUniversities(ctx.runId);
        const profiles = all.filter(
          (p) => inZone.has(p.universityId) && (!onlyUnis || onlyUnis.has(p.universityId)),
        );
        await ctx.log(
          'INFO',
          `${profiles.length} profils dans les villes ouvertes, sur ${all.length}${only ? ` (${[...only].join(', ')})` : ''}`,
        );
        const sites = await Promise.all(
          profiles.map((p) =>
            fetchSite(ctx, p, () => pagesDone++).catch(async (e: Error) => {
              await ctx.log('ERROR', `${p.universityName} : ${e.message}`);
              return {
                universityId: p.universityId,
                name: p.universityName,
                template: p.cfg.template,
                status: 'PAUSED',
                reason: e.message,
                discovered: 0,
                fetched: 0,
                notModified: 0,
                failed: 0,
                via: [],
              } as SiteSummary;
            }),
          ),
        );
        await mergeRunStats(ctx.runId, { sites });
        const total = sites.reduce((a, s) => a + s.fetched + s.notModified, 0);
        if (!total) throw new Error('aucune page de parcours récupérée');
        return { nothingNew: false, sourceVersion: new Date().toISOString().slice(0, 10) };
      } finally {
        clearInterval(beat);
      }
    },

    async *parse(ctx, snapshots) {
      const profiles = new Map((await ensureProfiles()).map((p) => [p.universityId, p]));
      const pages = new Map(
        (
          await prisma.crawlPage.findMany({ where: { url: { in: snapshots.map((s) => s.url) } } })
        ).map((c) => [c.url, c]),
      );
      const cityCache = new Map<string, string[]>();
      const citiesOf = async (universityId: string) => {
        let c = cityCache.get(universityId);
        if (!c) {
          c = [
            ...new Set(
              (await prisma.program.findMany({ where: { universityId }, select: { city: true } }))
                .map((x) => x.city)
                .filter(Boolean),
            ),
          ];
          cityCache.set(universityId, c);
        }
        return c;
      };
      let n = 0;
      let failed = 0;
      for (const s of snapshots) {
        const page = pages.get(s.url);
        const p = page ? profiles.get(page.universityId) : undefined;
        if (!page || !p) continue;
        let facts: PageFacts;
        try {
          facts = pageFacts(
            await readFile(s.storagePath, 'utf8'),
            s.url,
            p.universityId,
            p.cfg,
            await citiesOf(p.universityId),
          );
        } catch (e) {
          failed++;
          await ctx.log('WARN', `${s.url} : lecture impossible (${(e as Error).message})`);
          continue;
        }
        await prisma.crawlPage.update({
          where: { url: s.url },
          data: {
            title: facts.title.slice(0, 300),
            rubricCount: facts.extraction.rubricCount,
            documentYear: facts.extraction.documentYear,
            level: facts.level ?? 'UNKNOWN',
          },
        });
        n++;
        if (n % 500 === 0) await ctx.report({ progress: 30, step: `Lecture des pages · ${n}` });
        yield {
          recordKey: s.url,
          payload: { url: s.url, universityId: p.universityId, template: p.cfg.template },
          normalized: facts as never,
        };
      }
      await recordChecks(
        ctx.runId,
        { 'Pages lisibles (HTML)': { executed: n + failed, failed } },
        { replace: true },
      );
      await ctx.log('OK', `${n} pages lues`);
    },

    async match(ctx) {
      await matchStep(ctx);
    },

    async merge(ctx) {
      await mergeStep(ctx);
    },

    async quality(ctx) {
      // pages: share with 3 rubrics or more (mention pages carry the common fields only)
      const byTemplate = new Map<string, number[]>();
      const byUniversity = new Map<string, number[]>();
      for await (const rows of stagedRecords(ctx.runId))
        for (const r of rows) {
          const f = r.normalized as unknown as PageFacts;
          const info = (r.matchInfo ?? {}) as { level?: string };
          if (info.level === 'MENTION') continue;
          const c = f.extraction.rubricCount;
          byTemplate.set(f.template, [...(byTemplate.get(f.template) ?? []), c]);
          byUniversity.set(f.universityId, [...(byUniversity.get(f.universityId) ?? []), c]);
        }
      // parcours: the measure of the lot (at least 70 % of the parcours of each template)
      const profiles = await ensureProfiles();
      const programs = await coverageStep(
        ctx,
        new Map(profiles.map((p) => [p.universityId, p.cfg.template])),
        await runTemplates(ctx.runId),
      );
      await mergeRunStats(ctx.runId, {
        coverage: {
          byTemplate: Object.fromEntries([...byTemplate].map(([k, v]) => [k, coverage(v)])),
          byUniversity: Object.fromEntries([...byUniversity].map(([k, v]) => [k, coverage(v)])),
          programs: programs.programs,
          matching: programs.matching,
        },
      });
      return {};
    },

    async publish(ctx) {
      return publishStep(ctx);
    },
  };
}
