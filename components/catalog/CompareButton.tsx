'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * « + Comparer » → « ✓ Ajouté » (.cmp): fixed width (132px) so
 * nothing moves around it; the label slides up and « Ajouté » rises from below, the tick draws
 * itself, the lime background pops (cmppop). Same path backwards when removed.
 * Beyond 3, the button is disabled (aria-disabled, still focusable): a press shakes it and asks
 * to remove a parcours first.
 */
export function CompareButton({
  title,
  on,
  blocked,
  onToggle,
  onBlocked,
  className,
}: {
  title: string;
  on: boolean;
  blocked: boolean;
  onToggle: () => void;
  onBlocked?: () => void;
  className?: string;
}) {
  const [shake, setShake] = useState(0);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={blocked || undefined}
      aria-label={`Comparer : ${title}`}
      title={blocked ? '3 parcours au maximum' : undefined}
      // A new key each time restarts the shake.
      data-shake={shake ? shake % 2 : undefined}
      onAnimationEnd={(e) => {
        if (e.animationName.startsWith('nm-cmpshake')) setShake(0);
      }}
      onClick={() => {
        if (blocked) {
          setShake((n) => n + 1);
          onBlocked?.();
        } else onToggle();
      }}
      className={cn('nm-cmp', className)}
    >
      <span className="nm-cmp-l" aria-hidden="true">
        <span className="nm-cmp-a">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Comparer
        </span>
        <span className="nm-cmp-b">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="nm-cmp-tick" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Ajouté
        </span>
      </span>
    </button>
  );
}
