'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

/**
 * Confirmation toast (admin actions, « Lien envoyé »…): slides in by 8px with a fade, leaves on
 * its own after 4 seconds. Announced to screen readers (role="status"). Errors stay inline.
 */
export function Toast({
  message,
  tone = 'success',
  onDone,
}: {
  message: string;
  tone?: 'success' | 'danger';
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 4000);
    const t2 = window.setTimeout(onDone, 4180);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);
  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-[14px] px-4 py-3 text-[14px] font-semibold shadow-[0_18px_40px_rgba(22,19,31,.25)]',
        tone === 'success' ? 'bg-night text-on-night' : 'bg-danger text-surface-0',
        leaving ? 'nm-toast-out' : 'nm-toast-in',
      )}
    >
      <Icon name={tone === 'success' ? 'check' : 'alert'} size={18} />
      {message}
    </div>
  );
}
