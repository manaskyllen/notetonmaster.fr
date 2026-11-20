/**
 * The glyphs the site layout itself draws (header, footer, toasts), apart from the full set of
 * components/ui/Icon.tsx: the map of every icon is one object the bundler cannot split, so these
 * few are imported alone by the layout, and every page saves the rest. Icon uses them too.
 */
export const SEARCH = ['M20 20l-3.5-3.5', 'C11 11 7'] as const;
export const CLOSE = ['M6 6l12 12', 'M18 6L6 18'] as const;
export const CHECK = ['M5 12l5 5L20 7'] as const;
export const ALERT = ['M12 3l9.5 17h-19L12 3z', 'M12 10v4', 'M12 17h.01'] as const;
export const MENU = ['M4 7h16', 'M4 12h16', 'M4 17h16'] as const;
export const SUN = [
  'C12 12 4',
  'M12 2v2',
  'M12 20v2',
  'M4.9 4.9l1.4 1.4',
  'M17.7 17.7l1.4 1.4',
  'M2 12h2',
  'M20 12h2',
  'M4.9 19.1l1.4-1.4',
  'M17.7 6.3l1.4-1.4',
] as const;
export const MOON = ['M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'] as const;
export const MONITOR = ['R3 4 18 12 2', 'M8 20h8', 'M12 16v4'] as const;
