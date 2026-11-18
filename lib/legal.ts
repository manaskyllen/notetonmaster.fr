import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';
import { brandHtml } from '@/components/ui/BrandName';
import { contactEmail } from '@/lib/contact';

export const LEGAL_DOCS = [
  { slug: 'charte', label: 'Charte de modération' },
  { slug: 'mentions-legales', label: 'Mentions légales' },
  { slug: 'cgu', label: 'Conditions d’utilisation' },
  { slug: 'confidentialite', label: 'Confidentialité' },
] as const;

export type LegalSlug = (typeof LEGAL_DOCS)[number]['slug'];

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Reads content/legal/<slug>.md. Front matter: title, updated. Raw HTML in the source is escaped;
 * "[À compléter …]" placeholders are rendered as highlighted <mark>. {{CONTACT_EMAIL}} is the
 * team's address (CONTACT_EMAIL, lib/contact.ts), read at request time.
 */
export async function readLegalDoc(slug: LegalSlug) {
  const raw = await readFile(join(process.cwd(), 'content/legal', `${slug}.md`), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const meta = Object.fromEntries(
    (fm?.[1] ?? '').split('\n').map((l) => l.split(/:\s*/, 2) as [string, string]),
  );
  const body = (fm ? raw.slice(fm[0].length) : raw).replaceAll('{{CONTACT_EMAIL}}', contactEmail());
  let html = await marked.parse(escapeHtml(body).replace(/&quot;/g, '"'), { async: true });
  html = html.replace(/\[(À compléter[^\]]*)\]/g, '<mark class="todo">[$1]</mark>');
  // the name written like the logo, in the text only (not in the addresses)
  html = brandHtml(html);
  return { title: meta.title ?? slug, updated: meta.updated ? new Date(meta.updated) : null, html };
}
