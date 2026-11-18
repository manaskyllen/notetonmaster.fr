'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface StepperProps {
  current: number;
  total: number;
  /** Title of the current step, for the accessible name (« Étape 1 sur 3 : Ton master »). */
  title?: string;
  className?: string;
}

/**
 * Step indicator of the review form: 8px bars, the current one 40px wide
 * (« la goutte »). On a step change the new drop lands with a spring, squashes and bounces,
 * then a light streak crosses it; the previous one squashes back to 16px; the « n / 3 » counter
 * scrolls in the direction of travel. Classes and keyframes: styles/motion.css (nm-dot…).
 */
export function Stepper({ current, total, title, className }: StepperProps) {
  // Direction of the last change, derived during render (no effect needed).
  const [seen, setSeen] = useState({ step: current, dir: 1 });
  if (seen.step !== current) setSeen({ step: current, dir: current > seen.step ? 1 : -1 });
  const dir = seen.step !== current ? (current > seen.step ? 1 : -1) : seen.dir;
  const way = dir > 0 ? 'nm-fwd' : 'nm-bwd';
  return (
    <div
      role="img"
      aria-label={`Étape ${current} sur ${total}${title ? ` : ${title}` : ''}`}
      className={cn('flex items-center gap-2', className)}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <span
            key={n}
            aria-hidden="true"
            className={cn(
              'nm-dot',
              n === current && 'nm-dot--drop',
              n < current && 'nm-dot--done',
              n <= current ? 'bg-violet-500' : 'bg-border',
            )}
            style={{ width: n === current ? 40 : 16 }}
          />
        );
      })}
      <span
        aria-hidden="true"
        className="ml-1.5 inline-flex items-baseline gap-1 text-[14px] font-semibold text-ink-muted"
      >
        <span className="nm-cwin">
          <span key={current} className={cn('nm-cnum', way)}>
            {current}
          </span>
        </span>
        / {total}
      </span>
    </div>
  );
}

/** Direction of travel between two steps, for the slide of the step content. */
export function stepDirection(prev: number, next: number): 'nm-fwd' | 'nm-bwd' {
  return next >= prev ? 'nm-fwd' : 'nm-bwd';
}
