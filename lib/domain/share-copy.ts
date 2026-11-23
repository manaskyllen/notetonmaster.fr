/**
 * Every text of « Partager » (issue #13, mockup design-reference/mockups/PartageFiche.dc.html):
 * the two tabs, the message of each, the titles of the native share, the QR code and the card of
 * the confirmation screen. Pure functions, tested in tests/unit/share.test.ts.
 */

export type ShareTab = 'decouvrir' | 'promo';
/** Where the panel is opened: the fiche, or the confirmation screen of a review just sent. */
export type ShareContext = 'fiche' | 'after';

export interface ShareFacts {
  /** Name of the parcours (without « Master »). */
  parcours: string;
  /** Establishment (short name when it has one). */
  university: string;
  city: string;
  /** Published reviews of the parcours. */
  reviewCount: number;
}

export const SHARE_TITLE = 'Partager';
export const SHARE_TABS: { id: ShareTab; label: string }[] = [
  { id: 'decouvrir', label: 'Le master' },
  { id: 'promo', label: 'Inviter ma promo' },
];
export const DEFAULT_TAB: ShareTab = 'promo';

export const LABELS = {
  tablist: 'Que veux-tu partager ?',
  copyMessage: 'Copier le message',
  messageCopied: 'Message copié',
  /** The same, on a phone (second row, next to « QR code »). */
  copyShort: 'Copier',
  copiedShort: 'Copié',
  copyLink: 'Copier le lien',
  linkCopied: 'Lien copié',
  nativeShare: 'Partager…',
  whatsapp: 'WhatsApp',
  qr: 'QR code',
  close: 'Fermer',
} as const;

/** The ready-to-send message (the link is added after it). */
export function shareMessage(
  tab: ShareTab,
  f: ShareFacts,
  context: ShareContext = 'fiche',
): string {
  if (tab === 'decouvrir')
    return `Regarde ce master : ${f.parcours} à ${f.city}, avec les chiffres d’admission et des avis d’étudiant·es →`;
  return context === 'after'
    ? 'Hello la promo ! Je viens de donner mon avis sur notre master. C’est anonyme et ça prend 5 minutes. Ça aide vraiment celles et ceux qui candidatent l’an prochain. À vous →'
    : 'Hello la promo ! On peut donner un avis anonyme sur notre master en 5 minutes. Ça aide celles et ceux qui candidatent l’an prochain →';
}

/** Title of the native share sheet. */
export function shareTitle(tab: ShareTab, f: Pick<ShareFacts, 'parcours' | 'university'>) {
  return tab === 'decouvrir'
    ? `${f.parcours} — ${f.university}, sur notetonmaster`
    : reviewFormTitle(f.parcours);
}

/** Title of the review form set on a parcours (page title, link previews, native share). */
export const reviewFormTitle = (parcours: string) => `Donne ton avis sur ${parcours}`;

export const QR_COPY: Record<ShareTab, { text: string; label: string }> = {
  promo: {
    text: 'À montrer en cours : chacun scanne et arrive sur le formulaire de ce master.',
    label: 'QR code vers le formulaire d’avis de ce master',
  },
  decouvrir: {
    text: 'À scanner pour ouvrir la fiche du master.',
    label: 'QR code vers la fiche de ce master',
  },
};

/**
 * The invitation of the confirmation screen of a review: the published reviews in a sticker, a
 * title, a line under it (not from 20 reviews) and one button, « Inviter ma promo ».
 */
export const INVITE_BUTTON = 'Inviter ma promo';
export function promoInvite(n: number): { title: string; line: string | null } {
  const line = 'Invite ta promo à donner son avis : chaque avis rend la note plus juste.';
  if (n >= 20) return { title: 'Invite ta promo à donner son avis.', line: null };
  return {
    title: n <= 0 ? 'Ce master n’a pas encore d’avis.' : `Ce master n’a que ${n} avis.`,
    line,
  };
}
/** The number in the sticker: the published reviews of the parcours. */
export const stickerCount = (n: number) => String(Math.max(0, n));
