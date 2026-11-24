import { Marked, type Tokens } from 'marked';
import { BLOCK_LIKE_RE, blockError, esc, parseBlock, renderBlock, type Block } from './blocks';
import type { Figures } from './figures';
import { fold, slugify } from './model';
import { isKnownToken, resolveToken, TOKEN_RE } from './tokens';

/**
 * Markdown of a guide → HTML, on the server. Raw HTML is never rendered (shown as text), images
 * neither, a link is either a checked internal path or an http(s) address (rel="noopener"):
 * `javascript:` and the other schemes leave only their text. Tokens become numbers, block lines
 * tables or boxes, the questions of « Questions fréquentes » native <details>, and the brand
 * written « note ton master » the logo in text.
 *
 * Three modes:
 * - `public`: the site. An unknown token or block shows nothing (publication is refused anyway);
 * - `preview`: the same page for the admin, unknown tokens and blocks in red;
 * - `edit`: the annotated text of the editor: tokens as violet pills (value, code on hover),
 *   blocks as cards with their first lines.
 */

export type RenderMode = 'public' | 'preview' | 'edit';

export interface LinkContext {
  /** Slugs of the guides a link may point to (published ones on the site, all in the admin). */
  guides: Set<string>;
  /** Open cities (/masters/{ville}). */
  cities: Set<string>;
}

export interface RenderIssue {
  kind: 'token' | 'block' | 'link';
  /** The token code, the block line or the address. */
  source: string;
  message: string;
}

export interface RenderResult {
  html: string;
  /** H2 of the text, in order: the table of contents. */
  toc: { id: string; text: string }[];
  issues: RenderIssue[];
  /** Token codes written in the text. */
  tokens: string[];
  /** Words of the text (blocks and FAQ markup aside, tokens counted as their value). */
  words: number;
  /** Valid internal links of the text. */
  internalLinks: number;
  /** A « Questions fréquentes » section with at least one question. */
  hasFaq: boolean;
}

const INTERNAL_PREFIXES = [
  '/parcours/',
  '/mentions',
  '/universites',
  '/explorer',
  '/masters',
  '/guides',
  '/avis/nouveau',
  '/a-propos',
  '/legal/',
  '/comparer',
  '/signaler',
];
const SITE_HOST = /^https?:\/\/(www\.)?notetonmaster\.fr(?=\/|$)/i;

/** Why an internal path is refused, or null when it leads to a page of the site. */
export function internalLinkError(path: string, ctx: LinkContext): string | null {
  const clean = path.split(/[?#]/)[0]!.replace(/\/$/, '') || '/';
  if (clean === '/') return null;
  const guide = /^\/guides\/([^/]+)$/.exec(clean);
  if (guide) return ctx.guides.has(guide[1]!) ? null : `guide inconnu ou non publié : ${guide[1]}`;
  const parts = clean.split('/');
  if (parts[1] === 'masters' && parts.length >= 3 && parts.length <= 4)
    return ctx.cities.has(parts[2]!) ? null : `ville non ouverte : ${parts[2]}`;
  if (INTERNAL_PREFIXES.some((p) => clean === p.replace(/\/$/, '') || clean.startsWith(p)))
    return null;
  return `page inconnue : ${clean}`;
}

const FAQ_TITLE = 'questions frequentes';
const QUESTION_RE = /^\*\*(.+?)\*\*\s*$/;
const PH = (kind: 'B' | 'F' | 'T', i: number) => `NM${kind}${i}X`;

interface Prepared {
  text: string;
  blocks: Block[];
  faqs: { q: string; a: string }[];
}

/** Block lines and FAQ entries out of the Markdown, each replaced by a placeholder paragraph. */
function prepare(src: string): Prepared {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const blocks: Block[] = [];
  const faqs: { q: string; a: string }[] = [];
  let inFaq = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) inFaq = h[1]!.length === 2 && fold(h[2]!).startsWith(FAQ_TITLE);
    if (BLOCK_LIKE_RE.test(line.trim())) {
      blocks.push(parseBlock(line)!);
      out.push('', PH('B', blocks.length - 1), '');
      continue;
    }
    const q = inFaq ? QUESTION_RE.exec(line.trim()) : null;
    if (q) {
      const answer: string[] = [];
      while (
        i + 1 < lines.length &&
        lines[i + 1]!.trim() &&
        !QUESTION_RE.test(lines[i + 1]!.trim()) &&
        !/^#{1,6}\s/.test(lines[i + 1]!)
      )
        answer.push(lines[++i]!);
      faqs.push({ q: q[1]!, a: answer.join('\n') });
      out.push('', PH('F', faqs.length - 1), '');
      continue;
    }
    out.push(line);
  }
  return { text: out.join('\n'), blocks, faqs };
}

/** « note ton master » (and « notetonmaster ») in the text, outside tags, headings and links. */
const BRAND_SPACED = /(?<![\w@./-])note ton master(?![\w@-]|\.[a-z])/gi;
const BRAND_WORD = /(?<![\w@./-])notetonmaster(?![\w@-]|\.[a-z])/g;
const BRAND_HTML =
  '<span class="brand-s">note<span class="brand__g">ton</span><span class="brand__m">master</span></span>';

export function brandInHtml(html: string): string {
  let skip = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(h[1-6]|a)[\s>]/i.test(part)) skip++;
        else if (/^<\/(h[1-6]|a)>/i.test(part)) skip = Math.max(0, skip - 1);
        return part;
      }
      return skip ? part : part.replace(BRAND_SPACED, BRAND_HTML).replace(BRAND_WORD, BRAND_HTML);
    })
    .join('');
}

/** The chapô and short texts: escaped, brand written like the logo. */
export function renderPlain(text: string): string {
  return brandInHtml(esc(text));
}

/** Plain text of some HTML (word counts, table of contents). */
export const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#8239;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const countWords = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function renderArticle(
  body: string,
  figures: Figures,
  links: LinkContext,
  mode: RenderMode = 'public',
): RenderResult {
  const issues: RenderIssue[] = [];
  const toc: { id: string; text: string }[] = [];
  const ids = new Set<string>();
  let internalLinks = 0;
  const flag = mode !== 'public';

  // Tokens: placeholders the Markdown parser leaves alone, resolved at the end.
  const codes: string[] = [];
  const tokenized = body.replace(TOKEN_RE, (_m, code: string) => {
    codes.push(code);
    return PH('T', codes.length - 1);
  });
  const { text: withTokens, blocks, faqs } = prepare(tokenized);
  const values = codes.map((c) => resolveToken(c, figures));
  for (const [i, c] of codes.entries())
    if (!values[i] && !issues.some((x) => x.kind === 'token' && x.source === c))
      issues.push({
        kind: 'token',
        source: `{{${c}}}`,
        message:
          isKnownToken(c) && !c.startsWith('etablissement.')
            ? `pas de valeur pour {{${c}}} (ville non ouverte ?)`
            : `jeton inconnu {{${c}}}`,
      });

  const tokenHtml = (i: number, plain: boolean) => {
    const v = values[i];
    const code = `{{${codes[i]}}}`;
    if (!v)
      return flag
        ? `<span class="g-tok g-tok--bad" title="Jeton inconnu : la publication est bloquée">${esc(code)}</span>`
        : '';
    if (plain) return esc(v.text);
    if (mode === 'edit')
      return `<span class="g-tok" title="${esc(code)}" data-code="${esc(codes[i]!)}">${esc(v.text)}</span>`;
    return `<span class="num">${esc(v.text)}</span>`;
  };
  const plainTokens = (s: string) =>
    s.replace(/NMT(\d+)X/g, (_m, i: string) => tokenHtml(Number(i), true));

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      html({ text: raw }: Tokens.HTML | Tokens.Tag) {
        return esc(raw);
      },
      image({ text: alt }: Tokens.Image) {
        return esc(alt);
      },
      heading({ tokens, depth }: Tokens.Heading) {
        const level = Math.min(6, Math.max(2, depth));
        const inner = plainTokens(this.parser.parseInline(tokens));
        const label = textOf(inner);
        let id = slugify(label) || 'section';
        for (let k = 2; ids.has(id); k++) id = `${slugify(label)}-${k}`;
        ids.add(id);
        if (level === 2) toc.push({ id, text: label });
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
      link({ href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const target = href.trim().replace(SITE_HOST, '') || '/';
        if (target.startsWith('/') && !target.startsWith('//')) {
          const err = internalLinkError(target, links);
          if (err) {
            issues.push({ kind: 'link', source: target, message: err });
            return flag ? `<span class="g-badlink" title="${esc(err)}">${inner}</span>` : inner;
          }
          internalLinks++;
          return `<a href="${esc(target)}">${inner}</a>`;
        }
        if (/^https?:\/\/[^\s"'<>]+$/i.test(target))
          return `<a href="${esc(target)}" rel="noopener">${inner}</a>`;
        if (/^mailto:[^\s"'<>]+$/i.test(target)) return `<a href="${esc(target)}">${inner}</a>`;
        issues.push({ kind: 'link', source: target.slice(0, 80), message: 'adresse refusée' });
        return flag ? `<span class="g-badlink" title="Adresse refusée">${inner}</span>` : inner;
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td') =>
          `<${tag}${c.align === 'right' ? ' class="r"' : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        return `<div class="g-tblwrap" tabindex="0" role="region" aria-label="Tableau défilant"><table class="g-tbl"><thead><tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr></thead><tbody>${token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')}</tbody></table></div>\n`;
      },
    },
  });

  let html = marked.parse(withTokens, { async: false }) as string;

  // Words: the text without its blocks, tokens as their values.
  const words = countWords(
    textOf(
      html
        .replace(/NMB\d+X/g, '')
        .replace(/NMF(\d+)X/g, (_m, i: string) => ` ${faqs[Number(i)]!.q} ${faqs[Number(i)]!.a} `)
        .replace(/NMT(\d+)X/g, (_m, i: string) => values[Number(i)]?.text ?? ''),
    ),
  );

  // FAQ: one <details> per question (native, no script).
  html = html.replace(/<p>NMF(\d+)X<\/p>/g, (_m, i: string) => {
    const f = faqs[Number(i)]!;
    const q = plainTokens(marked.parseInline(f.q, { async: false }) as string);
    const a = marked.parse(f.a, { async: false }) as string;
    return `<details class="g-faq"><summary>${q}<span aria-hidden="true" class="g-faq__i"></span></summary><div class="g-faq__a">${a}</div></details>`;
  });

  // Blocks.
  html = html.replace(/<p>NMB(\d+)X<\/p>/g, (_m, i: string) => {
    const b = blocks[Number(i)]!;
    const err = blockError(b, !!figures.city);
    if (err) {
      issues.push({ kind: 'block', source: b.source, message: err });
      return flag
        ? `<div class="g-blockbad" role="note"><strong>Bloc refusé</strong> · ${esc(err)}<code>${esc(b.source)}</code></div>`
        : '';
    }
    const r = renderBlock(b, figures);
    if (mode !== 'edit') return r.html;
    const rows = r.preview.slice(0, 3);
    return `<div class="g-blockcard" data-source="${esc(b.source)}"><div class="g-blockcard__h"><strong>${esc(r.label)}</strong>${r.chips.map((c) => `<span class="g-chip">${esc(c)}</span>`).join('')}</div>${
      r.empty
        ? '<p class="g-blockcard__empty">Aucune ligne avec les données actuelles : le bloc ne s’affichera pas.</p>'
        : `<ol class="g-blockcard__rows">${rows.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${r.total > rows.length ? `<p class="g-blockcard__more">… ${r.total - rows.length} autre${r.total - rows.length > 1 ? 's' : ''} ligne${r.total - rows.length > 1 ? 's' : ''}. Aperçu avec les données réelles de la base.</p>` : ''}`
    }<code>${esc(b.source)}</code></div>`;
  });

  html = html.replace(/NMT(\d+)X/g, (_m, i: string) => tokenHtml(Number(i), false));
  html = brandInHtml(html);

  return {
    html,
    toc,
    issues,
    tokens: [...new Set(codes)],
    words,
    internalLinks,
    hasFaq: faqs.length > 0,
  };
}
