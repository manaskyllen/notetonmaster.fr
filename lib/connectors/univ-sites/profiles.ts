/**
 * Extraction profiles of the university sites (`ExtractionProfile.config`, JSON validated by Zod,
 * no code). A profile names a template (one shared set of rules for the Ametys catalogues, one for
 * the K-Sup sites, one per Drupal site) plus the site's own settings: catalogue hosts, sitemaps,
 * entry addresses and, if needed, selectors that override the template.
 *
 * Starting point: fixtures/decisions/univ-sites-profils.json (reconnaissance of 14/11/2026). A
 * profile edited in the admin is never overwritten by that file.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ExtractOptions, HeadingRule } from './sections';

export const TEMPLATES = ['AMETYS_ODF_HTML', 'KSUP', 'DRUPAL', 'GENERIC_HTML'] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<Template, string> = {
  AMETYS_ODF_HTML: 'Ametys ODF (HTML)',
  KSUP: 'K-Sup',
  DRUPAL: 'Drupal',
  GENERIC_HTML: 'Autre (HTML générique)',
};

const headingRule = z.object({
  selector: z.string().min(1).max(200),
  level: z.number().int().min(1).max(9),
});

/** Serialisable part of the extractor options (no RegExp: noise lines are strings). */
export const extractConfig = z
  .object({
    root: z.string().max(200).optional(),
    drop: z.string().max(500).optional(),
    headings: z.array(headingRule).max(10).optional(),
    ignoreHeadings: z.string().max(300).optional(),
    controllers: z.array(headingRule).max(10).optional(),
    facts: z.string().max(200).optional(),
    noise: z.array(z.string().max(200)).max(20).optional(),
  })
  .strict();
export type ExtractConfig = z.infer<typeof extractConfig>;

export const profileConfig = z
  .object({
    template: z.enum(TEMPLATES),
    /** Catalogue hosts the crawler may visit (robots.txt checked on each). */
    hosts: z
      .array(z.string().regex(/^[a-z0-9.-]+$/))
      .min(1)
      .max(20),
    sitemaps: z.array(z.string().url()).max(20).default([]),
    /** « Adresses d'entrée » (lot 4): pages listing the masters, filled in the admin. */
    entryUrls: z.array(z.string().url()).max(30).default([]),
    /** Program page URL pattern (regular expression on the path); the template's by default. */
    include: z.string().max(300).optional(),
    exclude: z.string().max(300).optional(),
    maxPages: z.number().int().min(1).max(5000).default(1500),
    extract: extractConfig.optional(),
    /** Known blocking reason (robots.txt Disallow): the site is never collected. */
    blocked: z.string().max(300).optional(),
  })
  .strict();
export type ProfileConfig = z.infer<typeof profileConfig>;

interface TemplateRules {
  /** Program pages (path). */
  include: RegExp;
  /** Never program pages (path). */
  exclude: RegExp;
  extract: ExtractOptions;
  /** Path depth that tells a mention page from a parcours page, when the template knows it. */
  level?: (path: string) => 'PARCOURS' | 'MENTION' | null;
  /** Elements whose text is the mention of the page (breadcrumb, parent title). */
  mentionSelector: string;
}

const NOT_PROGRAM =
  /(stage-master|offres?-de-stage|devenir-des-etudiants|insertion-professionnelle-des|enquete|arrete-|actes-administratifs|fiches-synthetiques|rencontre|jury|\/vae\b|actualit|news|agenda|[ée]v[ée]nement|event|soutenance|recherche\/|search|inscri|candidat|erasmus|mobilit|portes-ouvertes|appel|marche|emploi|recrutement|laboratoire|these|doctorat|\.pdf$|\.docx?$)/i;

/**
 * Ametys ODF: /<catalogue>/master-XB/<mention>-CODE(/<parcours>-CODE).html. The type segment is
 * « master-XB », « master-lmd-XB » or « master-M » (never a mention slug, which also starts with
 * « master- »); deeper pages are course units and choice blocks.
 */
const AMETYS_PATH =
  /\/(master(?:-(?:lmd|master|m))?(?:-[A-Z]{1,3})?)\/([^/]+-[A-Za-z0-9]{8})(?:\/([^/]+-[A-Za-z0-9]{8}))?\.html$/;

export const TEMPLATE_RULES: Record<Template, TemplateRules> = {
  AMETYS_ODF_HTML: {
    include: AMETYS_PATH,
    exclude: /(cursus-master|\/ue\d*-|\/bcc-|\/semestre-|\/choix-|\/bloc-)/i,
    extract: {
      headings: [
        { selector: 'h2.ametys-section-title', level: 2 },
        { selector: 'h2.ametys-section-sub-title', level: 3 },
        { selector: 'h3', level: 4 },
      ],
      ignoreHeadings: '[class*=benefits], .ametys-widget__subtitle',
      facts: '.ametys-benefits-alt__item-title',
      drop: '.ametys-widget, [class*=breadcrumb]',
    },
    level: (path) => {
      const m = AMETYS_PATH.exec(path);
      if (!m) return null;
      // Two levels (mention/parcours) is a parcours page; one level may be either (Orléans puts
      // its parcours at the first level): decided by the matching.
      return m[3] ? 'PARCOURS' : null;
    },
    mentionSelector: '.ametys-main-banner-alt__parentTitle',
  },
  KSUP: {
    include: /master/i,
    exclude: NOT_PROGRAM,
    extract: { drop: '[class*=breadcrumb], .cta, .share, [class*=partage]' },
    mentionSelector: '[class*=breadcrumb] li, [class*=ariane] li',
  },
  DRUPAL: {
    include: /master/i,
    exclude: NOT_PROGRAM,
    extract: { drop: '[class*=breadcrumb]' },
    mentionSelector: '[class*=breadcrumb] li',
  },
  GENERIC_HTML: {
    include: /master/i,
    exclude: NOT_PROGRAM,
    extract: { drop: '[class*=breadcrumb]' },
    mentionSelector: '[class*=breadcrumb] li',
  },
};

/** Extractor options of a profile: the template's, overridden by the profile's own settings. */
export function extractOptions(cfg: ProfileConfig, url?: string): ExtractOptions {
  const base = TEMPLATE_RULES[cfg.template].extract;
  const own = cfg.extract ?? {};
  const headings: HeadingRule[] | undefined = own.headings ?? base.headings;
  return {
    ...base,
    ...own,
    headings,
    drop: [base.drop, own.drop].filter(Boolean).join(', ') || undefined,
    noise: [...(base.noise ?? []), ...(own.noise ?? []).map((s) => new RegExp(s, 'i'))],
    url,
  };
}

export function isProgramUrl(cfg: ProfileConfig, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!cfg.hosts.includes(u.hostname)) return false;
  const rules = TEMPLATE_RULES[cfg.template];
  const include = cfg.include ? new RegExp(cfg.include, 'i') : rules.include;
  const exclude = cfg.exclude ? new RegExp(cfg.exclude, 'i') : rules.exclude;
  const path = decodeURIComponent(u.pathname);
  return (
    include.test(path) && !exclude.test(path) && !/\.(pdf|docx?|xlsx?|jpe?g|png|zip)$/i.test(path)
  );
}

export function pageLevel(cfg: ProfileConfig, url: string): 'PARCOURS' | 'MENTION' | null {
  try {
    return TEMPLATE_RULES[cfg.template].level?.(decodeURIComponent(new URL(url).pathname)) ?? null;
  } catch {
    return null;
  }
}

// ───────────────────────────── starting file ─────────────────────────────

export const seedProfileSchema = z.object({
  uai: z.string().nullable(),
  name: z.string(),
  template: z.enum(TEMPLATES),
  hosts: z.array(z.string()),
  sitemaps: z.array(z.string()).default([]),
  entryUrls: z.array(z.string()).default([]),
  blocked: z.string().optional(),
});
export type SeedProfile = z.infer<typeof seedProfileSchema>;

export const PROFILES_FILE = 'fixtures/decisions/univ-sites-profils.json';

export function readSeedProfiles(path = PROFILES_FILE): SeedProfile[] {
  // turbopackIgnore: read at run time from the working directory (the runner image copies
  // fixtures/decisions); the tracer must not take the whole project for it.
  const raw = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, 'utf8')) as {
    profiles: unknown[];
  };
  return raw.profiles.map((p) => seedProfileSchema.parse(p));
}

/** ExtractionProfile.kind for a template (GENERIC_HTML stays GENERIC_HTML). */
export const kindOf = (t: Template) => t;

export function configFromSeed(p: SeedProfile): ProfileConfig {
  return profileConfig.parse({
    template: p.template,
    hosts: p.hosts.length ? p.hosts : ['invalid.local'],
    sitemaps: p.sitemaps,
    entryUrls: p.entryUrls,
    ...(p.blocked ? { blocked: p.blocked } : {}),
  });
}
