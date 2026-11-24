import { fold, META_MAX, META_MIN, MIN_INTERNAL_LINKS, MIN_WORDS, TITLE_MAX } from './model';
import type { RenderResult } from './render';

/**
 * SEO checklist of the editor (score out of 7) and the rules of the publication. The keyword
 * matches when each of its words is there, accents, case and plurals aside (« master sélectif
 * Nantes » is in « Les masters les plus sélectifs de Nantes »).
 */

const STOP = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'a',
  'au',
  'aux',
  'en',
  'et',
  'd',
  'l',
]);
const stem = (w: string) => w.replace(/(s|x)$/, '');
const words = (s: string) =>
  fold(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem);

export function hasKeyword(text: string, keyword: string): boolean {
  const k = words(keyword);
  if (!k.length) return false;
  const t = new Set(words(text));
  return k.every((w) => t.has(w));
}

export interface CheckItem {
  id: string;
  label: string;
  ok: boolean;
}

export function seoChecklist(
  a: { title: string; lede: string; metaDescription: string; keyword: string },
  r: Pick<RenderResult, 'toc' | 'internalLinks' | 'hasFaq' | 'words'>,
): CheckItem[] {
  const kw = a.keyword.trim();
  const meta = a.metaDescription.trim().length;
  return [
    { id: 'kw-title', label: 'Mot-clé dans le titre', ok: !!kw && hasKeyword(a.title, kw) },
    { id: 'kw-lede', label: 'Mot-clé dans le chapô', ok: !!kw && hasKeyword(a.lede, kw) },
    {
      id: 'kw-h2',
      label: 'Mot-clé dans au moins un intertitre (H2)',
      ok: !!kw && r.toc.some((h) => hasKeyword(h.text, kw)),
    },
    {
      id: 'meta',
      label: `Meta description entre ${META_MIN} et ${META_MAX} caractères`,
      ok: meta >= META_MIN && meta <= META_MAX,
    },
    {
      id: 'links',
      label: `${r.internalLinks} lien${r.internalLinks > 1 ? 's' : ''} interne${r.internalLinks > 1 ? 's' : ''} (${MIN_INTERNAL_LINKS} minimum)`,
      ok: r.internalLinks >= MIN_INTERNAL_LINKS,
    },
    { id: 'faq', label: 'Une section « Questions fréquentes »', ok: r.hasFaq },
    {
      id: 'words',
      label: `Environ ${Math.round(r.words / 10) * 10} mots (${MIN_WORDS} minimum)`,
      ok: r.words >= MIN_WORDS,
    },
  ];
}

/**
 * Why a guide cannot be published, or an empty list: unknown tokens and blocks, broken links,
 * a city that is not open, missing title, slug, chapô or description, a title too long.
 */
export function publishBlockers(
  a: { title: string; lede: string; metaDescription: string; city: string | null; body: string },
  r: Pick<RenderResult, 'issues'>,
  openCities: Set<string>,
): string[] {
  const out: string[] = [];
  if (!a.title.trim()) out.push('Le titre est vide.');
  else if (a.title.trim().length > TITLE_MAX) out.push(`Le titre dépasse ${TITLE_MAX} caractères.`);
  if (!a.lede.trim()) out.push('Le chapô est vide.');
  if (!a.metaDescription.trim()) out.push('La meta description est vide.');
  if (!a.body.trim()) out.push('Le texte est vide.');
  if (a.city && !openCities.has(a.city)) out.push('La ville de l’article n’est pas ouverte.');
  for (const i of r.issues)
    out.push(
      i.kind === 'token'
        ? i.message.startsWith('pas de valeur')
          ? `Jeton sans valeur : ${i.source}`
          : `Jeton inconnu : ${i.source}`
        : i.kind === 'block'
          ? `Bloc refusé (${i.message}) : ${i.source}`
          : `Lien refusé (${i.message})`,
    );
  return [...new Set(out)];
}
