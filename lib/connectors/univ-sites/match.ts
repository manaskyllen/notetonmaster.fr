/**
 * Page ↔ parcours matching for the university sites (lot 3). Mon Master gives no link to the
 * program pages, so a page is matched by what it says, in this order:
 * 1. a Mon Master number cited in the page (→ that program), or an RNCP code (→ the mention:
 *    enough when the mention has a single parcours in this establishment);
 * 2. mention + parcours read in the breadcrumb or the title (« MASTER … MENTION X PARCOURS Y »,
 *    parent title of Ametys), parcours score ≥ 0.90 within the right mention;
 * 3. establishment + city + normalised title, score ≥ 0.90.
 * Between 0.75 and 0.90: a proposal for « Rapprochements à valider ». Below: nothing.
 * A mention page that lists several parcours is matched to the mention: it only fills the common
 * fields (objectives, skills), never the units of a parcours. Pure functions, unit-tested.
 */
import {
  normCity,
  normMention,
  normProgramTitle,
  similarity,
  titleScore,
} from '@/lib/data/normalize';

export const AUTO = 0.9;
export const PROPOSE = 0.75;

const NOT_A_FICHE =
  /^(stages?\b|offres? de stage|l.?insertion professionnelle|enqu[êe]tes?\b|arr[êe]t[ée]\b|d[ée]cision\b|fiches? synth[ée]tiques?|masters? du domaine|recherche(z)?\b|des dipl[ôo]m[ée]s)/i;

export interface Candidate {
  id: string;
  title: string;
  city: string;
  mentionId: string;
  mentionName: string;
  /** RNCP code of the mention (« RNCP42684 »). */
  rncp: string | null;
  ifcs: string[];
}

export interface PageClues {
  title: string;
  mentionHint: string;
  rncp: string[];
  ifc: string[];
  cities: string[];
  level: 'PARCOURS' | 'MENTION' | null;
}

export type PageMatch =
  | {
      status: 'LINKED';
      level: 'PARCOURS';
      programIds: string[];
      mentionId: string;
      score: number;
      reason: string;
    }
  | {
      status: 'LINKED';
      level: 'MENTION';
      programIds: [];
      mentionId: string;
      score: number;
      reason: string;
    }
  | {
      status: 'PROPOSED';
      level: 'PARCOURS';
      programIds: string[];
      mentionId: string;
      score: number;
      reason: string;
    }
  | { status: 'NEW'; level: null; programIds: []; mentionId: null; score: number; reason: string };

/** « MASTER X MENTION Y PARCOURS Z », « Master Y - Parcours Z », « Master Y parcours Z (M1) ». */
export function splitTitle(
  title: string,
  mentionHint = '',
): { mention: string; parcours: string; year: 1 | 2 | null } {
  let t = title.replace(/\s+/g, ' ').trim();
  const yearM = /\b(?:M|Master\s*)([12])\b(?!\s*[-–]?\s*\d)/i.exec(t);
  const year = yearM ? (Number(yearM[1]) as 1 | 2) : null;
  t = t
    .replace(/\(\s*M[12](?:\s*[-/]\s*M[12])?\s*\)/gi, ' ')
    .replace(/\bM[12](?:\s*[-/]\s*M[12])?\b/g, ' ');
  let mention = '';
  let parcours = '';
  const k = /\bmention\b(.*?)\bparcours\b(.*)$/i.exec(t);
  if (k) {
    mention = k[1]!;
    parcours = k[2]!;
  } else {
    const p = /^(.*?)\s*(?:[-–:,]\s*)?\b(?:parcours(?:[-\s]?types?)?|parc\.)\s*:?\s*(.+)$/i.exec(t);
    if (p) {
      mention = p[1]!;
      parcours = p[2]!;
    } else {
      const m = /\bmention\b\s*:?\s*(.+)$/i.exec(t);
      if (m) mention = m[1]!;
      else parcours = t;
    }
  }
  if (!mention && mentionHint) mention = mentionHint.split('›').pop() ?? '';
  const clean = (s: string) =>
    s
      .replace(/^\s*(?:(?:master|mention|diplôme national de master)\b\s*:?\s*)+/i, '')
      .replace(/\bmention\b\s*:?/gi, ' ')
      .replace(/\s*[-–:]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  return { mention: clean(mention), parcours: clean(parcours), year };
}

const mentionKey = (s: string) => normMention(s.replace(/^.*\bmention\b/i, ''));

/**
 * Title score for the automatic link: a title merely contained in the other (« Génétique et
 * génomique » in « Génétique, génomique et biologie des systèmes ») never reaches it (decision of
 * the Mon Master matching): capped just below, it becomes a proposal.
 */
export function linkScore(a: string, b: string): number {
  const s = titleScore(a, b);
  return s >= AUTO && similarity(a, b) < AUTO ? AUTO - 0.01 : s;
}

/** How well a page mention matches a candidate mention (1 when the RNCP code is cited). */
function mentionScore(page: PageClues, mentionText: string, c: Candidate): number {
  if (c.rncp && page.rncp.includes(c.rncp)) return 1;
  if (!mentionText) return 0;
  return titleScore(mentionKey(mentionText), mentionKey(c.mentionName));
}

function citySays(page: PageClues, c: Candidate): boolean {
  return page.cities.some((x) => normCity(x) === normCity(c.city));
}

/**
 * Programs sharing the best title in the same city: the work-study and on-site versions of a
 * parcours are two programs, one page describes both.
 */
function sameParcours(best: Candidate, all: Candidate[]): string[] {
  const key = normProgramTitle(best.title);
  return all
    .filter(
      (c) =>
        c.mentionId === best.mentionId &&
        normProgramTitle(c.title) === key &&
        normCity(c.city) === normCity(best.city),
    )
    .map((c) => c.id);
}

export function matchPage(page: PageClues, candidates: Candidate[]): PageMatch {
  const none = (reason: string, score = 0): PageMatch => ({
    status: 'NEW',
    level: null,
    programIds: [],
    mentionId: null,
    score,
    reason,
  });
  if (!candidates.length) return none('aucun parcours connu pour cet établissement');
  // Pages about a master without being its fiche: internships, surveys, decisions, lists
  if (NOT_A_FICHE.test(page.title.trim()))
    return none('page sans fiche de parcours (stage, enquête, acte, liste)');

  // 1. Mon Master number
  const byIfc = candidates.find((c) => c.ifcs.some((i) => page.ifc.includes(i)));
  if (byIfc)
    return {
      status: 'LINKED',
      level: 'PARCOURS',
      programIds: sameParcours(byIfc, candidates),
      mentionId: byIfc.mentionId,
      score: 1,
      reason: 'numéro Mon Master cité dans la page',
    };

  const { mention, parcours } = splitTitle(page.title, page.mentionHint);
  const mentionsWithRncp = new Set(
    candidates.filter((c) => c.rncp && page.rncp.includes(c.rncp)).map((c) => c.mentionId),
  );

  // 2–3. scores
  const scored = candidates
    .map((c) => {
      const ms = mentionScore(page, mention, c);
      const target = normProgramTitle(c.title);
      const ps = Math.max(
        parcours ? linkScore(normProgramTitle(parcours), target) : 0,
        linkScore(normProgramTitle(page.title), target),
      );
      return { c, ms, ps, city: citySays(page, c) };
    })
    .sort((a, b) => b.ps - a.ps || b.ms - a.ms);

  const best = scored[0]!;
  const rivals = scored.filter(
    (s) =>
      s.ps >= best.ps - 0.02 &&
      s.c.mentionId === best.c.mentionId &&
      normProgramTitle(s.c.title) !== normProgramTitle(best.c.title),
  );
  const ambiguous = rivals.length > 0;

  // 2. mention + parcours read in the page
  if (parcours && best.ms >= 0.85 && best.ps >= AUTO && !ambiguous)
    return {
      status: 'LINKED',
      level: 'PARCOURS',
      programIds: sameParcours(best.c, candidates),
      mentionId: best.c.mentionId,
      score: best.ps,
      reason: `mention et parcours lus dans ${page.mentionHint ? 'le fil d’Ariane' : 'le titre'} (${best.ps.toFixed(2)})`,
    };

  // 3. establishment + city + normalised title
  if (best.ps >= AUTO && !ambiguous) {
    const homonyms = scored.filter(
      (s) =>
        s.ps >= AUTO &&
        normProgramTitle(s.c.title) === normProgramTitle(best.c.title) &&
        s.c.mentionId !== best.c.mentionId,
    );
    const cityOk =
      best.city ||
      new Set(scored.filter((s) => s.ps >= AUTO).map((s) => normCity(s.c.city))).size === 1;
    if (cityOk && !homonyms.length)
      return {
        status: 'LINKED',
        level: 'PARCOURS',
        programIds: sameParcours(best.c, candidates),
        mentionId: best.c.mentionId,
        score: best.ps,
        reason: `établissement, ville et intitulé (${best.ps.toFixed(2)})`,
      };
  }

  // A mention page: its title (or RNCP code) is a mention of this establishment, with no parcours named.
  const mentionTitle = mention || (!parcours ? '' : parcours);
  const mentionIds = [...new Set(candidates.map((c) => c.mentionId))];
  const mentionBest = mentionIds
    .map((id) => {
      const c = candidates.find((x) => x.mentionId === id)!;
      const s = mentionsWithRncp.has(id)
        ? 1
        : titleScore(mentionKey(mentionTitle || page.title), mentionKey(c.mentionName));
      return { id, s, programs: candidates.filter((x) => x.mentionId === id) };
    })
    .sort((a, b) => b.s - a.s)[0]!;
  const titleIsMention =
    !parcours ||
    titleScore(mentionKey(parcours), mentionKey(mentionBest.programs[0]!.mentionName)) >= AUTO;
  if (page.level !== 'PARCOURS' && titleIsMention && mentionBest.s >= AUTO) {
    if (mentionBest.programs.length === 1) {
      const only = mentionBest.programs[0]!;
      return {
        status: 'LINKED',
        level: 'PARCOURS',
        programIds: [only.id],
        mentionId: only.mentionId,
        score: mentionBest.s,
        reason: 'page de la mention, seul parcours de l’établissement',
      };
    }
    const distinct = new Set(mentionBest.programs.map((p) => normProgramTitle(p.title)));
    if (distinct.size === 1)
      return {
        status: 'LINKED',
        level: 'PARCOURS',
        programIds: mentionBest.programs.map((p) => p.id),
        mentionId: mentionBest.id,
        score: mentionBest.s,
        reason: 'page de la mention, un seul parcours (plusieurs modalités)',
      };
    return {
      status: 'LINKED',
      level: 'MENTION',
      programIds: [],
      mentionId: mentionBest.id,
      score: mentionBest.s,
      reason: `page de la mention (${mentionBest.programs.length} parcours) : champs communs seulement`,
    };
  }

  if (best.ps >= PROPOSE)
    return {
      status: 'PROPOSED',
      level: 'PARCOURS',
      programIds: [best.c.id],
      mentionId: best.c.mentionId,
      score: best.ps,
      reason: ambiguous
        ? `plusieurs parcours proches (${best.ps.toFixed(2)})`
        : best.ps >= AUTO
          ? `intitulé sûr mais ville ou mention à confirmer (${best.ps.toFixed(2)})`
          : `intitulé proche (${best.ps.toFixed(2)})`,
    };
  return none(`aucun parcours assez proche (meilleur score ${best.ps.toFixed(2)})`, best.ps);
}
