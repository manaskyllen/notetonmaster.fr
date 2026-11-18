'use client';

import { usePathname } from 'next/navigation';
import { Icon, ShortcutKbd } from '@/components/ui';
import { useOpenPalette } from './SearchShortcut';

/** Fiches (program, mention, university): the header search is this pill, which opens the palette. */
const FICHE = /^\/(parcours|mentions|universites)\/[^/]+/;

export function HeaderSearchPill() {
  const pathname = usePathname();
  const openPalette = useOpenPalette();
  if (!FICHE.test(pathname)) return null;
  return (
    <button
      type="button"
      data-search-pill
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={(e) => openPalette(e.currentTarget)}
      className="nm-hpill flex max-w-[420px] min-w-[200px] flex-1 cursor-pointer items-center gap-2.5 rounded-pill border border-border bg-surface-0 px-4 py-3 text-left font-sans text-[15px] text-ink-muted max-sm:order-last max-sm:max-w-none max-sm:basis-full"
    >
      <Icon name="search" size={18} strokeWidth={2.2} className="text-ink" />
      Rechercher un master…
      <ShortcutKbd className="ml-auto" />
    </button>
  );
}
