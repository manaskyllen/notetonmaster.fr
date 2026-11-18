'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * The palette is loaded on its first opening only: its code (search, keyboard list, modal) is
 * not part of the JavaScript of a first visit.
 */
const CommandPalette = dynamic(
  () => import('@/components/ui/CommandPalette').then((m) => m.CommandPalette),
  { ssr: false },
);

/**
 * « Une seule recherche par page »: ⌘K / Ctrl K, and "/" outside a field,
 * always lead to THE search of the page. One global listener; a page that has its own search
 * field registers it with `useSearchShortcut`, every other page opens the palette.
 */
export type ShortcutTarget =
  /** Puts the cursor in this field (home hero, Explorer filter, review form step 1). */
  | { kind: 'focus'; get: () => HTMLInputElement | null }
  /** Does nothing (review form, steps 2 and 3). */
  | { kind: 'none' };

interface Ctx {
  register: (t: ShortcutTarget) => () => void;
  openPalette: (opener?: HTMLElement | null) => void;
}

const SearchShortcutContext = createContext<Ctx | null>(null);

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Brings the field into view (smooth scroll), then focuses it with its text selected. */
export function focusSearchField(input: HTMLInputElement) {
  input.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  input.focus({ preventScroll: true });
  input.select();
}

export function SearchShortcutProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef<ShortcutTarget[]>([]);
  const [palette, setPalette] = useState<{ open: boolean; opener: HTMLElement | null }>({
    open: false,
    opener: null,
  });
  /** Mounted from the first opening on (then kept, closed, like before). */
  const [loaded, setLoaded] = useState(false);

  const openPalette = useCallback((opener?: HTMLElement | null) => {
    setLoaded(true);
    // Focus goes back to the header pill when there is one (fiches), else to what had it.
    setPalette({
      open: true,
      opener:
        opener ??
        document.querySelector<HTMLElement>('[data-search-pill]') ??
        (document.activeElement as HTMLElement | null),
    });
  }, []);

  const register = useCallback((t: ShortcutTarget) => {
    targets.current.push(t);
    return () => {
      targets.current = targets.current.filter((x) => x !== t);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest('input, textarea, select, [contenteditable="true"]');
      const cmdK =
        (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing;
      if (!cmdK && !slash) return;
      // Disabled while a modal (or the palette itself) is open.
      if (document.querySelector('dialog[open], [aria-modal="true"]:not(dialog)')) return;
      const target = targets.current.at(-1);
      if (target?.kind === 'none') return;
      e.preventDefault();
      if (target?.kind === 'focus') {
        const input = target.get();
        if (input) focusSearchField(input);
        return;
      }
      openPalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);

  return (
    <SearchShortcutContext.Provider value={{ register, openPalette }}>
      {children}
      {loaded && (
        <CommandPalette
          open={palette.open}
          returnFocusTo={palette.opener}
          onClose={() => setPalette((p) => ({ ...p, open: false }))}
        />
      )}
    </SearchShortcutContext.Provider>
  );
}

/** Makes ⌘K / Ctrl K lead to this page's search field (or do nothing), while mounted. */
export function useSearchShortcut(target: ShortcutTarget | null) {
  const ctx = useContext(SearchShortcutContext);
  const kind = target?.kind;
  const ref = useRef(target);
  useEffect(() => {
    ref.current = target;
  });
  useEffect(() => {
    if (!ctx || !kind) return;
    // The registered target reads the latest one, so callers can pass inline objects.
    const proxy: ShortcutTarget =
      kind === 'focus'
        ? {
            kind: 'focus',
            get: () => (ref.current?.kind === 'focus' ? ref.current.get() : null),
          }
        : { kind: 'none' };
    return ctx.register(proxy);
  }, [ctx, kind]);
}

/** Opens the ⌘K palette (header pill of the fiches). */
export function useOpenPalette() {
  return useContext(SearchShortcutContext)?.openPalette ?? (() => {});
}
