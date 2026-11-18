'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Bar that fills from 0 to its value in 600ms the first time it shows on screen
 * (IntersectionObserver), once; later changes slide smoothly (sync progress). Score bars,
 * selectivity, ProgressBar. Without JavaScript the bar is drawn full at once.
 */
export function FillBar({
  fraction,
  className,
  trackClassName,
}: {
  /** 0 to 1. */
  fraction: number;
  /** Colour of the fill. */
  className?: string;
  trackClassName?: string;
}) {
  // Observe the track, not the fill: the fill starts translated out of the clipped track, so
  // it never intersects the viewport and the bar would stay empty.
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn('block overflow-hidden rounded-pill', trackClassName)}
    >
      <span
        data-revealed={seen ? 'true' : undefined}
        className={cn('nm-fill block h-full w-full rounded-pill', className)}
        style={{ '--fill': f } as React.CSSProperties}
      />
    </span>
  );
}
