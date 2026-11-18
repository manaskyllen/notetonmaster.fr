/**
 * Debounced updates of the address from a search field (Explorer, admin lists), in the browser.
 *
 * A search field waits a little before it writes `?q=` (one navigation per pause, not per key).
 * Two rules keep that wait from undoing another change made in the meantime (a tab, a filter, a
 * sort): the update starts from the parameters of the address when it runs, never from those of
 * the render that scheduled it; and any other navigation cancels the update still waiting.
 * One pending update per page: there is one search field at a time.
 */
let timer: ReturnType<typeof setTimeout> | undefined;
let detach: (() => void) | undefined;

/** Parameters of the address now (not those of the last render). */
export function liveParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/** Drops the update still waiting, if any. Called by every other navigation of the page. */
export function cancelUrlUpdate() {
  clearTimeout(timer);
  timer = undefined;
  detach?.();
  detach = undefined;
}

/**
 * Runs `update` after `ms` of quiet, unless another navigation comes first: a call of
 * `cancelUrlUpdate`, a click on a link or a tab, or the browser's back and forward buttons.
 */
export function scheduleUrlUpdate(update: () => void, ms: number) {
  cancelUrlUpdate();
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest?.('a[href], [role="tab"]')) cancelUrlUpdate();
  };
  const onPop = () => cancelUrlUpdate();
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPop);
  detach = () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', onPop);
  };
  const pathname = window.location.pathname;
  timer = setTimeout(() => {
    cancelUrlUpdate();
    // Another page by now: the update belonged to the previous one.
    if (window.location.pathname === pathname) update();
  }, ms);
}

/** `pathname?params` with `set` applied (null removes a parameter) and `page` dropped. */
export function hrefFrom(
  pathname: string,
  base: URLSearchParams,
  set: Record<string, string | null>,
  keepPage = false,
): string {
  const p = new URLSearchParams(base);
  for (const [k, v] of Object.entries(set)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  if (!keepPage) p.delete('page');
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
