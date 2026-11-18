import { Fragment, type ReactNode } from 'react';

export type BrandSize = 'sm' | 'lg';

/**
 * The name « notetonmaster » written like the logo (`.brand` / `.brand-s`): « note », a
 * thin space, « ton », then « master » on lime.
 * - `lg`, titles and text of 20px or more: « master » in a lime block tilted −3°, in the font of
 *   the title;
 * - `sm`, running text and small lines: « note ton » bold, « master » in a small lime block
 *   tilted −3°, like `lg`.
 * The gaps are margins, never real spaces: the DOM text stays « notetonmaster », read and
 * indexed as one word, and the name never wraps (`white-space: nowrap`).
 * Not for `<title>`, metadata, `alt`, `aria-label`, addresses or plain-text mails: there the
 * name stays « notetonmaster ».
 */
export function BrandName({ size = 'sm', className }: { size?: BrandSize; className?: string }) {
  return (
    <span className={`${size === 'lg' ? 'brand' : 'brand-s'}${className ? ` ${className}` : ''}`}>
      note<span className="brand__g">ton</span>
      <span className="brand__m">master</span>
    </span>
  );
}

/**
 * The name as a word of a sentence: not part of an address (`juridique@notetonmaster.example`),
 * a domain or an identifier (`notetonmasterBot`).
 */
export const BRAND_IN_TEXT = /(?<![\w@./-])notetonmaster(?![\w@-]|\.[a-z])/g;

/**
 * A sentence that may name the site (an error message, a source, a setting) with the name
 * written by BrandName: « Ce master n'est pas encore sur notetonmaster » → text + <BrandName/>.
 */
export function withBrand(text: string, size: BrandSize = 'sm'): ReactNode {
  const parts = text.split(BRAND_IN_TEXT);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && <BrandName size={size} />}
    </Fragment>
  ));
}

/** The same in HTML (legal pages rendered from Markdown): only in text, never inside a tag. */
export function brandHtml(html: string, size: BrandSize = 'sm'): string {
  const tag = `<span class="${size === 'lg' ? 'brand' : 'brand-s'}">note<span class="brand__g">ton</span><span class="brand__m">master</span></span>`;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(BRAND_IN_TEXT, tag)))
    .join('');
}
