import { counts, DOMAIN_CODES, pct, type FigureRow, type Figures } from './figures';
import { fold } from './model';

/**
 * Data blocks of the guides: one line `::: classement type=plus-selectifs limite=10 :::` becomes
 * a table, a list or a box, rendered on the server from the figures of the guide's city
 * (content/articles/README.md). A block that finds nothing renders nothing: never an empty table.
 * An unknown block (or a wrong setting) is an error: it blocks the publication, shows in red in
 * the admin and never on the site.
 */

/** Any line that looks like a block (a malformed one is reported, not shown as text). */
export const BLOCK_LIKE_RE = /^:::.*:::\s*$/;

export const BLOCK_NAMES = [
  'classement',
  'liste',
  'chiffres-ville',
  'domaines',
  'appel-avis',
  'villes',
] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export const RANKINGS = {
  'plus-selectifs': 'les plus sélectifs',
  'plus-accessibles': 'les plus accessibles',
  'plus-demandes': 'les plus demandés',
  'plus-grands': 'les plus grands',
} as const;
export type Ranking = keyof typeof RANKINGS;

export interface Block {
  name: string;
  params: Record<string, string>;
  /** The line as written. */
  source: string;
}

const PARAM_RE = /([a-z_]+)=(?:"([^"]*)"|([^\s"]+))/g;

/** A block line (`::: nom clé=valeur clé="deux mots" :::`), or null for any other line. A line
 *  that looks like a block but cannot be read comes back with an empty name (reported). */
export function parseBlock(line: string): Block | null {
  const source = line.trim();
  if (!BLOCK_LIKE_RE.test(source)) return null;
  const inner = source.slice(3, source.lastIndexOf(':::')).trim();
  const name = /^[a-z-]+/.exec(inner)?.[0] ?? '';
  const rest = inner.slice(name.length);
  const params: Record<string, string> = {};
  for (const p of rest.matchAll(PARAM_RE)) params[p[1]!] = p[2] ?? p[3] ?? '';
  const readable = !rest.replace(PARAM_RE, '').trim() && (!rest || /^\s/.test(rest));
  return readable ? { name, params, source } : { name: '', params: {}, source };
}

/** Writes a block line (menu « Bloc de données » of the editor). */
export function blockLine(name: string, params: Record<string, string | number | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => (/[\s"]/.test(String(v)) ? `${k}="${String(v)}"` : `${k}=${v}`));
  return `::: ${[name, ...parts].join(' ')} :::`;
}

const ALLOWED: Record<BlockName, string[]> = {
  classement: ['type', 'limite', 'min_candidatures', 'domaine'],
  liste: ['mention', 'recherche', 'modalite', 'limite'],
  'chiffres-ville': [],
  domaines: [],
  'appel-avis': [],
  villes: [],
};

const int = (v: string | undefined, min: number, max: number): number | null => {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

/** What is wrong with a block, or null. `hasCity`: a guide of one city. */
export function blockError(b: Block, hasCity: boolean): string | null {
  if (!b.name) return 'syntaxe : ::: nom clé=valeur :::';
  if (!(BLOCK_NAMES as readonly string[]).includes(b.name)) return `bloc inconnu « ${b.name} »`;
  const name = b.name as BlockName;
  const extra = Object.keys(b.params).filter((k) => !ALLOWED[name].includes(k));
  if (extra.length) return `réglage inconnu : ${extra.join(', ')}`;
  if (name === 'classement') {
    if (!(b.params.type && b.params.type in RANKINGS))
      return `type attendu : ${Object.keys(RANKINGS).join(', ')}`;
    if (Number.isNaN(int(b.params.limite, 1, 50))) return 'limite : un nombre de 1 à 50';
    if (Number.isNaN(int(b.params.min_candidatures, 0, 100000)))
      return 'min_candidatures : un nombre';
    if (b.params.domaine !== undefined && !(b.params.domaine in DOMAIN_CODES))
      return `domaine attendu : ${Object.keys(DOMAIN_CODES).join(', ')}`;
  }
  if (name === 'liste') {
    if (!b.params.mention && !b.params.recherche && !b.params.modalite)
      return 'liste : mention=, recherche= ou modalite=';
    if (b.params.modalite && !['alternance', 'distance'].includes(b.params.modalite))
      return 'modalite attendue : alternance, distance';
    if (Number.isNaN(int(b.params.limite, 1, 100))) return 'limite : un nombre de 1 à 100';
  }
  if (name === 'chiffres-ville' && !hasCity)
    return 'chiffres-ville : réservé aux guides d’une ville';
  return null;
}

export const SOURCE_LINE = (session: number | null) =>
  `Source : Mon Master, session ${session ?? '—'}, données ouvertes du ministère. Taux d’accès = propositions d’admission / candidatures.`;

// ─── Data ───

const nf = new Intl.NumberFormat('fr-FR');

export function rateText(rate: number): string {
  if (rate > 0 && rate < 1) return '< 1 %';
  return `${Math.round(rate)} %`;
}

/** Rows of a ranking: latest session, access rate known, enough applications. */
export function rankingRows(b: Block, f: Figures): FigureRow[] {
  const type = b.params.type as Ranking;
  const limit = int(b.params.limite, 1, 50) ?? 10;
  const min = int(b.params.min_candidatures, 0, 100000) ?? 100;
  const domain = b.params.domaine ? DOMAIN_CODES[b.params.domaine]?.slug : null;
  const rows = f.rows.filter(
    (r) =>
      r.accessRate !== null &&
      r.applications !== null &&
      r.offers !== null &&
      r.applications >= min &&
      (f.session === null || r.session === f.session) &&
      (!domain || r.domain === domain) &&
      (type !== 'plus-grands' || r.places !== null),
  );
  const by: Record<Ranking, (a: FigureRow, b: FigureRow) => number> = {
    'plus-selectifs': (a, c) => a.accessRate! - c.accessRate! || c.applications! - a.applications!,
    'plus-accessibles': (a, c) =>
      c.accessRate! - a.accessRate! || c.applications! - a.applications!,
    'plus-demandes': (a, c) => c.applications! - a.applications! || a.accessRate! - c.accessRate!,
    'plus-grands': (a, c) => c.places! - a.places! || c.applications! - a.applications!,
  };
  return rows
    .sort((a, c) => by[type](a, c) || a.title.localeCompare(c.title, 'fr'))
    .slice(0, limit);
}

/** Rows of a list: a mention, words of the title, or a modality. */
export function listRows(b: Block, f: Figures): FigureRow[] {
  const mention = b.params.mention ? fold(b.params.mention) : null;
  const words = b.params.recherche ? fold(b.params.recherche) : null;
  const limit = int(b.params.limite, 1, 100) ?? 100;
  return f.rows
    .filter(
      (r) =>
        (!mention || fold(r.mention) === mention) &&
        (!words || fold(r.title).includes(words)) &&
        (!b.params.modalite || r.modalities.includes(b.params.modalite)),
    )
    .sort((a, c) => a.title.localeCompare(c.title, 'fr') || a.slug.localeCompare(c.slug))
    .slice(0, limit);
}

// ─── HTML ───

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const rateCell = (r: FigureRow) =>
  r.accessRate === null
    ? '<span class="g-rate g-rate--nc">n.c.</span>'
    : `<span class="g-rate g-rate--${r.band}">${rateText(r.accessRate)}</span>`;

const programCell = (r: FigureRow) =>
  `<a href="/parcours/${esc(r.slug)}" class="g-prog">${esc(r.title)}</a><span class="g-univ">${esc(r.university)}</span>`;

const n = (v: number | null) => (v === null ? '—' : nf.format(v));

function table(head: string, body: string, f: Figures): string {
  return `<figure class="g-table"><div class="g-tblwrap" tabindex="0" role="region" aria-label="Tableau défilant"><table class="g-tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><figcaption class="g-source">${esc(SOURCE_LINE(f.session))}</figcaption></figure>`;
}

export interface BlockRender {
  html: string;
  /** Nothing found: nothing shown. */
  empty: boolean;
  /** Title of the admin card (« Classement · les plus sélectifs »). */
  label: string;
  /** Settings shown on the admin card. */
  chips: string[];
  /** First lines, plain text, for the admin card. */
  preview: string[];
  /** Lines in all. */
  total: number;
}

export function renderBlock(b: Block, f: Figures): BlockRender {
  const name = b.name as BlockName;
  const city = f.city?.name ?? null;
  switch (name) {
    case 'classement': {
      const rows = rankingRows(b, f);
      const type = b.params.type as Ranking;
      const chips = [
        `${int(b.params.limite, 1, 50) ?? 10} lignes`,
        `min. ${int(b.params.min_candidatures, 0, 100000) ?? 100} candidatures`,
        ...(b.params.domaine ? [DOMAIN_CODES[b.params.domaine]!.label] : []),
      ];
      const head =
        '<th scope="col">#</th><th scope="col">Parcours</th><th scope="col" class="r">Places</th><th scope="col" class="r">Candidatures</th><th scope="col" class="r">Taux d’accès</th>';
      const body = rows
        .map(
          (r, i) =>
            `<tr><td class="g-rank">${i + 1}</td><td>${programCell(r)}</td><td class="r">${n(r.places)}</td><td class="r">${n(r.applications)}</td><td class="r">${rateCell(r)}</td></tr>`,
        )
        .join('');
      return {
        html: rows.length ? table(head, body, f) : '',
        empty: !rows.length,
        label: `Classement · ${RANKINGS[type]}`,
        chips,
        preview: rows.map(
          (r) =>
            `${r.title} · ${r.university} · ${r.accessRate === null ? 'n.c.' : rateText(r.accessRate)}`,
        ),
        total: rows.length,
      };
    }
    case 'liste': {
      const rows = listRows(b, f);
      const head = '<th scope="col">Parcours</th><th scope="col" class="r">Taux d’accès</th>';
      const body = rows
        .map((r) => `<tr><td>${programCell(r)}</td><td class="r">${rateCell(r)}</td></tr>`)
        .join('');
      const what = b.params.mention
        ? `mention ${b.params.mention}`
        : b.params.recherche
          ? `titre contenant « ${b.params.recherche} »`
          : b.params.modalite === 'alternance'
            ? 'en alternance'
            : 'hybrides ou à distance';
      return {
        html: rows.length ? table(head, body, f) : '',
        empty: !rows.length,
        label: `Liste de parcours · ${what}`,
        chips: b.params.limite ? [`${b.params.limite} lignes max.`] : [],
        preview: rows.map(
          (r) =>
            `${r.title} · ${r.university} · ${r.accessRate === null ? 'n.c.' : rateText(r.accessRate)}`,
        ),
        total: rows.length,
      };
    }
    case 'chiffres-ville': {
      const c = counts(f);
      const known = c.veryselective + c.selective + c.accessible;
      const stat = (v: number, label: string) =>
        `<span class="g-stat"><span class="g-stat__n">${nf.format(v)}</span><span class="g-stat__l">${label}</span></span>`;
      const bar = known
        ? `<div class="g-bar" role="img" aria-label="${c.veryselective} très sélectifs, ${c.selective} sélectifs, ${c.accessible} accessibles"><span class="g-bar__tres" style="flex:${c.veryselective}"></span><span class="g-bar__sel" style="flex:${c.selective}"></span><span class="g-bar__acc" style="flex:${c.accessible}"></span></div><p class="g-legend"><span><span aria-hidden="true" class="g-sq g-sq--tres">■</span> <strong>${nf.format(c.veryselective)}</strong> très sélectifs (&lt; 10&#8239;%)</span><span><span aria-hidden="true" class="g-sq g-sq--sel">■</span> <strong>${nf.format(c.selective)}</strong> sélectifs (10 à 30&#8239;%)</span><span><span aria-hidden="true" class="g-sq g-sq--acc">■</span> <strong>${nf.format(c.accessible)}</strong> accessibles (&gt; 30&#8239;%)</span></p>`
        : '';
      return {
        html: c.programs
          ? `<div class="g-box g-figures"><div class="g-stats">${stat(c.programs, 'parcours')}${stat(c.establishments, c.establishments > 1 ? 'établissements' : 'établissement')}${stat(c.workStudy, 'en alternance')}${stat(c.remote, 'hybrides ou à distance')}</div>${bar}</div>`
          : '',
        empty: !c.programs,
        label: 'Chiffres de la ville',
        chips: [],
        preview: [
          `${c.programs} parcours, ${c.establishments} établissements`,
          `${c.veryselective} très sélectifs · ${c.selective} sélectifs · ${c.accessible} accessibles`,
          `${c.workStudy} en alternance (${pct(c.workStudy, c.programs)} %)`,
        ],
        total: 3,
      };
    }
    case 'domaines': {
      const total = f.rows.length;
      const rows = Object.values(DOMAIN_CODES)
        .map((d) => ({ ...d, n: f.rows.filter((r) => r.domain === d.slug).length }))
        .filter((d) => d.n > 0)
        .sort((a, c) => c.n - a.n || a.label.localeCompare(c.label, 'fr'));
      const max = Math.max(1, ...rows.map((r) => r.n));
      return {
        html: rows.length
          ? `<div class="g-box g-domains"><ul>${rows
              .map(
                (d) =>
                  `<li><span class="g-dom__l">${esc(d.label)}</span><span class="g-dom__bar" aria-hidden="true"><span style="width:${Math.max(2, Math.round((d.n / max) * 100))}%"></span></span><span class="g-dom__n">${nf.format(d.n)} <span class="g-dom__p">(${pct(d.n, total)}&#8239;%)</span></span></li>`,
              )
              .join('')}</ul></div>`
          : '',
        empty: !rows.length,
        label: 'Domaines',
        chips: [],
        preview: rows.map((d) => `${d.label} : ${d.n}`),
        total: rows.length,
      };
    }
    case 'appel-avis':
      return {
        html: `<aside class="g-cta"><span class="g-cta__t"><span class="g-cta__h">Tu es en master${city ? ` à ${esc(city)}` : ''} ?</span><span class="g-cta__p">Ton avis aide celles et ceux qui hésitent. 5 minutes, anonyme, sans compte.</span></span><a href="/avis/nouveau" class="g-cta__b">Donner mon avis <span aria-hidden="true">→</span></a></aside>`,
        empty: false,
        label: 'Appel à avis',
        chips: [],
        preview: [`Tu es en master${city ? ` à ${city}` : ''} ? Donne ton avis.`],
        total: 1,
      };
    case 'villes':
      return {
        html: f.cities.length
          ? `<ul class="g-cities">${f.cities
              .map(
                (c) =>
                  `<li><a href="/masters/${esc(c.slug)}">Masters à ${esc(c.name)}</a> <span>${nf.format(c.programs)} parcours</span></li>`,
              )
              .join('')}</ul>`
          : '',
        empty: !f.cities.length,
        label: 'Villes ouvertes',
        chips: [],
        preview: f.cities.map((c) => `${c.name} · ${c.programs} parcours`),
        total: f.cities.length,
      };
  }
}
