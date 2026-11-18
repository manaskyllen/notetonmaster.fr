/**
 * Contact details are replaced on the server before a message (or a public text) is stored:
 * mail addresses, phone numbers (French and international), links to social networks and
 * messaging apps, @handles.
 *
 * Every pattern has bounded repetitions and a left boundary, so matching stays linear on hostile
 * input (no ReDoS): the old `[^\s@]+@[^\s@]+\.` took seconds on 100 000 characters.
 */
export const MASK = '[coordonnées masquées]';

const SOCIAL_HOSTS = [
  'instagram\\.com',
  'instagr\\.am',
  'linkedin\\.com',
  'lnkd\\.in',
  'snapchat\\.com',
  'facebook\\.com',
  'fb\\.com',
  'fb\\.me',
  'messenger\\.com',
  'm\\.me',
  'tiktok\\.com',
  'twitter\\.com',
  'x\\.com',
  'threads\\.net',
  'bsky\\.app',
  't\\.me',
  'telegram\\.me',
  'wa\\.me',
  'whatsapp\\.com',
  'chat\\.whatsapp\\.com',
  'discord\\.gg',
  'discord\\.com',
  'signal\\.me',
  'youtube\\.com',
  'twitch\\.tv',
  'calendly\\.com',
].join('|');

const PATTERNS: RegExp[] = [
  // Mail addresses (local part, domain labels and TLD all bounded).
  /(?<![\w.+-])[\w.+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}/gi,
  // Social networks and messaging apps, with or without scheme and subdomain.
  new RegExp(
    `(?<![\\w.-])(?:https?:\\/\\/)?(?:[a-z0-9-]{1,63}\\.){0,2}(?:${SOCIAL_HOSTS})(?:\\/[^\\s]{0,200})?(?![\\w.-])`,
    'gi',
  ),
  // @handles (Instagram, X, TikTok…): 3 to 30 characters after a lone @.
  /(?<![\w.@])@[a-z0-9_](?:[a-z0-9_.]{1,28}[a-z0-9_])/gi,
  // French numbers: 06 12 34 56 78, +33 6 12 34 56 78, 0033…
  /(?<![\d+])(?:\+33|0033|0)[ .-]?[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,
  // International numbers: + then 7 to 15 digits, with spaces, dots or dashes.
  /(?<![\d+])\+\d{1,3}(?:[ .-]?\d){6,14}(?!\d)/g,
];

export function maskContacts(text: string): { text: string; masked: boolean } {
  let masked = false;
  let out = text;
  for (const re of PATTERNS)
    out = out.replace(new RegExp(re.source, re.flags), () => {
      masked = true;
      return MASK;
    });
  return { text: out, masked };
}

export function containsContacts(text: string): boolean {
  return PATTERNS.some((re) => new RegExp(re.source, re.flags.replace('g', '')).test(text));
}
