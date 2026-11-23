import type { Page } from '@playwright/test';
import { sql } from './helpers';

/**
 * Responsive (issue #14): the pages to check, and what is measured on them. Shared by the test
 * of every public page (54-responsive.spec.ts) and the mobile journeys (tests/mobile).
 * Reference widths: 320 (small phone, or 640 at 200 % zoom), 390, 768, 1024, 1440.
 */
export const WIDTHS = { small: 320, phone: 390, tabletPortrait: 768, tablet: 1024, desktop: 1440 };

export const VNP = 'valorisation-des-nouveaux-patrimoines';

export interface CheckedPage {
  name: string;
  path: string;
}

/** Every public page kind, on the demo data and the fixtures of the test databases. */
export async function publicPages(): Promise<CheckedPage[]> {
  const [city] = await sql<{ city: string; mention: string }>(
    `SELECT z.slug city, i."mentionSlug" mention
       FROM "ProgramSearchIndex" i JOIN "LaunchZone" z ON z.open AND z.slug = ANY(i."zoneSlugs")
      WHERE i."isPublicSector" GROUP BY 1, 2 HAVING count(*) >= 2
      ORDER BY count(*) DESC, 1, 2 LIMIT 1`,
  );
  const compared = await sql<{ slug: string }>(
    `SELECT slug FROM "Program" WHERE "isPublished" AND "inOpenZone" AND slug <> $1
      ORDER BY "reviewCount" DESC, slug LIMIT 2`,
    [VNP],
  );
  return [
    { name: 'Accueil', path: '/' },
    { name: 'Explorer', path: '/explorer' },
    { name: 'Fiche · avis', path: `/parcours/${VNP}` },
    { name: 'Fiche · questions', path: `/parcours/${VNP}?onglet=questions` },
    { name: 'Fiche · programme', path: `/parcours/${VNP}?onglet=programme` },
    { name: 'Fiche · admission', path: `/parcours/${VNP}?onglet=admission` },
    { name: 'Index des mentions', path: '/mentions' },
    { name: 'Mention', path: '/mentions/droit' },
    { name: 'Index des universités', path: '/universites' },
    { name: 'Université', path: '/universites/nantes-universite' },
    { name: 'Index des villes', path: '/masters' },
    ...(city
      ? [
          { name: 'Ville', path: `/masters/${city.city}` },
          { name: 'Ville × mention', path: `/masters/${city.city}/${city.mention}` },
        ]
      : []),
    {
      name: 'Comparateur (3 parcours)',
      path: `/comparer?ids=${[VNP, ...compared.map((c) => c.slug)].join(',')}`,
    },
    { name: 'Formulaire d’avis', path: '/avis/nouveau' },
    { name: 'Formulaire d’avis réglé', path: `/avis/nouveau?parcours=${VNP}` },
    { name: 'Connexion', path: '/connexion' },
    { name: 'À propos', path: '/a-propos' },
    { name: 'Charte', path: '/legal/charte' },
    { name: 'Confidentialité', path: '/legal/confidentialite' },
    { name: 'Mentions légales', path: '/legal/mentions-legales' },
    { name: 'CGU', path: '/legal/cgu' },
    { name: 'Signaler', path: '/signaler' },
    { name: 'Pas encore ouvert', path: '/pas-encore?ville=Paris' },
    { name: 'Réponse des formations', path: '/reponse-formation' },
    { name: 'Page introuvable', path: '/page-qui-n-existe-pas' },
  ];
}

/**
 * Horizontal scroll of the page (not of a table or a row that scrolls on purpose inside its own
 * box), with the elements that stick out, to say what to fix.
 */
export async function horizontalOverflow(
  page: Page,
): Promise<{ over: number; culprits: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const over = doc.scrollWidth - vw;
    const culprits: string[] = [];
    if (over > 0) {
      /**
       * Out of the flow of the page (fixed: never scrolls it), or inside a box that scrolls on
       * its own. An absolute element escapes such a box unless its containing block is in it
       * (an « sr-only » text in a table that scrolls): it still stretches the page.
       */
      const excused = (el: Element): boolean => {
        const abs = getComputedStyle(el).position === 'absolute';
        const holder = (el as HTMLElement).offsetParent;
        for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.position === 'fixed' || cs.display === 'none') return true;
          if (p !== el && ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX))
            if (!abs || (holder && p.contains(holder))) return true;
        }
        return false;
      };
      const sticksOut = (el: Element | null) => !!el && el.getBoundingClientRect().right > vw + 0.5;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        // The first element that sticks out on its own, not each of its children.
        if (!sticksOut(el) || excused(el)) continue;
        const parent = el.parentElement;
        if (parent && sticksOut(parent) && !excused(parent)) continue;
        const id = el.id ? `#${el.id}` : '';
        const cls =
          typeof el.className === 'string'
            ? `.${el.className.split(/\s+/).slice(0, 4).join('.')}`
            : '';
        culprits.push(`${el.tagName.toLowerCase()}${id}${cls} (→ ${Math.round(r.right)}px)`);
        if (culprits.length >= 6) break;
      }
    }
    return { over, culprits };
  });
}
