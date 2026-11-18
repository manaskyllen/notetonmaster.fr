'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  /** Called on Escape, backdrop click and the close button. */
  onClose: () => void;
  /** id of the visible title (aria-labelledby). */
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  /** Width of the box (default 480px, as « Poser une question »). */
  size?: 'm' | 'l';
}

/** Duration of the exit animation (--dur); 0 when motion is reduced. */
function exitDelay(): number {
  if (typeof window === 'undefined') return 0;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
}

/**
 * Accessible dialog built on <dialog>.showModal(): the rest of the page is inert (focus stays
 * inside), Escape and a click on the backdrop close it, focus returns to the opener.
 * Enters with a fade + rise, leaves with the reverse; a bottom sheet on small screens.
 */
export function Modal({ open, onClose, labelledBy, children, className, size = 'm' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.removeAttribute('data-closing');
      d.showModal();
      return;
    }
    if (!open && d.open) {
      d.setAttribute('data-closing', '');
      const t = window.setTimeout(() => {
        d.close();
        d.removeAttribute('data-closing');
        opener.current?.focus();
      }, exitDelay());
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Unmounted while open (navigation): make sure focus is not lost.
  useEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={cn('nm-modal', size === 'l' && 'nm-modal--l', className)}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onMouseDown={(e) => {
        // A press on the dialog element itself (not its box) is a press on the backdrop.
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div className="nm-modal__box">
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => onCloseRef.current()}
          className="nm-modal__close"
        >
          <Icon name="close" size={18} strokeWidth={2.2} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
