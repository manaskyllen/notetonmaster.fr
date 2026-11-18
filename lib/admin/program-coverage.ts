import 'server-only';
import { prisma } from '@/lib/db';
import { TEMPLATE_LABEL, profileConfig, type Template } from '@/lib/connectors/univ-sites/profiles';
import type { SiteSummary } from '@/lib/connectors/univ-sites';

export type CoverageStatus = 'active' | 'paused' | 'blocked' | 'empty' | 'pending' | 'invalid';

export const COVERAGE_STATUS_LABEL: Record<CoverageStatus, string> = {
  active: 'Actif',
  paused: 'En pause',
  blocked: 'Bloqué par robots.txt',
  empty: 'Sans pages trouvées',
  pending: 'Pas encore passé',
  invalid: 'Profil invalide',
};

interface Counts {
  zero: number;
  few: number;
  threeOrMore: number;
}

export interface CoverageRow {
  universityId: string;
  name: string;
  template: Template | null;
  templateLabel: string;
  status: CoverageStatus;
  reason: string | null;
  programs: number;
  /** Parcours counts once the pages are matched (lot 3), page counts before. */
  counts: Counts | null;
  unit: 'parcours' | 'pages';
  lastRun: Date | null;
}

export interface TemplateRate {
  template: Template;
  label: string;
  covered: number;
  total: number;
  rate: number;
  unit: 'parcours' | 'pages';
}

type RunStats = {
  sites?: SiteSummary[];
  coverage?: {
    byTemplate?: Record<string, { pages: number; threeOrMore: number; rate: number }>;
    byUniversity?: Record<string, Counts & { pages: number }>;
    programs?: {
      byTemplate?: Record<string, { programs: number; threeOrMore: number; rate: number }>;
      byUniversity?: Record<string, Counts & { programs: number }>;
    };
  };
};

/** Coverage of the programs by the university sites, from the latest univ-sites run and the profiles. */
export async function loadProgramCoverage() {
  const [profiles, run, programCounts, unis] = await Promise.all([
    prisma.extractionProfile.findMany(),
    prisma.syncRun.findFirst({
      where: { source: { key: 'univ-sites' }, stats: { path: ['coverage'], not: 'null' } },
      orderBy: { queuedAt: 'desc' },
      select: { id: true, mode: true, finishedAt: true, appliedAt: true, stats: true },
    }),
    prisma.program.groupBy({
      by: ['universityId'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.university.findMany({ where: { sector: 'PUBLIC' }, select: { id: true, name: true } }),
  ]);
  const stats = (run?.stats ?? {}) as RunStats;
  const sites = new Map((stats.sites ?? []).map((s) => [s.universityId, s]));
  const progCov = stats.coverage?.programs?.byUniversity;
  const pageCov = stats.coverage?.byUniversity;
  const nPrograms = new Map(
    programCounts.map((p) => [p.universityId, (p._count as { id: number }).id]),
  );
  const byUni = new Map(profiles.map((p) => [p.universityId, p]));
  const rows: CoverageRow[] = unis.map((u) => {
    const p = byUni.get(u.id);
    const parsed = p ? profileConfig.safeParse(p.config) : null;
    const template = parsed?.success ? parsed.data.template : null;
    const site = sites.get(u.id);
    let status: CoverageStatus = 'pending';
    if (p && !parsed?.success) status = 'invalid';
    else if (p?.status === 'BLOCKED') status = 'blocked';
    else if (p?.status === 'PAUSED') status = 'paused';
    else if (p?.status === 'ACTIVE') status = site && site.discovered === 0 ? 'empty' : 'active';
    const pc = progCov?.[u.id];
    const pg = pageCov?.[u.id];
    return {
      universityId: u.id,
      name: u.name,
      template,
      templateLabel: template ? TEMPLATE_LABEL[template] : '—',
      status,
      reason: p?.pausedReason ?? (status === 'empty' ? (site?.reason ?? null) : null),
      programs: nPrograms.get(u.id) ?? 0,
      counts: pc
        ? { zero: pc.zero, few: pc.few, threeOrMore: pc.threeOrMore }
        : pg
          ? { zero: pg.zero, few: pg.few, threeOrMore: pg.threeOrMore }
          : null,
      unit: progCov ? 'parcours' : 'pages',
      lastRun: p?.lastTestedAt ?? null,
    };
  });
  rows.sort((a, b) => b.programs - a.programs);
  const templates: TemplateRate[] = [];
  const byTpl = stats.coverage?.programs?.byTemplate ?? null;
  for (const t of ['AMETYS_ODF_HTML', 'KSUP', 'DRUPAL', 'GENERIC_HTML'] as Template[]) {
    if (byTpl?.[t])
      templates.push({
        template: t,
        label: TEMPLATE_LABEL[t],
        covered: byTpl[t].threeOrMore,
        total: byTpl[t].programs,
        rate: byTpl[t].rate,
        unit: 'parcours',
      });
    else if (stats.coverage?.byTemplate?.[t]) {
      const c = stats.coverage.byTemplate[t];
      templates.push({
        template: t,
        label: TEMPLATE_LABEL[t],
        covered: c.threeOrMore,
        total: c.pages,
        rate: c.rate,
        unit: 'pages',
      });
    }
  }
  return {
    rows,
    templates,
    run: run
      ? { id: run.id, mode: run.mode, finishedAt: run.finishedAt, applied: !!run.appliedAt }
      : null,
  };
}
