/**
 * What the SEO check reads in a served page (scripts/seo-check.ts). Pure regular expressions on
 * the HTML that Next.js renders (double-quoted attributes): no DOM library, no network.
 */

export interface PageFacts {
  title: string | null;
  /** Number of <title> tags (exactly one expected). */
  titleCount: number;
  /** <title> and description inside <head> (not streamed into the body). */
  metaInHead: boolean;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string[];
  /** Heading levels in document order (2, 3, 2…), for jumps (h2 → h4). */
  headings: number[];
  jsonLd: unknown[];
  jsonLdErrors: string[];
  /** Visible breadcrumb labels (nav « Fil d’Ariane »). */
  breadcrumb: string[];
  links: string[];
  og: Record<string, string>;
  scripts: string[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
      );
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text of an HTML fragment: tags removed, entities decoded, spaces collapsed. */
export function textOf(html: string): string {
  return decodeEntities(
    html.replace(/<span[^>]*class="sr-only"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return m ? decodeEntities(m[1]!) : null;
}

function metaContent(html: string, key: 'name' | 'property', value: string): string | null {
  for (const m of html.matchAll(/<meta\s[^>]*>/gi))
    if (attr(m[0], key)?.toLowerCase() === value) return attr(m[0], 'content');
  return null;
}

/**
 * Visible labels of the breadcrumb: the full label when it is cut in the middle (the
 * `sr-only` copy), never the shortened one.
 */
function breadcrumbLabels(html: string): string[] {
  const nav = /<nav[^>]*aria-label="Fil d’Ariane"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  if (!nav) return [];
  return [...nav[1]!.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((li) => {
    const full = /<span class="sr-only">([\s\S]*?)<\/span>/.exec(li[1]!);
    if (full) return textOf(full[1]!);
    return textOf(li[1]!.replace(/<span aria-hidden="true">\/<\/span>/, ''));
  });
}

export function readPage(html: string): PageFacts {
  const headEnd = html.indexOf('</head>');
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const titles = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)];
  const jsonLd: unknown[] = [];
  const jsonLdErrors: string[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      jsonLd.push(JSON.parse(m[1]!));
    } catch (e) {
      jsonLdErrors.push(`JSON-LD illisible : ${(e as Error).message}`);
    }
  }
  const canonical = [...html.matchAll(/<link\s[^>]*>/gi)]
    .map((m) => m[0])
    .find((t) => attr(t, 'rel') === 'canonical');
  const og: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const p = attr(m[0], 'property') ?? attr(m[0], 'name');
    const c = attr(m[0], 'content');
    if (p && c !== null && /^(og|twitter):/.test(p) && !(p in og)) og[p] = c;
  }
  // Headings outside the hidden SVG and template content; sr-only headings count (outline).
  const headings = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
  return {
    title: titles[0] ? textOf(titles[0][1]!) : null,
    titleCount: titles.length,
    metaInHead:
      /<title[^>]*>/i.test(head) &&
      (metaContent(head, 'name', 'description') !== null ||
        !metaContent(html, 'name', 'description')),
    description: metaContent(html, 'name', 'description'),
    canonical: canonical ? attr(canonical, 'href') : null,
    robots: metaContent(html, 'name', 'robots'),
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textOf(m[1]!)),
    headings,
    jsonLd,
    jsonLdErrors,
    breadcrumb: breadcrumbLabels(html),
    links: [...html.matchAll(/<a\s[^>]*>/gi)]
      .map((m) => attr(m[0], 'href'))
      .filter((h): h is string => !!h),
    og,
    scripts: [...html.matchAll(/<script\s[^>]*src="([^"]+)"/gi)].map((m) => decodeEntities(m[1]!)),
  };
}

/** h2 → h4 without an h3: the jumps of a heading outline (« h2→h4 »). */
export function headingJumps(levels: number[]): string[] {
  const out: string[] = [];
  let prev = 0;
  for (const l of levels) {
    if (prev && l > prev + 1) out.push(`h${prev}→h${l}`);
    prev = l;
  }
  return [...new Set(out)];
}

/** robots meta or X-Robots-Tag value says noindex. */
export const isNoindex = (v: string | null | undefined) => !!v && /\bnoindex\b/i.test(v);
