/** What `pnpm seo:check` reads in a page (lib/seo/html.ts). */
import { describe, expect, it } from 'vitest';
import { headingJumps, isNoindex, readPage } from '@/lib/seo/html';

const html = `<!DOCTYPE html><html lang="fr"><head><meta charSet="utf-8"/>
<title>Master Droit – Nantes Université | notetonmaster</title>
<meta name="description" content="4,1/5 sur 12 avis d&#x27;étudiant·es"/>
<meta name="robots" content="noindex, follow"/>
<link rel="canonical" href="https://notetonmaster.fr/parcours/droit"/>
<meta property="og:title" content="Master Droit"/><meta name="twitter:card" content="summary_large_image"/>
</head><body><nav aria-label="Fil d’Ariane"><ol><li><a href="/">Accueil</a></li>
<li><span aria-hidden="true">/</span><span aria-hidden="true" title="Un très long nom">Un…nom</span><span class="sr-only">Un très long nom</span></li></ol></nav>
<h1 class="x">Droit <span>public</span></h1><h2>A</h2><h4>B</h4>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>
<a href="/mentions/droit">Droit</a><a href="mailto:x@y.fr">m</a></body></html>`;

describe('readPage', () => {
  it('reads title, description, robots, canonical, h1, breadcrumb, JSON-LD and links', () => {
    const p = readPage(html);
    expect(p.title).toBe('Master Droit – Nantes Université | notetonmaster');
    expect(p.metaInHead).toBe(true);
    expect(p.description).toBe("4,1/5 sur 12 avis d'étudiant·es");
    expect(isNoindex(p.robots)).toBe(true);
    expect(p.canonical).toBe('https://notetonmaster.fr/parcours/droit');
    expect(p.h1).toEqual(['Droit public']);
    expect(p.breadcrumb).toEqual(['Accueil', 'Un très long nom']);
    expect(p.jsonLd).toEqual([{ '@context': 'https://schema.org', '@type': 'WebSite' }]);
    expect(p.links).toEqual(['/', '/mentions/droit', 'mailto:x@y.fr']);
    expect(p.og['twitter:card']).toBe('summary_large_image');
    expect(headingJumps(p.headings)).toEqual(['h2→h4']);
  });
  it('a title streamed into the body is reported', () => {
    expect(readPage('<html><head></head><body><title>x</title></body></html>').metaInHead).toBe(
      false,
    );
  });
});
