'use client';

import dynamic from 'next/dynamic';
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { ShareData } from '@/lib/domain/share';
// Types only: the texts (lib/domain/share-copy.ts) come with the panel, not with the fiche.
import type { ShareContext, ShareTab } from '@/lib/domain/share-copy';

/** The panel is its own chunk, fetched on the first click only (JS budget of the fiche). */
const SharePanel = dynamic(() => import('./SharePanel').then((m) => m.SharePanel), {
  ssr: false,
});

const LOOK = {
  // Hero of a fiche: as « Suivre »; white with violet text while the panel is open.
  hero: {
    base: 'min-h-14 border-2 px-4 text-[15px] transition-colors',
    closed: 'border-on-violet bg-transparent text-on-violet',
    open: 'border-white bg-white text-[#3B23B8]',
  },
  // « Inviter ma promo » of the confirmation screen: the night button of the panel (.nm-sbtn).
  invite: {
    base: 'nm-sbtn nm-sbtn--main w-auto min-h-13 px-5.5 whitespace-nowrap',
    closed: '',
    open: '',
  },
} as const;

/**
 * « Partager » (issue #13): rendered by the server, it opens SharePanel (popover on a computer,
 * sheet on a phone) and gets the focus back when the panel closes.
 */
export function ShareButton({
  data,
  context = 'fiche',
  initialTab = 'promo', // DEFAULT_TAB of lib/domain/share-copy.ts
  variant = 'hero',
  native,
  children,
}: {
  data: ShareData;
  context?: ShareContext;
  initialTab?: ShareTab;
  variant?: keyof typeof LOOK;
  /** On a phone, the share sheet of the system directly with this (the panel without it). */
  native?: { title: string; text: string; url: string };
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const look = LOOK[variant];
  return (
    // flex: the button fills the height of its row (as tall as « Suivre » and « Donner mon avis »).
    <div className="relative flex">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (
            native &&
            typeof navigator.share === 'function' &&
            window.matchMedia('(max-width: 759.98px)').matches // SHEET_QUERY of SharePanel
          ) {
            // Closed by the person or refused: nothing else to do.
            navigator.share(native).catch(() => {});
            return;
          }
          setOpen((o) => !o);
        }}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-sans font-bold',
          look.base,
          open ? look.open : look.closed,
        )}
      >
        <span className="nm-ic" aria-hidden="true">
          <Icon name="share" size={18} />
        </span>
        {children ?? 'Partager'}
      </button>
      {open && (
        <SharePanel
          data={data}
          context={context}
          initialTab={initialTab}
          anchor={button}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
