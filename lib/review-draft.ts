/**
 * Draft of « Donner mon avis ». Pure browser module.
 *
 * - Key `avis:<owner>:<parcours>`: the owner is the account (`c-…`, a keyed hash of its id given
 *   by the server) or, without account, an id drawn for this tab (`s-…`, sessionStorage): a draft
 *   is never shared between two people on the same browser.
 * - Value versioned (`v: 2`): anything else is ignored and removed.
 * - Fields only, plus the step (restored at its start, never on the confirmation screen).
 * - 24 hours; removed after a successful submission, at logout and when the account changes
 *   (DraftJanitor).
 */
export const DRAFT_VERSION = 2;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'avis:';
const SESSION_KEY = 'avis-session';
const OWNER_KEY = 'avis-owner';
/** Before v2: one key per tab, restored whatever the master. */
const LEGACY_KEYS = ['nm-review-draft'];

export interface StoredDraft<F> {
  v: typeof DRAFT_VERSION;
  owner: string;
  /** Slug of the parcours (or « _ » before one is chosen). */
  program: string;
  /** The parcours as shown in the master field, to restore it without a request. */
  option: { slug: string; title: string; subtitle: string } | null;
  step: 1 | 2 | 3;
  savedAt: number;
  fields: F;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The tab's own id when there is no account. */
export function anonymousOwner(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      // getRandomValues works outside HTTPS too (randomUUID does not).
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = `s-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // No sessionStorage: an id for this page only, never a shared one.
    return `s-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }
}

export const draftKey = (owner: string, program: string) => `${PREFIX}${owner}:${program || '_'}`;

/** Valid drafts of `owner`, most recent first; expired or old-version ones are removed. */
export function readDrafts<F>(owner: string, now = Date.now()): StoredDraft<F>[] {
  const s = storage();
  if (!s) return [];
  for (const k of LEGACY_KEYS) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  const out: StoredDraft<F>[] = [];
  for (const key of Object.keys(s)) {
    if (!key.startsWith(PREFIX)) continue;
    let d: StoredDraft<F> | null = null;
    try {
      d = JSON.parse(s.getItem(key) ?? 'null') as StoredDraft<F>;
    } catch {
      /* broken: removed below */
    }
    const valid =
      d &&
      d.v === DRAFT_VERSION &&
      typeof d.savedAt === 'number' &&
      now - d.savedAt < DRAFT_TTL_MS &&
      key === draftKey(d.owner, d.program);
    if (!valid) {
      s.removeItem(key);
      continue;
    }
    if (d!.owner === owner) out.push(d!);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function writeDraft<F>(d: Omit<StoredDraft<F>, 'v' | 'savedAt'>) {
  try {
    storage()?.setItem(
      draftKey(d.owner, d.program),
      JSON.stringify({ ...d, v: DRAFT_VERSION, savedAt: Date.now() }),
    );
  } catch {
    /* full or blocked: the form still works */
  }
}

export function removeDraft(owner: string, program: string) {
  try {
    storage()?.removeItem(draftKey(owner, program));
  } catch {
    /* ignore */
  }
}

/** Every draft of this browser. */
export function purgeDrafts() {
  const s = storage();
  if (!s) return;
  for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key);
}

/**
 * Called on every page with the current account (`c-…`) or `anon`: a logout or a change of
 * account removes the drafts left by the previous account.
 */
export function checkDraftOwner(current: string) {
  const s = storage();
  if (!s) return;
  let previous: string | null = null;
  try {
    previous = s.getItem(OWNER_KEY);
    if (previous && previous.startsWith('c-') && previous !== current) purgeDrafts();
    if (previous !== current) s.setItem(OWNER_KEY, current);
  } catch {
    /* ignore */
  }
}
