'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ShareTarget } from '@/lib/domain/share';

/** The menu is its own chunk, fetched on the first click only (JS budget of the fiche). */
const ShareMenu = dynamic(() => import('./ShareMenu').then((m) => m.ShareMenu), { ssr: false });

/**
 * « Partager » of the hero of a fiche (issue #13): a small menu with the fiche and its review
 * form set on the parcours. Native share on a phone, « Copier le lien » elsewhere.
 */
export function ShareButton({ targets }: { targets: ShareTarget[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="nm-save inline-flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-pill border-2 border-on-violet bg-transparent px-4 font-sans text-[15px] font-bold text-on-violet"
      >
        <Icon name="share" size={18} />
        Partager
      </button>
      {open && <ShareMenu id={id} targets={targets} onClose={() => setOpen(false)} />}
    </div>
  );
}
