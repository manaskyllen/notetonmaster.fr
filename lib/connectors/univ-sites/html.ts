/**
 * Small tolerant HTML parser for university pages (no dependency, no script executed).
 *
 * It builds a tree good enough for reading content: void elements, raw text (script, style),
 * implied end tags (p, li, dt/dd, tr, td/th, option), stray end tags ignored, common named
 * entities. Not a full HTML5 tree builder: no foster parenting, no adoption agency. It is used
 * to cut a page into sections by its headings and to read tables and lists, never to render.
 */

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  parent: El | null;
}
export type Node = El | string;

export const isEl = (n: Node | null | undefined): n is El => typeof n === 'object' && n !== null;

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp']);
/** Elements that close an open <p>. */
const CLOSES_P = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
  'summary',
]);
/** For an implied end tag: which open elements a new tag closes, and where the search stops. */
const IMPLIED: Record<string, { closes: string[]; stop: string[] }> = {
  li: { closes: ['li'], stop: ['ul', 'ol', 'menu'] },
  dt: { closes: ['dt', 'dd'], stop: ['dl'] },
  dd: { closes: ['dt', 'dd'], stop: ['dl'] },
  tr: { closes: ['tr', 'td', 'th'], stop: ['table', 'tbody', 'thead', 'tfoot'] },
  td: { closes: ['td', 'th'], stop: ['tr', 'table'] },
  th: { closes: ['td', 'th'], stop: ['tr', 'table'] },
  tbody: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], stop: ['table'] },
  thead: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], stop: ['table'] },
  tfoot: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], stop: ['table'] },
  option: { closes: ['option'], stop: ['select', 'datalist', 'optgroup'] },
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  thinsp: ' ',
  ensp: ' ',
  emsp: ' ',
  zwnj: '',
  zwj: '',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  bull: '•',
  middot: '·',
  euro: '€',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  sect: '§',
  para: '¶',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  ordf: 'ª',
  ordm: 'º',
  plusmn: '±',
  micro: 'µ',
  larr: '←',
  rarr: '→',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  oelig: 'œ',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  szlig: 'ß',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Auml: 'Ä',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ocirc: 'Ô',
  Ouml: 'Ö',
  OElig: 'Œ',
  Ugrave: 'Ù',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yuml: 'Ÿ',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      return code === 160 ? ' ' : String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!name || name in attrs) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Parses an HTML document or fragment into a tree rooted at a `#document` element. */
export function parseHtml(html: string): El {
  const root: El = { tag: '#document', attrs: {}, children: [], parent: null };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1]!;
  const text = (t: string) => {
    if (!t) return;
    const parent = top();
    const last = parent.children[parent.children.length - 1];
    if (typeof last === 'string') parent.children[parent.children.length - 1] = last + t;
    else parent.children.push(t);
  };
  const closeTo = (i: number) => {
    stack.length = Math.max(1, i);
  };
  const open = (tag: string, attrs: Record<string, string>) => {
    if (CLOSES_P.has(tag)) {
      // close an open <p> in the current block (not across a table cell or list item)
      for (let i = stack.length - 1; i > 0; i--) {
        const t = stack[i]!.tag;
        if (t === 'p') {
          closeTo(i);
          break;
        }
        if (
          [
            'td',
            'th',
            'li',
            'div',
            'section',
            'article',
            'table',
            'button',
            'dd',
            'dt',
            'details',
          ].includes(t)
        )
          break;
      }
    }
    const rule = IMPLIED[tag];
    if (rule) {
      for (let i = stack.length - 1; i > 0; i--) {
        const t = stack[i]!.tag;
        if (rule.stop.includes(t)) break;
        if (rule.closes.includes(t)) {
          closeTo(i);
          break;
        }
      }
    }
    const el: El = { tag, attrs, children: [], parent: top() };
    top().children.push(el);
    if (!VOID.has(tag)) stack.push(el);
    return el;
  };

  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text(decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) text(decodeEntities(html.slice(i, lt)));
    i = lt;
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const m =
      /^<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(
        html.slice(i, i + 4000),
      );
    if (!m) {
      text('<');
      i++;
      continue;
    }
    i += m[0].length;
    const tag = (m[2] ?? '').toLowerCase();
    if (m[1]) {
      // end tag: pop to the matching open element, ignore a stray one
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.tag === tag) {
          closeTo(k);
          break;
        }
      }
      continue;
    }
    const el = open(tag, parseAttrs(m[3] ?? ''));
    if (RAW.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      const body = html.slice(i, close < 0 ? n : close);
      if (tag === 'title' || tag === 'textarea') el.children.push(decodeEntities(body));
      else el.children.push(body);
      const gt = close < 0 ? n : html.indexOf('>', close);
      i = gt < 0 ? n : gt + 1;
      closeTo(stack.lastIndexOf(el));
    }
  }
  return root;
}

// ───────────────────────────── traversal ─────────────────────────────

export function* walk(el: El): Generator<El> {
  for (const c of el.children) {
    if (!isEl(c)) continue;
    yield c;
    yield* walk(c);
  }
}

const SKIP_TEXT = new Set(['script', 'style', 'noscript', 'template', 'svg']);
const BLOCK = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'caption',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

/** Visible text with line breaks between blocks (tabs between table cells), whitespace collapsed. */
export function textOf(node: Node): string {
  const parts: string[] = [];
  const rec = (n: Node) => {
    if (!isEl(n)) {
      parts.push(n);
      return;
    }
    if (SKIP_TEXT.has(n.tag) || n.attrs.hidden !== undefined || n.attrs['aria-hidden'] === 'true')
      return;
    const block = BLOCK.has(n.tag);
    if (block) parts.push('\n');
    if (n.tag === 'li') parts.push('• ');
    for (const c of n.children) rec(c);
    if (n.tag === 'td' || n.tag === 'th') parts.push('\t');
    if (block) parts.push('\n');
  };
  rec(node);
  return parts
    .join('')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Text on one line. */
export const inlineText = (n: Node) =>
  textOf(n)
    .replace(/\s*\n\s*/g, ' ')
    .trim();

export function getById(root: El, id: string): El | null {
  for (const e of walk(root)) if (e.attrs.id === id) return e;
  return null;
}

export function contains(a: El, b: Node): boolean {
  for (let p: El | null = isEl(b) ? b : null; p; p = p.parent) if (p === a) return true;
  return false;
}

// ───────────────────────────── selectors ─────────────────────────────
// Supported: tag, *, #id, .class, [attr], [attr=v], [attr~=v], [attr^=v], [attr$=v], [attr*=v],
// descendant (space), child (>), and comma lists. Enough for declarative profiles.

interface Compound {
  tag: string | null;
  id: string | null;
  classes: string[];
  attrs: { name: string; op: string | null; value: string }[];
}
type Step = { comb: ' ' | '>'; c: Compound };

const cache = new Map<string, Step[][]>();

/** Splits a selector group on whitespace and `>`, outside brackets and quotes. */
function splitTokens(g: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let quote: string | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (const ch of g) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '[') {
      depth++;
      cur += ch;
    } else if (ch === ']') {
      depth--;
      cur += ch;
    } else if (depth === 0 && ch === '>') {
      flush();
      out.push('>');
    } else if (depth === 0 && /\s/.test(ch)) flush();
    else cur += ch;
  }
  flush();
  return out;
}

function parseSelector(sel: string): Step[][] {
  const hit = cache.get(sel);
  if (hit) return hit;
  const groups = sel
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const steps: Step[] = [];
      let comb: ' ' | '>' = ' ';
      const tokens = splitTokens(g);
      for (const t of tokens) {
        if (t === '>') {
          comb = '>';
          continue;
        }
        const c: Compound = { tag: null, id: null, classes: [], attrs: [] };
        const re =
          /([a-zA-Z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g;
        for (const m of t.matchAll(re)) {
          if (m[1]) c.tag = m[1] === '*' ? null : m[1].toLowerCase();
          else if (m[2]) c.id = m[2];
          else if (m[3]) c.classes.push(m[3]);
          else if (m[4])
            c.attrs.push({
              name: m[4].toLowerCase(),
              op: m[5] ?? null,
              value: m[6] ?? m[7] ?? m[8] ?? '',
            });
        }
        steps.push({ comb, c });
        comb = ' ';
      }
      return steps;
    });
  cache.set(sel, groups);
  return groups;
}

function matchCompound(e: El, c: Compound): boolean {
  if (c.tag && e.tag !== c.tag) return false;
  if (c.id && e.attrs.id !== c.id) return false;
  if (c.classes.length) {
    const cls = (e.attrs.class ?? '').split(/\s+/);
    if (!c.classes.every((k) => cls.includes(k))) return false;
  }
  for (const a of c.attrs) {
    const v = e.attrs[a.name];
    if (v === undefined) return false;
    if (!a.op) continue;
    if (a.op === '=' && v !== a.value) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.value)) return false;
    if (a.op === '^=' && !v.startsWith(a.value)) return false;
    if (a.op === '$=' && !v.endsWith(a.value)) return false;
    if (a.op === '*=' && !v.includes(a.value)) return false;
    if (a.op === '|=' && v !== a.value && !v.startsWith(`${a.value}-`)) return false;
  }
  return true;
}

function matchSteps(e: El, steps: Step[], i: number): boolean {
  const step = steps[i]!;
  if (!matchCompound(e, step.c)) return false;
  if (i === 0) return true;
  const comb = step.comb;
  if (comb === '>')
    return !!e.parent && e.parent.tag !== '#document' && matchSteps(e.parent, steps, i - 1);
  for (let p = e.parent; p && p.tag !== '#document'; p = p.parent)
    if (matchSteps(p, steps, i - 1)) return true;
  return false;
}

export function matches(e: El, sel: string): boolean {
  return parseSelector(sel).some(
    (steps) => steps.length > 0 && matchSteps(e, steps, steps.length - 1),
  );
}

export function queryAll(root: El, sel: string): El[] {
  const out: El[] = [];
  for (const e of walk(root)) if (matches(e, sel)) out.push(e);
  return out;
}

export const query = (root: El, sel: string): El | null => queryAll(root, sel)[0] ?? null;

/** Removes the elements matching `sel` from the tree (in place). */
export function removeAll(root: El, sel: string): number {
  const found = queryAll(root, sel);
  for (const e of found) {
    if (!e.parent) continue;
    const i = e.parent.children.indexOf(e);
    if (i >= 0) e.parent.children.splice(i, 1);
  }
  return found.length;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]!);

/** Serialises a subtree back to HTML (used to keep trimmed test extracts). */
export function toHtml(n: Node): string {
  if (!isEl(n)) return esc(n);
  if (n.tag === '#document') return n.children.map(toHtml).join('');
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');
  if (VOID.has(n.tag)) return `<${n.tag}${attrs}>`;
  const inner = RAW.has(n.tag) ? n.children.join('') : n.children.map(toHtml).join('');
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`;
}
