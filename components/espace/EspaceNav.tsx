'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

const TABS: { href: string; label: string; icon: IconName; count?: 'toFix' | 'unread' }[] = [
  { href: '/espace', label: 'Vue d’ensemble', icon: 'grid' },
  { href: '/espace/avis', label: 'Mes avis', icon: 'file', count: 'toFix' },
  { href: '/espace/messages', label: 'Messages', icon: 'message', count: 'unread' },
  { href: '/espace/suivis', label: 'Masters suivis', icon: 'heart' },
  { href: '/espace/verification', label: 'Vérification', icon: 'shield' },
  { href: '/espace/compte', label: 'Compte', icon: 'user' },
];

/**
 * Tabs of « Mon espace »: vertical list in the sidebar, active tab on lime,
 * coral counters (reviews to rephrase, unread messages). The tab is in the URL. Under 900px the
 * tabs become a row that scrolls sideways, with the active one brought into view.
 */
export function EspaceNav({ counts }: { counts: { toFix: number; unread: number } }) {
  const pathname = usePathname();
  const active = useRef<HTMLAnchorElement>(null);
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    // The row scrolls, never the window: scrollIntoView would also move the page sideways.
    const tab = active.current;
    const nav = row.current;
    if (!tab || !nav || !window.matchMedia('(max-width: 899px)').matches) return;
    nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
  }, [pathname]);
  return (
    <nav
      ref={row}
      role="tablist"
      aria-label="Sections de mon espace"
      aria-orientation="vertical"
      className="nm-espace-tabs relative flex flex-col gap-1 max-[899px]:flex-row max-[899px]:overflow-x-auto max-[899px]:pb-1"
    >
      {TABS.map((t) => {
        const on = t.href === '/espace' ? pathname === '/espace' : pathname.startsWith(t.href);
        const n = t.count ? counts[t.count] : 0;
        return (
          <Link
            key={t.href}
            ref={on ? active : undefined}
            href={t.href}
            role="tab"
            aria-selected={on}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'nm-tab flex min-h-12 flex-none items-center gap-3 rounded-[14px] px-3.5 text-left text-[15px] whitespace-nowrap text-ink no-underline',
              on ? 'bg-lime-400 font-bold text-on-lime' : 'font-medium hover:bg-surface-100',
            )}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
            {n > 0 && (
              <span className="ml-auto inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-pill bg-coral-300 px-1.75 text-[12px] font-extrabold text-on-lime">
                {n}
                <span className="sr-only">
                  {t.count === 'unread' ? ` non lu${n > 1 ? 's' : ''}` : ' à traiter'}
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Short fade when the tab changes (120ms), keyed by the URL. */
export function TabFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="nm-tabfade flex min-w-0 flex-col gap-5.5">
      {children}
    </div>
  );
}
