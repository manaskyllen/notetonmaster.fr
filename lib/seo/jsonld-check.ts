/**
 * Structural check of the JSON-LD we publish (types listed in lib/seo/jsonld.ts), used by the
 * unit tests and by `pnpm seo:check`. It is not Google's Rich Results Test (no public API): it
 * checks what that test and the schema.org validator would refuse in our own markup.
 * docs/seo/validation.md gives the manual validation steps.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isAbsUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/[^/]+/.test(v);
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

const KNOWN = new Set([
  'Organization',
  'WebSite',
  'BreadcrumbList',
  'ListItem',
  'EducationalOccupationalProgram',
  'CollegeOrUniversity',
  'ImageObject',
  'AggregateRating',
  'ItemList',
  'CollectionPage',
  'Place',
  'PostalAddress',
]);

/** Types Google accepts as `itemReviewed` of a review snippet (developers.google.com, 11/2026). */
export const REVIEW_SNIPPET_TYPES = new Set([
  'Book',
  'Course',
  'CreativeWorkSeason',
  'CreativeWorkSeries',
  'Episode',
  'Event',
  'Game',
  'HowTo',
  'LocalBusiness',
  'MediaObject',
  'Movie',
  'MusicPlaylist',
  'MusicRecording',
  'Product',
  'Recipe',
  'SoftwareApplication',
]);

/** Types Google no longer shows as rich results: never published here. */
export const RETIRED_TYPES = new Set(['FAQPage', 'HowTo', 'SearchAction', 'Course']);

function walk(node: unknown, path: string, out: string[], root: boolean): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`, out, false));
    return;
  }
  if (!isObj(node)) return;
  const type = node['@type'];
  if (root && node['@context'] !== 'https://schema.org')
    out.push(`${path} : @context doit valoir https://schema.org`);
  if (type !== undefined) {
    if (typeof type !== 'string') out.push(`${path} : @type doit être une chaîne`);
    else {
      if (RETIRED_TYPES.has(type)) out.push(`${path} : type ${type} non retenu (voir docs/seo)`);
      else if (!KNOWN.has(type)) out.push(`${path} : type ${type} inconnu du site`);
      checkType(type, node, path, out);
    }
  }
  for (const [k, v] of Object.entries(node))
    if (!k.startsWith('@')) walk(v, `${path}.${k}`, out, false);
}

function checkType(type: string, n: Obj, path: string, out: string[]) {
  const need = (k: string, ok: (v: unknown) => boolean, what: string) => {
    if (!ok(n[k])) out.push(`${path} (${type}) : ${k} ${what}`);
  };
  switch (type) {
    case 'Organization':
    case 'CollegeOrUniversity':
      need('name', isText, 'manquant');
      need('url', isAbsUrl, 'doit être une URL absolue');
      if (n.aggregateRating !== undefined)
        out.push(`${path} : jamais de note sur un établissement ou sur notre propre site`);
      break;
    case 'WebSite':
      need('name', isText, 'manquant');
      need('url', isAbsUrl, 'doit être une URL absolue');
      if (n.potentialAction !== undefined)
        out.push(`${path} : pas de SearchAction (champ de recherche retiré par Google)`);
      if (n.aggregateRating !== undefined) out.push(`${path} : jamais de note sur le site`);
      break;
    case 'BreadcrumbList': {
      const items = n.itemListElement;
      if (!Array.isArray(items) || items.length < 1) {
        out.push(`${path} : itemListElement vide`);
        break;
      }
      items.forEach((it, i) => {
        if (!isObj(it) || it['@type'] !== 'ListItem')
          return out.push(`${path}[${i}] : ListItem attendu`);
        if (it.position !== i + 1) out.push(`${path}[${i}] : position ${i + 1} attendue`);
        if (!isText(it.name)) out.push(`${path}[${i}] : name manquant`);
        const last = i === items.length - 1;
        if (!last && !isAbsUrl(it.item)) out.push(`${path}[${i}] : item doit être une URL absolue`);
        if (it.item !== undefined && !isAbsUrl(it.item))
          out.push(`${path}[${i}] : item doit être une URL absolue`);
      });
      break;
    }
    case 'EducationalOccupationalProgram':
      need('name', isText, 'manquant');
      need('url', isAbsUrl, 'doit être une URL absolue');
      if (!isObj(n.provider) || n.provider['@type'] !== 'CollegeOrUniversity')
        out.push(`${path} : provider doit être un CollegeOrUniversity`);
      if (n.aggregateRating !== undefined && !REVIEW_SNIPPET_TYPES.has(type))
        out.push(`${path} : aggregateRating sur un type non éligible aux extraits d’avis`);
      if (n.timeToComplete !== undefined && !/^P\d+[YMWD]$/.test(String(n.timeToComplete)))
        out.push(`${path} : timeToComplete doit être une durée ISO 8601 (P2Y)`);
      if (n.numberOfCredits !== undefined && !Number.isInteger(n.numberOfCredits))
        out.push(`${path} : numberOfCredits doit être un entier`);
      break;
    case 'AggregateRating': {
      const v = Number(n.ratingValue);
      if (!(v >= 1 && v <= 5)) out.push(`${path} : ratingValue hors de 1–5`);
      if (!(Number(n.ratingCount ?? n.reviewCount) > 0))
        out.push(`${path} : ratingCount ou reviewCount manquant`);
      break;
    }
  }
}

/** Errors of one JSON-LD block (empty: valid). */
export function checkJsonLd(block: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(block)) block.forEach((b, i) => walk(b, `$[${i}]`, out, true));
  else if (isObj(block) && Array.isArray(block['@graph'])) {
    if (block['@context'] !== 'https://schema.org')
      out.push('$ : @context doit valoir https://schema.org');
    (block['@graph'] as unknown[]).forEach((b, i) => walk(b, `$.@graph[${i}]`, out, false));
  } else walk(block, '$', out, true);
  return out;
}

/** Every @type of a block, nested ones included. */
export function typesOf(block: unknown): string[] {
  const out = new Set<string>();
  const go = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(go);
    if (!isObj(n)) return;
    if (typeof n['@type'] === 'string') out.add(n['@type']);
    Object.entries(n).forEach(([k, v]) => k !== '@type' && go(v));
  };
  go(block);
  return [...out];
}

/** Names of the BreadcrumbList of a block, if any (compared with the visible breadcrumb). */
export function breadcrumbNames(block: unknown): string[] | null {
  let found: string[] | null = null;
  const go = (n: unknown) => {
    if (found) return;
    if (Array.isArray(n)) return n.forEach(go);
    if (!isObj(n)) return;
    if (n['@type'] === 'BreadcrumbList' && Array.isArray(n.itemListElement)) {
      found = (n.itemListElement as Obj[]).map((i) => String(i.name ?? ''));
      return;
    }
    Object.values(n).forEach(go);
  };
  go(block);
  return found;
}
