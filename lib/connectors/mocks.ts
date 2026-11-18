/**
 * Mock connectors: they replay the fixtures (prisma/fixtures) as if they came from the real
 * sources, step by step, so the admin can watch the progress. No network call is made.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { ensureAlert, syncField } from './provenance';
import {
  emptyStats,
  type RunContext,
  type RunResult,
  type SourceConnector,
  type SourceKey,
} from './types';

const FIX = join(process.cwd(), 'prisma/fixtures');
const catalog = () =>
  JSON.parse(readFileSync(join(FIX, 'catalog.json'), 'utf8')) as {
    programs: {
      slug: string;
      title: string;
      university: string;
      monMaster: { code: string }[];
      stats: {
        code: string | null;
        session: number;
        capacity?: number | null;
        applications?: number | null;
        offers?: number | null;
        lastRankCalled?: number | null;
        accessRate?: number;
      }[];
      semesters?: unknown[];
      semesterSource?: { document: string; year: string };
    }[];
    insertion: { university: string; cohortYear: number; employmentRate12m: number }[];
  };

const STEP_MS = Number(process.env.MOCK_STEP_MS ?? 700);
const pause = () => new Promise((r) => setTimeout(r, STEP_MS));

async function programsBySlug() {
  const ps = await prisma.program.findMany({ select: { id: true, slug: true, title: true } });
  return new Map(ps.map((p) => [p.slug, p]));
}

const mmOpenData: SourceConnector = {
  key: 'monmaster-opendata',
  async run(ctx) {
    const stats = emptyStats();
    const MM = 'Mon Master · données ouvertes 2025';
    await ctx.report({ progress: 5, step: 'Téléchargement du jeu de données' });
    await ctx.log('INFO', 'jeu de données fr-esr-mon_master, session 2025 : 9 412 formations lues');
    await pause();
    const fx = catalog();
    const ps = await programsBySlug();
    const m1 = fx.programs.filter((p) => p.monMaster.length);
    for (const [i, p] of m1.entries()) {
      const prog = ps.get(p.slug);
      if (!prog) continue;
      await ctx.report({ progress: 10 + Math.round(((i + 1) / m1.length) * 75), step: prog.title });
      const s25 = p.stats.filter((s) => s.session === 2025 && s.code);
      const sum = (k: 'applications' | 'offers') => s25.reduce((a, s) => a + (s[k] ?? 0), 0);
      const base = {
        entityType: 'PROGRAM' as const,
        entityId: prog.id,
        entityLabel: prog.title,
        source: MM,
        sourceKey: 'monmaster-opendata',
      };
      await syncField(
        { ...base, field: 'title', label: 'Intitulé du parcours', value: p.title },
        ctx,
        stats,
      );
      if (s25.length === 1)
        await syncField(
          { ...base, field: 'capacity', label: 'Places en M1', value: s25[0]!.capacity ?? null },
          ctx,
          stats,
        );
      await syncField(
        {
          ...base,
          field: 'applications',
          label: 'Candidatures (phase principale)',
          value: sum('applications'),
        },
        ctx,
        stats,
      );
      await syncField(
        { ...base, field: 'offers', label: 'Propositions d’admission', value: sum('offers') },
        ctx,
        stats,
      );
      if (p.monMaster.length > 1) {
        await ctx.log(
          'WARN',
          `${prog.title} : ${p.monMaster.length} numéros Mon Master pour un seul parcours`,
        );
        await ensureAlert({
          key: 'acpci-entries-conflict',
          severity: 'WARNING',
          title: 'Doublon d’entrées Mon Master',
          detail: `${prog.title} a deux numéros : ${p.monMaster.map((m) => m.code).join(' et ')}.`,
          link: '/admin/recuperation#conflits',
          linkLabel: 'Arbitrer',
        });
      }
      await pause();
    }
    await ctx.log('OK', `${m1.length} parcours suivis appariés par numéro Mon Master`);
    const missing = fx.programs.filter(
      (p) => !p.monMaster.length && p.stats.some((s) => s.session === 2025),
    );
    for (const p of missing) {
      await ctx.log('SKIP', `${p.title} : aucun numéro Mon Master trouvé, parcours ignoré`);
      await ensureAlert({
        key: 'mba-no-monmaster',
        severity: 'ERROR',
        title: 'Parcours non rattaché à Mon Master',
        detail: `${p.title} : aucun numéro Mon Master trouvé.`,
        link: `program:${p.slug}`,
        linkLabel: 'Ouvrir la fiche',
      });
    }
    await ctx.report({ progress: 100, step: 'Terminé' });
    return {
      status: 'SUCCEEDED',
      stats,
      summary: `${stats.updated} mis à jour, ${stats.unchanged} inchangés, ${stats.skippedLocked} verrouillés`,
    };
  },
};

const mmFiches: SourceConnector = {
  key: 'monmaster-fiches',
  async run(ctx) {
    await ctx.report({ progress: 50, step: 'Lecture de robots.txt' });
    await pause();
    await ctx.log('SKIP', 'robots.txt : Disallow. Collecte interdite, aucune requête envoyée');
    await ensureAlert({
      key: 'monmaster-fiches-blocked',
      severity: 'ERROR',
      title: 'Mon Master : fiches détaillées inaccessibles',
      detail: 'Le site interdit la collecte automatique (robots.txt).',
      link: '/admin/recuperation',
      linkLabel: 'Voir la source',
    });
    await ctx.report({ progress: 100, step: 'Ignorée' });
    return {
      status: 'SKIPPED',
      stats: emptyStats(),
      summary: 'Source ignorée : robots.txt interdit la collecte',
    };
  },
};

const rncp: SourceConnector = {
  key: 'rncp',
  async run(ctx) {
    const stats = emptyStats();
    await ctx.report({ progress: 20, step: 'Export France Compétences' });
    await pause();
    const mention = await prisma.mention.findFirst({ include: { certification: true } });
    if (mention?.certification) {
      const base = {
        entityType: 'MENTION' as const,
        entityId: mention.id,
        entityLabel: mention.name,
        source: 'France Compétences',
        sourceKey: 'rncp',
      };
      const c = mention.certification;
      await ctx.log('INFO', `fiche ${c.code} lue : niveau ${c.level}`);
      await ctx.report({ progress: 60, step: c.code });
      await syncField(
        {
          ...base,
          field: 'certification',
          label: 'Certification',
          value: `${c.code} (niveau ${c.level})`,
        },
        ctx,
        stats,
      );
      if (c.replacesCode) {
        await ctx.log('INFO', `${c.replacesCode} inactive, remplacée par ${c.code}`);
        await ensureAlert({
          key: 'rncp35804-replaced',
          severity: 'INFO',
          title: 'Certification remplacée',
          detail: `${c.replacesCode} inactive, remplacée par ${c.code}.`,
          link: `mention:${mention.slug}`,
          linkLabel: 'Voir',
        });
      }
      await pause();
    }
    await ctx.report({ progress: 100, step: 'Terminé' });
    await ctx.log('OK', 'terminé');
    return { status: 'SUCCEEDED', stats, summary: 'Certification à jour' };
  },
};

const insersup: SourceConnector = {
  key: 'insersup',
  async run(ctx) {
    const stats = emptyStats();
    const fx = catalog();
    const ps = await programsBySlug();
    await ctx.report({ progress: 15, step: 'Insertion à 12 et 18 mois, promotion 2023' });
    await pause();
    for (const [i, p] of fx.programs.entries()) {
      const prog = ps.get(p.slug);
      if (!prog) continue;
      const ins = fx.insertion.find((x) => x.university === p.university);
      await ctx.report({
        progress: 20 + Math.round(((i + 1) / fx.programs.length) * 75),
        step: prog.title,
      });
      await syncField(
        ins
          ? {
              entityType: 'PROGRAM',
              entityId: prog.id,
              entityLabel: prog.title,
              field: 'insertion',
              label: 'Insertion',
              value: `${String(ins.employmentRate12m).replace('.', ',')} % en emploi à 12 mois (mention)`,
              source: `InserSup · promotion ${ins.cohortYear}`,
              sourceKey: 'insersup',
            }
          : {
              entityType: 'PROGRAM',
              entityId: prog.id,
              entityLabel: prog.title,
              field: 'insertion',
              label: 'Insertion',
              value: null,
              source: 'InserSup · non publié pour ce parcours',
              sourceKey: 'insersup',
              state: 'MISSING',
            },
        ctx,
        stats,
      );
    }
    await ctx.log('SKIP', 'Nantes Université, URCA : effectifs trop faibles, données non publiées');
    await ctx.report({ progress: 100, step: 'Terminé' });
    await ctx.log('OK', 'terminé');
    return { status: 'SUCCEEDED', stats, summary: 'Insertion à jour' };
  },
};

const univSites: SourceConnector = {
  key: 'univ-sites',
  async run(ctx) {
    const stats = emptyStats();
    const hosts = ['univ-nantes.fr', 'universite-paris-saclay.fr', 'univ-reims.fr'];
    for (const [i, host] of hosts.entries()) {
      await ctx.report({ progress: Math.round(((i + 0.5) / hosts.length) * 100), step: host });
      await pause();
      if (host === 'universite-paris-saclay.fr') {
        const emas = await prisma.program.findUnique({
          where: { slug: 'evenementiel-mediation-des-arts-et-des-sciences' },
        });
        if (emas)
          await syncField(
            {
              entityType: 'PROGRAM',
              entityId: emas.id,
              entityLabel: emas.title,
              field: 'capacity',
              label: 'Places en M1',
              value: 24,
              source: 'Site de l’Université Paris-Saclay',
              sourceKey: 'univ-sites',
            },
            ctx,
            stats,
          );
      }
      await ctx.log(
        host === 'univ-reims.fr' ? 'WARN' : 'OK',
        host === 'univ-reims.fr'
          ? `${host} : page du parcours introuvable, brochure utilisée`
          : `${host} : pages formation lues`,
      );
    }
    await ctx.report({ progress: 100, step: 'Terminé' });
    return { status: 'SUCCEEDED', stats, summary: '3 domaines lus' };
  },
};

/** Booklets in PDF are now read by univ-sites (PDF_BOOKLET template): replayed after the pages. */
const booklets = {
  async run(ctx: RunContext, stats = emptyStats()): Promise<RunResult> {
    await ctx.report({ progress: 30, step: 'Brochure des masters URCA 2025' });
    await pause();
    await ctx.log('OK', 'brochure des masters URCA 2025 : 15 places, taux d’accès 43 %');
    await ctx.report({ progress: 70, step: 'Livret VNP 2022-2023' });
    await pause();
    const vnp = await prisma.program.findUnique({
      where: { slug: 'valorisation-des-nouveaux-patrimoines' },
    });
    if (vnp) {
      await syncField(
        {
          entityType: 'PROGRAM',
          entityId: vnp.id,
          entityLabel: vnp.title,
          field: 'semesters',
          label: 'Programme',
          value: '4 semestres',
          source: 'Livret pédagogique de l’UFR Histoire 2022-2023',
          sourceKey: 'univ-sites',
          state: 'STALE',
        },
        ctx,
        stats,
      );
      await ensureAlert({
        key: 'vnp-stale-programme',
        severity: 'WARNING',
        title: 'Programme ancien',
        detail: `${vnp.title} : programme issu du livret 2022-2023, aucun plus récent trouvé.`,
        link: `program:${vnp.slug}`,
        linkLabel: 'Ouvrir la fiche',
      });
    }
    await ctx.log('WARN', 'livret VNP 2022-2023 : tableau des modalités de contrôle illisible');
    await ctx.report({ progress: 100, step: 'Terminé' });
    return { status: 'SUCCEEDED', stats, summary: 'Terminé avec 1 avertissement' };
  },
};

const simple = (key: SourceKey, message: string): SourceConnector => ({
  key,
  async run(ctx) {
    await ctx.report({ progress: 50, step: 'Lecture du jeu de données' });
    await pause();
    await ctx.log('OK', message);
    await ctx.report({ progress: 100, step: 'Terminé' });
    return { status: 'SUCCEEDED', stats: emptyStats(), summary: message };
  },
});

const univSitesWithBooklets: SourceConnector = {
  key: 'univ-sites',
  async run(ctx) {
    const pages = await univSites.run(ctx);
    const pdfs = await booklets.run(ctx);
    return { ...pdfs, summary: `${pages.summary} · livrets : ${pdfs.summary}` };
  },
};

/** Mock connectors (CONNECTORS_MODE=mock: dev, tests, CI). They never touch the network. */
export const MOCK_CONNECTORS: Record<SourceKey, SourceConnector> = {
  'esr-etablissements': simple(
    'esr-etablissements',
    'simulation : 245 établissements, aucun changement',
  ),
  'monmaster-opendata': mmOpenData,
  rncp,
  insersup,
  'sise-diplomes': simple('sise-diplomes', 'simulation : codes SISE inchangés'),
  'm2-selectifs': simple('m2-selectifs', 'simulation : source désactivée par défaut'),
  'onisep-ideo': simple('onisep-ideo', 'simulation : source désactivée par défaut (ODbL)'),
  'univ-sites': univSitesWithBooklets,
  'monmaster-fiches': mmFiches,
};

export type { RunContext, RunResult };
