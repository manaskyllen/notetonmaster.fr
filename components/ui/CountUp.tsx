'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A key figure that counts from 0 to its value in 700ms the first time it shows on screen
 * (IntersectionObserver), once. Reduced motion: the value straight away. The server renders the
 * final value, so the figure is right without JavaScript.
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString('fr-FR'),
  duration = 700,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        // ease-out (cubic-bezier(.16,1,.3,1) is close to 1 - (1-p)^4)
        setShown(Math.round(value * (1 - (1 - p) ** 4)));
        if (p < 1) raf = requestAnimationFrame(tick);
        else setShown(null);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        run();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden="true">{format(shown ?? value)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
