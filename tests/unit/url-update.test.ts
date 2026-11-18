import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelUrlUpdate, hrefFrom, liveParams, scheduleUrlUpdate } from '@/lib/url-update';

/** The address bar and the click listeners of a page, without a browser. */
function fakePage(href: string) {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const on = (t: string, f: (e: unknown) => void) => {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(f);
  };
  const off = (t: string, f: (e: unknown) => void) => listeners.get(t)?.delete(f);
  const location = new URL(href);
  vi.stubGlobal('window', { location, addEventListener: on, removeEventListener: off });
  vi.stubGlobal('document', { addEventListener: on, removeEventListener: off });
  return {
    location,
    navigate: (to: string) => {
      const u = new URL(to, location);
      location.pathname = u.pathname;
      location.search = u.search;
    },
    click: (closest: string | null) =>
      listeners.get('click')?.forEach((f) => f({ target: { closest: () => closest } })),
    listening: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('debounced address updates (lib/url-update)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cancelUrlUpdate();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts from the address when it runs, not when it was scheduled', () => {
    const page = fakePage('http://x/admin/recuperation?onglet=etablissements');
    const run = vi.fn(() => hrefFrom(window.location.pathname, liveParams(), { q: 'nantes' }));
    scheduleUrlUpdate(run, 200);
    page.navigate('/admin/recuperation?onglet=etablissements&toutes=1');
    vi.advanceTimersByTime(200);
    expect(run).toHaveReturnedWith('/admin/recuperation?onglet=etablissements&toutes=1&q=nantes');
  });

  it('is cancelled by a click on a tab or a link, and by cancelUrlUpdate', () => {
    const page = fakePage('http://x/admin/recuperation?onglet=etablissements');
    const run = vi.fn();
    scheduleUrlUpdate(run, 200);
    page.click('[role="tab"]');
    scheduleUrlUpdate(run, 200);
    page.click('a[href]');
    scheduleUrlUpdate(run, 200);
    cancelUrlUpdate();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    expect(page.listening()).toBe(0);
  });

  it('a click elsewhere keeps it; a new keystroke replaces it', () => {
    const page = fakePage('http://x/explorer');
    const first = vi.fn();
    const second = vi.fn();
    scheduleUrlUpdate(first, 120);
    page.click(null);
    vi.advanceTimersByTime(100);
    scheduleUrlUpdate(second, 120);
    vi.advanceTimersByTime(120);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('is dropped when the page changed during the wait', () => {
    const page = fakePage('http://x/admin/fiches');
    const run = vi.fn();
    scheduleUrlUpdate(run, 200);
    page.navigate('/admin/audit');
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
  });

  it('hrefFrom sets, removes, and goes back to page 1', () => {
    const base = new URLSearchParams('onglet=journal&page=3&q=old');
    expect(hrefFrom('/admin/recuperation', base, { q: null, source: 'rncp' })).toBe(
      '/admin/recuperation?onglet=journal&source=rncp',
    );
    expect(hrefFrom('/explorer', new URLSearchParams('page=2'), { q: null }, true)).toBe(
      '/explorer?page=2',
    );
    expect(hrefFrom('/explorer', new URLSearchParams(), { q: null })).toBe('/explorer');
  });
});
