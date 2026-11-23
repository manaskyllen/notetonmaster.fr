/**
 * « Ton master en une phrase » (issue #20): the title of a review, written by the student and
 * never generated. Shown between French quotes added on display (« … »), so the quotes the
 * student typed are removed. Pure rules, tested.
 */
export const TITLE_MIN = 5;
export const TITLE_MAX = 80;
export const TITLE_LABEL = 'Ton master en une phrase';
export const TITLE_PLACEHOLDER = 'Ex. Le terrain avant tout';
export const TITLE_HELP = 'Ce sera le titre de ton avis.';

/** Double quotes of any kind, wherever they are: the display adds its own « ». */
const DOUBLE_QUOTES = /[«»“”„‟"‹›]/g;
/** Single quotes only at the ends: inside, they are apostrophes (« l'art »). */
const EDGE_SINGLE = /^['‘’‚`]+|['‘’‚`]+$/g;

/** One line, no quotes typed around it, single spaces. */
export function cleanTitle(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(DOUBLE_QUOTES, ' ');
  // Quotes then spaces then quotes again (« ' Le terrain ' »): until nothing changes.
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(/\s+/g, ' ').trim().replace(EDGE_SINGLE, '');
  }
  return s;
}

/** A link or a web address: refused in a title (bounded patterns, linear on hostile input). */
const LINK =
  /(?:https?:\/\/|www\.)\S|(?<![\w@.-])[a-z0-9-]{1,63}\.(?:fr|com|net|org|io|me|app|gg|be|eu|info|co|ly|tv)(?![\w-])/i;
export const titleHasLink = (s: string) => LINK.test(s);

/** Characters left, or still needed, once cleaned (« Encore 3 caractères au moins »). */
export function titleHint(raw: string): { text: string; tone: 'ok' | 'muted' } {
  const n = cleanTitle(raw).length;
  if (n < TITLE_MIN)
    return {
      text: `${TITLE_HELP} Encore ${TITLE_MIN - n} caractère${TITLE_MIN - n > 1 ? 's' : ''} au moins`,
      tone: 'muted',
    };
  const left = TITLE_MAX - n;
  return {
    text: `${TITLE_HELP} ${left} caractère${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`,
    tone: 'ok',
  };
}
