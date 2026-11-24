import { describe, expect, it } from 'vitest';
import { blockError, blockLine, parseBlock, renderBlock } from '@/lib/articles/blocks';
import { hasKeyword, publishBlockers, seoChecklist } from '@/lib/articles/checks';
import type { FigureRow, Figures } from '@/lib/articles/figures';
import { displayStatus, fold, isValidSlug, shortLede, slugify } from '@/lib/articles/model';
import { brandInHtml, internalLinkError, renderArticle } from '@/lib/articles/render';
import { changedTokens, resolveToken, tokensIn, tokenValues } from '@/lib/articles/tokens';

/** A test city: 10 parcours of two establishments, latest session 2026. */
function row(i: number, over: Partial<FigureRow> = {}): FigureRow {
  return {
    slug: `parcours-${i}`,
    title: `Parcours ${String.fromCharCode(64 + i)}`,
    university: i <= 8 ? 'Université de Testville' : 'Cnam',
    universitySlug:
      i <= 8 ? 'universite-de-testville' : 'conservatoire-national-des-arts-et-metiers',
    mention: i <= 3 ? 'Droit européen' : 'Informatique',
    domain:
      i <= 3
        ? 'droit-economie-gestion'
        : i <= 7
          ? 'sciences-technologies-sante'
          : 'arts-lettres-langues',
    modalities:
      i % 3 === 0 ? ['presentiel', 'alternance'] : i === 10 ? ['distance'] : ['presentiel'],
    places: 20 + i,
    applications: 100 * i,
    offers: [5, 12, 30, 80, 150, 260, 400, 700, null, 1000][i - 1] ?? null,
    accessRate: null,
    band: 'nc',
    session: 2026,
    ...over,
  };
}

function figures(rows = Array.from({ length: 10 }, (_, k) => row(k + 1))): Figures {
  const withRates = rows.map((r) => {
    if (r.accessRate !== null || r.offers === null || !r.applications) return r;
    const rate = Math.min(100, (r.offers / r.applications) * 100);
    return {
      ...r,
      accessRate: rate,
      band: (rate < 10
        ? 'tres-selectif'
        : rate <= 30
          ? 'selectif'
          : 'accessible') as FigureRow['band'],
    };
  });
  return {
    scope: 'ville:testville',
    city: { slug: 'testville', name: 'Testville' },
    session: 2026,
    rows: withRates,
    reviews: 7,
    universities: [
      { slug: 'universite-de-testville', name: 'Université de Testville', aliases: ['ut'] },
      {
        slug: 'conservatoire-national-des-arts-et-metiers',
        name: 'Conservatoire national des arts et métiers',
        aliases: ['cnam'],
      },
    ],
    site: { programs: 1234, cities: 5 },
    cities: [
      { slug: 'testville', name: 'Testville', programs: 10 },
      { slug: 'autreville', name: 'Autreville', programs: 3 },
    ],
    computedAt: '2026-11-24T00:00:00.000Z',
    dataUpdatedAt: null,
  };
}

const F = figures();
const LINKS = { guides: new Set(['autre-guide']), cities: new Set(['testville']) };

describe('jetons', () => {
  // Rates of the test city: 5/100=5 %, 12/200=6 %, 30/300=10 %, 80/400=20 %, 150/500=30 %,
  // 260/600≈43 %, 400/700≈57 %, 700/800=87.5 %, n.c., 1000/1000=100 %.
  const cases: [string, string][] = [
    ['ville.nom', 'Testville'],
    ['ville.parcours', '10'],
    ['ville.etablissements', '2'],
    ['ville.mentions', '2'],
    ['ville.tres_selectifs', '2'],
    ['ville.selectifs', '3'],
    ['ville.accessibles', '4'],
    ['ville.pct_tres_selectifs', '20'],
    ['ville.pct_accessibles', '40'],
    ['ville.alternance', '3'],
    ['ville.pct_alternance', '30'],
    ['ville.distance', '1'],
    ['ville.avis', '7'],
    ['domaine.deg', '3'],
    ['domaine.sts', '4'],
    ['domaine.all', '3'],
    ['domaine.shs', '0'],
    ['etablissement.universite-de-testville', '8'],
    ['etablissement.cnam', '2'],
    ['site.parcours', '1 234'],
    ['site.villes', '5'],
    ['session', '2026'],
  ];
  it.each(cases)('{{%s}} = %s', (code, value) => {
    expect(resolveToken(code, F)?.text.replace(/ /g, ' ')).toBe(value);
  });

  it('jeton inconnu : null, en rouge dans l’aperçu, absent du site, bloque la publication', () => {
    expect(resolveToken('ville.inconnu', F)).toBeNull();
    expect(resolveToken('domaine.xyz', F)).toBeNull();
    expect(resolveToken('etablissement.nulle-part', F)).toBeNull();
    expect(resolveToken('foo', F)).toBeNull();
    const body = 'Il y a {{ville.parcours}} parcours et {{ville.nimporte}} autres.';
    const pub = renderArticle(body, F, LINKS, 'public');
    expect(pub.html).not.toContain('{{');
    expect(pub.html).not.toContain('nimporte');
    expect(pub.issues).toEqual([
      expect.objectContaining({ kind: 'token', source: '{{ville.nimporte}}' }),
    ]);
    const preview = renderArticle(body, F, LINKS, 'preview');
    expect(preview.html).toContain('g-tok--bad');
    expect(preview.html).toContain('{{ville.nimporte}}');
    expect(
      publishBlockers(
        { title: 'T', lede: 'L', metaDescription: 'M', city: 'testville', body },
        pub,
        new Set(['testville']),
      ),
    ).toContain('Jeton inconnu : {{ville.nimporte}}');
  });

  it('les jetons de ville sont inconnus dans un guide « toutes villes »', () => {
    const all = { ...F, city: null, scope: 'toutes' };
    expect(resolveToken('ville.parcours', all)).toBeNull();
    expect(resolveToken('site.parcours', all)?.text).toBe('1 234'.replace(' ', ' '));
  });

  it('ville non ouverte : aucun chiffre de ville (jamais un faux 0)', () => {
    const closed = { ...figures([]), city: null, cityClosed: 'dijon' };
    expect(resolveToken('domaine.deg', closed)).toBeNull();
    expect(resolveToken('ville.parcours', closed)).toBeNull();
    expect(resolveToken('session', closed)?.text).toBe('2026');
    const r = renderArticle('{{ville.parcours}} parcours', closed, LINKS, 'preview');
    expect(r.issues[0]!.message).toMatch(/pas de valeur/);
  });

  it('liste les jetons d’un texte', () => {
    expect(tokensIn('a {{ville.nom}} b {{ session }} c {{ville.nom}}')).toEqual([
      'ville.nom',
      'session',
    ]);
  });

  it('rendu : nombres surlignés sur le site, pastilles avec leur code dans l’éditeur', () => {
    expect(renderArticle('{{ville.parcours}} parcours', F, LINKS).html).toContain(
      '<span class="num">10</span>',
    );
    const edit = renderArticle('{{ville.parcours}} parcours', F, LINKS, 'edit').html;
    expect(edit).toContain('class="g-tok" title="{{ville.parcours}}"');
    expect(edit).toContain('>10</span>');
  });
});

describe('blocs', () => {
  const html = (line: string, f = F) => renderBlock(parseBlock(line)!, f);

  it('lit et écrit une ligne de bloc', () => {
    expect(parseBlock('::: liste mention="Droit européen" limite=5 :::')).toEqual({
      name: 'liste',
      params: { mention: 'Droit européen', limite: '5' },
      source: '::: liste mention="Droit européen" limite=5 :::',
    });
    expect(blockLine('classement', { type: 'plus-selectifs', limite: 10, domaine: null })).toBe(
      '::: classement type=plus-selectifs limite=10 :::',
    );
    expect(blockLine('liste', { mention: 'Droit européen' })).toBe(
      '::: liste mention="Droit européen" :::',
    );
  });

  it('classement plus-selectifs : taux croissant, n.c. et petites candidatures exclus', () => {
    const r = html('::: classement type=plus-selectifs limite=3 min_candidatures=100 :::');
    expect(r.total).toBe(3);
    expect(r.preview.map((p) => p.split(' · ')[0])).toEqual([
      'Parcours A',
      'Parcours B',
      'Parcours C',
    ]);
    expect(r.html).toContain('href="/parcours/parcours-1"');
    expect(r.html).toContain('Source : Mon Master, session 2026, données ouvertes du ministère.');
    expect(r.html).not.toContain('Parcours I'); // taux non communiqué
    // min_candidatures: the first two have 100 and 200 applications.
    const big = html('::: classement type=plus-selectifs min_candidatures=250 :::');
    expect(big.preview[0]).toMatch(/^Parcours C/);
  });

  it('classement plus-accessibles, plus-demandes, plus-grands, par domaine', () => {
    expect(html('::: classement type=plus-accessibles limite=2 :::').preview[0]).toMatch(
      /^Parcours J/,
    );
    expect(html('::: classement type=plus-demandes limite=1 :::').preview[0]).toMatch(
      /^Parcours J/,
    );
    expect(html('::: classement type=plus-grands limite=1 :::').preview[0]).toMatch(/^Parcours J/);
    const deg = html('::: classement type=plus-selectifs domaine=deg :::');
    expect(deg.total).toBe(3);
  });

  it('liste par mention, par mot du titre, en alternance', () => {
    expect(html('::: liste mention="droit europeen" :::').total).toBe(3);
    expect(html('::: liste recherche="parcours j" :::').total).toBe(1);
    expect(html('::: liste modalite=alternance :::').total).toBe(3);
    expect(html('::: liste modalite=alternance :::').html).toContain('Taux d’accès');
  });

  it('chiffres-ville, domaines, appel-avis, villes', () => {
    const c = html('::: chiffres-ville :::');
    expect(c.html).toContain('g-stat__n">10<');
    expect(c.html).toContain('2 très sélectifs, 3 sélectifs, 4 accessibles');
    const d = html('::: domaines :::');
    expect(d.preview).toEqual([
      'Sciences, technologies, santé : 4',
      'Arts, lettres, langues : 3',
      'Droit, économie, gestion : 3',
    ]);
    expect(html('::: appel-avis :::').html).toContain('Tu es en master à Testville ?');
    expect(html('::: appel-avis :::').html).toContain('href="/avis/nouveau"');
    expect(html('::: villes :::').html).toContain('href="/masters/autreville"');
  });

  it('un bloc qui ne renvoie rien n’affiche rien (jamais de tableau vide)', () => {
    const empty = html('::: liste mention="Astrophysique" :::');
    expect(empty.empty).toBe(true);
    expect(empty.html).toBe('');
    const page = renderArticle('Avant\n\n::: liste mention="Astrophysique" :::\n\nAprès', F, LINKS);
    expect(page.html).not.toContain('<table');
    expect(page.issues).toEqual([]);
    const none = figures([]);
    expect(html('::: classement type=plus-selectifs :::', none).html).toBe('');
    expect(html('::: chiffres-ville :::', none).html).toBe('');
    expect(html('::: domaines :::', none).html).toBe('');
  });

  it('bloc inconnu ou mal réglé : erreur, en rouge dans l’aperçu, rien sur le site', () => {
    expect(blockError(parseBlock('::: carte :::')!, true)).toMatch(/inconnu/);
    expect(blockError(parseBlock('::: classement type=pire :::')!, true)).toMatch(/type/);
    expect(blockError(parseBlock('::: classement type=plus-grands limite=0 :::')!, true)).toMatch(
      /limite/,
    );
    expect(blockError(parseBlock('::: classement type=plus-grands domaine=xx :::')!, true)).toMatch(
      /domaine/,
    );
    expect(blockError(parseBlock('::: liste :::')!, true)).toMatch(/mention/);
    expect(blockError(parseBlock('::: liste mention=x couleur=rouge :::')!, true)).toMatch(
      /réglage/,
    );
    expect(blockError(parseBlock('::: chiffres-ville :::')!, false)).toMatch(/ville/);
    const body = 'Texte\n\n::: carte zoom=3 :::\n';
    expect(renderArticle(body, F, LINKS).html).not.toContain('carte');
    expect(renderArticle(body, F, LINKS, 'preview').html).toContain('g-blockbad');
    expect(renderArticle(body, F, LINKS).issues[0]!.kind).toBe('block');
  });

  it('dans l’éditeur, un bloc est une carte avec ses premières lignes', () => {
    const r = renderArticle('::: classement type=plus-selectifs limite=10 :::', F, LINKS, 'edit');
    expect(r.html).toContain('g-blockcard');
    expect(r.html).toContain('Classement · les plus sélectifs');
    expect(r.html).toMatch(/… \d+ autres lignes/);
  });
});

describe('« À relire »', () => {
  const body = 'Il y a {{ville.parcours}} parcours, dont {{ville.alternance}} en alternance.';

  it('passe à relire quand une valeur citée change', () => {
    const reviewed = tokenValues(body, F);
    expect(reviewed).toEqual({ 'ville.parcours': '10', 'ville.alternance': '3' });
    expect(changedTokens(body, reviewed, F)).toEqual([]);
    const after = figures([...F.rows, row(11)]);
    expect(changedTokens(body, reviewed, after)).toEqual([
      { code: 'ville.parcours', before: '10', after: '11' },
    ]);
  });

  it('ne dépend que des jetons cités dans le texte', () => {
    const reviewed = tokenValues(body, F);
    // One more review in the city: {{ville.avis}} is not quoted.
    expect(changedTokens(body, reviewed, { ...F, reviews: 99 })).toEqual([]);
    // Never reviewed: nothing to compare.
    expect(changedTokens(body, null, figures([]))).toEqual([]);
  });
});

describe('rendu Markdown', () => {
  it('jamais de HTML brut, d’image ni de javascript:', () => {
    const r = renderArticle(
      '<script>alert(1)</script>\n\nTexte <b onclick="x()">gras</b> [clic](javascript:alert(1)) ![img](https://x/y.png)',
      F,
      LINKS,
    );
    expect(r.html).not.toMatch(/<script|<b |onclick="|href="javascript|<img/);
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.issues.some((i) => i.kind === 'link')).toBe(true);
  });

  it('liens internes vérifiés, liens externes en noopener', () => {
    expect(internalLinkError('/guides/autre-guide', LINKS)).toBeNull();
    expect(internalLinkError('/guides/absent', LINKS)).toMatch(/guide/);
    expect(internalLinkError('/masters/testville', LINKS)).toBeNull();
    expect(internalLinkError('/masters/fermee', LINKS)).toMatch(/ville/);
    expect(internalLinkError('/a-propos', LINKS)).toBeNull();
    expect(internalLinkError('/nimporte', LINKS)).toMatch(/inconnue/);
    const r = renderArticle(
      '[a](/guides/autre-guide) [b](/guides/absent) [c](https://www.enseignementsup-recherche.gouv.fr/) [d](https://notetonmaster.fr/masters/testville)',
      F,
      LINKS,
    );
    expect(r.html).toContain('<a href="/guides/autre-guide">a</a>');
    expect(r.html).not.toContain('href="/guides/absent"');
    expect(r.html).toContain('rel="noopener"');
    expect(r.html).toContain('<a href="/masters/testville">d</a>');
    expect(r.internalLinks).toBe(2);
  });

  it('sommaire des H2, un seul H1 (ceux du texte deviennent des H2), FAQ en <details>', () => {
    const r = renderArticle(
      '# Titre en trop\n\n## La sélectivité à {{ville.nom}}\n\nTexte.\n\n## Questions fréquentes\n\n**Combien de masters ?**\n{{ville.parcours}} parcours.\n\n**Et à distance ?**\nOui.',
      F,
      LINKS,
    );
    expect(r.html).not.toContain('<h1');
    expect(r.toc.map((t) => t.text)).toEqual([
      'Titre en trop',
      'La sélectivité à Testville',
      'Questions fréquentes',
    ]);
    expect(r.html).toContain('<h2 id="la-selectivite-a-testville">');
    expect(r.html.match(/<details class="g-faq">/g)).toHaveLength(2);
    expect(r.html).toContain('<summary>Combien de masters ?');
    expect(r.html).toContain('<span class="num">10</span> parcours.');
    expect(r.hasFaq).toBe(true);
  });

  it('« note ton master » devient le logo en texte, sauf dans les titres et les liens', () => {
    const out = brandInHtml(
      '<h2>Sur note ton master</h2><p>Les avis de note ton master, <a href="/">note ton master</a></p>',
    );
    expect(out).toContain('<h2>Sur note ton master</h2>');
    expect(out).toContain('<p>Les avis de <span class="brand-s">note<span');
    expect(out).toContain('<a href="/">note ton master</a>');
  });

  it('apostrophes typographiques entre deux lettres, sommaire compris', () => {
    const r = renderArticle("## L'alternance\n\nC'est l'été, 'cité'.", F, LINKS);
    expect(r.html).toContain('<h2 id="l-alternance">L’alternance</h2>');
    expect(r.html).toContain('C’est l’été');
    expect(r.toc[0]!.text).toBe('L’alternance');
  });
});

describe('liste de contrôle SEO', () => {
  it('mot-clé : accents, casse et pluriels ignorés', () => {
    expect(hasKeyword('Masters à Nantes : les plus sélectifs', 'master sélectif Nantes')).toBe(
      true,
    );
    expect(hasKeyword('Masters à Nantes', 'master sélectif Nantes')).toBe(false);
  });

  it('7 points', () => {
    const items = seoChecklist(
      {
        title: 'Master à Testville : le guide',
        lede: 'Une ville, des formations.',
        metaDescription: 'x'.repeat(140),
        keyword: 'master Testville',
      },
      {
        toc: [{ id: 'a', text: 'Choisir son master à Testville' }],
        internalLinks: 3,
        hasFaq: true,
        words: 650,
      },
    );
    expect(items).toHaveLength(7);
    expect(items.filter((i) => !i.ok).map((i) => i.id)).toEqual(['kw-lede']);
  });
});

describe('modèle', () => {
  it('slugs, statut affiché, recherche', () => {
    expect(slugify('Master à Nantes : le guide !')).toBe('master-a-nantes-le-guide');
    expect(isValidSlug('master-nantes-guide')).toBe(true);
    expect(isValidSlug('Master Nantes')).toBe(false);
    expect(fold('Sélectivité d’accès')).toBe('selectivite d acces');
    expect(
      displayStatus({ status: 'SCHEDULED', online: true, publishedAt: new Date('2020-01-01') }),
    ).toBe('PUBLISHED');
    expect(shortLede('Une phrase. Une autre.')).toBe('Une phrase.');
  });
});
