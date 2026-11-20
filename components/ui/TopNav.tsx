'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { CtaArrow, ctaClasses } from './button-classes';
import { HoverLink } from './HoverLink';
import { Glyph } from './Glyph';
import { CLOSE, MENU } from './glyphs';
import { Logo } from './Logo';

export interface TopNavLink {
  label: string;
  href: string;
  /** Unread counter shown as a pill (e.g. messages). */
  badge?: number;
}

export interface TopNavProps {
  links: TopNavLink[];
  /** href of the active link */
  active?: string;
  ctaLabel?: string;
  ctaHref?: string;
  hideCta?: boolean;
  /** Header search (the ⌘K pill of the fiches), after the logo. */
  search?: React.ReactNode;
}

/** Sent by « Quitter »; the review form cancels it to ask about the draft. */
export const QUIT_REVIEW_EVENT = 'nm:quit-review';

const QUIT = 'inline-flex min-h-tap items-center text-[15px] font-semibold text-ink';

/** « Quitter » the review form: back to the fiche it was opened from, else home. */
function QuitLink({ from }: { from: string | null }) {
  const href = from ? `/parcours/${encodeURIComponent(from)}` : '/';
  return (
    <Link
      href={href}
      className={QUIT}
      // The form asks « Garder le brouillon » / « Effacer » when fields are filled.
      onClick={(e) => {
        const ask = new CustomEvent(QUIT_REVIEW_EVENT, { cancelable: true, detail: { href } });
        if (!window.dispatchEvent(ask)) e.preventDefault();
      }}
    >
      Quitter
    </Link>
  );
}

function QuitFromParams() {
  return <QuitLink from={useSearchParams().get('parcours')} />;
}

/** Sticky public header: logo, main links, "Donner mon avis". Collapses into a menu under 640px. */
export function TopNav({
  links,
  active,
  ctaLabel = 'Donner mon avis',
  ctaHref = '/avis/nouveau',
  hideCta,
  search,
}: TopNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const linkEls = links.map((l) => {
    const current = active
      ? active === l.href
      : pathname === l.href || pathname.startsWith(`${l.href}/`);
    return (
      <HoverLink
        key={l.href}
        href={l.href}
        aria-current={current ? 'page' : undefined}
        onClick={() => setOpen(false)}
        className={cn(
          'inline-flex min-h-tap items-center gap-2 rounded-pill px-3.5 text-[15px] text-ink no-underline',
          current ? 'bg-surface-0 font-bold' : 'font-medium hover:bg-surface-0',
        )}
      >
        {l.label}
        {l.badge ? (
          <span
            // Keyed by the count: a new unread message makes the badge bounce in.
            key={l.badge}
            className="nm-bounce rounded-pill bg-violet-500 px-1.5 text-[12px] leading-5 font-bold text-on-violet"
          >
            {l.badge}
            <span className="sr-only"> non lu{l.badge > 1 ? 's' : ''}</span>
          </span>
        ) : null}
      </HoverLink>
    );
  });

  // The review form: logo and « Quitter » only, no search.
  if (pathname === '/avis/nouveau') {
    return (
      <header className="border-b border-border bg-surface-50">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-6 py-3.5 max-sm:px-4"
        >
          <Logo href="/" size="m" />
          <Suspense fallback={<QuitLink from={null} />}>
            <QuitFromParams />
          </Suspense>
        </nav>
      </header>
    );
  }

  return (
    // No backdrop blur on phones: it would contain the fixed menu panel.
    <header className="sticky top-0 z-30 border-b border-border bg-surface-50/85 backdrop-blur-md max-sm:bg-surface-50 max-sm:backdrop-blur-none">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-6 py-3.5 max-sm:gap-2 max-sm:px-4"
      >
        <Logo href="/" size="m" />
        {search}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="nm-nav-links"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex size-tap items-center justify-center rounded-sm bg-surface-100 text-ink sm:hidden"
        >
          <Glyph parts={open ? CLOSE : MENU} size={20} />
          <span className="sr-only">Menu</span>
        </button>
        {/* Phones: the links slide in from the right over a dimmed page (nm-drawer, nm-scrim). */}
        <div
          aria-hidden="true"
          data-open={open}
          onClick={() => setOpen(false)}
          className="nm-scrim fixed inset-0 z-40 bg-night/45 sm:hidden"
        />
        <div
          id="nm-nav-links"
          data-open={open}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          className={cn(
            'nm-drawer flex flex-wrap items-center gap-1.5',
            'max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:z-50 max-sm:w-[min(320px,85vw)] max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch max-sm:gap-2 max-sm:overflow-y-auto max-sm:bg-surface-50 max-sm:p-5 max-sm:shadow-[-20px_0_50px_rgba(22,19,31,.25)]',
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-2 inline-flex size-tap items-center justify-center self-end rounded-sm bg-surface-100 text-ink sm:hidden"
          >
            <Glyph parts={CLOSE} size={20} />
            <span className="sr-only">Fermer le menu</span>
          </button>
          {linkEls}
          {!hideCta && (
            <HoverLink
              href={ctaHref}
              onClick={() => setOpen(false)}
              className={ctaClasses('night', 'm', 'sm:ml-2')}
            >
              {ctaLabel}
              <CtaArrow />
            </HoverLink>
          )}
        </div>
      </nav>
    </header>
  );
}
