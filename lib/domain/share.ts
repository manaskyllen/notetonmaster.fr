/**
 * Sharing a fiche parcours (issue #13): the fiche itself, or its review form already set on the
 * parcours. Plain addresses only: no `utm_*`, no `?source=`, nothing about the person who shares.
 * The texts are in ./share-copy.ts.
 */
import type { ShareFacts, ShareTab } from './share-copy';

export { reviewFormTitle } from './share-copy';

/** What the panel needs, computed by the server (the fiche, the confirmation of a review). */
export interface ShareData extends ShareFacts {
  links: Record<ShareTab, string>;
}

/** The canonical address of a fiche, and its review form set on the parcours. */
export function ficheUrl(origin: string, slug: string): string {
  return `${origin}/parcours/${encodeURIComponent(slug)}`;
}
export function reviewFormUrl(origin: string, slug: string): string {
  return `${origin}/avis/nouveau?parcours=${encodeURIComponent(slug)}`;
}

/** The message, a space, then the link: what is copied and sent by WhatsApp. */
export function shareText(message: string, url: string): string {
  const m = message.trim();
  return m ? `${m} ${url}` : url;
}

export function whatsappUrl(message: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(message, url))}`;
}
