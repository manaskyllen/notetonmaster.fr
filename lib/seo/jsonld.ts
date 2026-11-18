import { absoluteUrl, siteOrigin } from './site';

/**
 * JSON-LD of the public pages. Only what the page shows, and only types Google still uses
 * (docs/seo/donnees-structurees.md, checked against Search Central in November 2026):
 * - Organization and WebSite on every public page; no SearchAction (the sitelinks search box was
 *   removed in November 2024), never a rating on our own site;
 * - BreadcrumbList built from the visible breadcrumb (components/ui/Breadcrumb.tsx);
 * - EducationalOccupationalProgram on a fiche parcours, without aggregateRating: that type is
 *   not eligible to review snippets, and calling a master a Course would not match the page;
 * - no FAQPage (FAQ rich results stopped being shown in May 2026).
 * Tested by snapshots (tests/unit/seo-jsonld.test.ts) and by `pnpm seo:check`.
 */

type Json = Record<string, unknown>;
const CONTEXT = 'https://schema.org';

export function organizationJsonLd(origin = siteOrigin()): Json {
  const sameAs = (process.env.SEO_SAME_AS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^https:\/\//.test(s));
  return {
    '@type': 'Organization',
    '@id': `${origin}/#organisation`,
    name: 'notetonmaster',
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: `${origin}/icons/icon-512.png`, width: 512, height: 512 },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteJsonLd(origin = siteOrigin()): Json {
  return {
    '@type': 'WebSite',
    '@id': `${origin}/#site`,
    name: 'notetonmaster',
    url: `${origin}/`,
    inLanguage: 'fr-FR',
    publisher: { '@id': `${origin}/#organisation` },
  };
}

/** Organization + WebSite, once per public page (app/(public)/layout.tsx). */
export function siteJsonLd(origin = siteOrigin()): Json {
  return { '@context': CONTEXT, '@graph': [organizationJsonLd(origin), websiteJsonLd(origin)] };
}

export interface Crumb {
  label: string;
  href?: string;
}

/** The visible breadcrumb, item for item; the current page (last) without `item`. */
export function breadcrumbJsonLd(items: Crumb[], origin = siteOrigin()): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.label,
      ...(it.href && i < items.length - 1 ? { item: absoluteUrl(it.href, origin) } : {}),
    })),
  };
}

export interface ProgramJsonLdInput {
  slug: string;
  /** Displayed name (the h1). */
  title: string;
  mention: string;
  durationYears: number;
  ects: number | null;
  university: { name: string; slug: string; website: string | null };
  city: string;
  /** Prerequisites written by the team or read on the university page, if any. */
  prerequisites: string | null;
}

export function programJsonLd(p: ProgramJsonLdInput, origin = siteOrigin()): Json {
  return {
    '@type': 'EducationalOccupationalProgram',
    '@id': `${absoluteUrl(`/parcours/${p.slug}`, origin)}#programme`,
    name: p.title,
    url: absoluteUrl(`/parcours/${p.slug}`, origin),
    description: `Master ${p.mention}, parcours ${p.title}, à ${p.city}.`,
    provider: {
      '@type': 'CollegeOrUniversity',
      '@id': `${absoluteUrl(`/universites/${p.university.slug}`, origin)}#etablissement`,
      name: p.university.name,
      url: p.university.website ?? absoluteUrl(`/universites/${p.university.slug}`, origin),
    },
    educationalCredentialAwarded: 'Master',
    timeToComplete: `P${p.durationYears}Y`,
    numberOfCredits: p.ects ?? p.durationYears * 60,
    ...(p.prerequisites ? { programPrerequisites: p.prerequisites } : {}),
  };
}

export function universityJsonLd(
  u: { name: string; slug: string; website: string | null; city: string | null },
  origin = siteOrigin(),
): Json {
  return {
    '@type': 'CollegeOrUniversity',
    '@id': `${absoluteUrl(`/universites/${u.slug}`, origin)}#etablissement`,
    name: u.name,
    url: u.website ?? absoluteUrl(`/universites/${u.slug}`, origin),
    ...(u.city
      ? { address: { '@type': 'PostalAddress', addressLocality: u.city, addressCountry: 'FR' } }
      : {}),
  };
}

/** One block per page: `@graph` of the page's nodes. */
export function pageJsonLd(nodes: Json[]): Json {
  return { '@context': CONTEXT, '@graph': nodes };
}

/** Serialised for a <script type="application/ld+json"> (no « </script> » possible). */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
