/**
 * The text of a guide, rendered on the server by lib/articles/render.ts (the site, and the
 * « Relecture » and « Aperçu » tabs of the editor). The only place its HTML is inserted.
 */
export function ArticleHtml({
  html,
  className,
  ...rest
}: { html: string; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    // html-safe: built by lib/articles/render.ts: raw HTML and images of the Markdown escaped,
    // links checked (internal paths, http(s) with noopener), every value of the database escaped.
    <div {...rest} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
