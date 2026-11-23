'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { copyText } from '@/lib/clipboard';

const FAILED = 'Copie impossible';

/**
 * A copy button of « Partager » (issue #13): after a copy, for 2 seconds, its icon becomes a check
 * that draws itself and its label says so (« Message copié »), then it comes back on its own; a
 * new click restarts the 2 seconds. One check only, never a « ✓ » in the text. The label is
 * announced (aria-live) and every label is laid out in the same cell, so the width never moves.
 * Look and motion: .nm-sbtn / .nm-stgt in styles/motion.css.
 */
export function ShareCopyButton({
  text,
  label,
  done,
  icon = 'copy',
  variant,
  className,
}: {
  /** What is copied (read at click time). */
  text: () => string;
  label: string;
  done: string;
  icon?: IconName;
  /** main: the night button; tgt: the small outlined ones. */
  variant: 'main' | 'tgt';
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const current = state === 'ok' ? done : state === 'failed' ? FAILED : label;
  return (
    <button
      type="button"
      data-ok={state === 'ok'}
      onClick={async () => {
        const ok = await copyText(text());
        clearTimeout(timer.current);
        setState(ok ? 'ok' : 'failed');
        timer.current = setTimeout(() => setState('idle'), 2000);
      }}
      className={cn(variant === 'main' ? 'nm-sbtn nm-sbtn--main' : 'nm-stgt', className)}
    >
      <span className="nm-ic nm-i-base" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="nm-ic nm-i-ok" aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span className="grid">
        <span aria-live="polite" className="[grid-area:1/1]">
          {current}
        </span>
        {/* Sizers: the cell is as wide as the longer of its two labels (« Copie impossible », rare,
            may be wider). */}
        {[label, done]
          .filter((l) => l !== current)
          .map((l) => (
            <span key={l} aria-hidden="true" className="invisible [grid-area:1/1]">
              {l}
            </span>
          ))}
      </span>
    </button>
  );
}
