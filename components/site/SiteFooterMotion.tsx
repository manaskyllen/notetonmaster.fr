'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { THEME_OPTIONS, useRadioKeys, useTheme } from '@/components/ui/ThemeSwitcher';

/** Pages without footer: the review form stays a journey without distraction. */
const WITHOUT_FOOTER = ['/avis/nouveau'];

export function FooterGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return WITHOUT_FOOTER.includes(path) ? null : children;
}

const COUNT_MS = 1600;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const fmt = new Intl.NumberFormat('fr-FR');

/**
 * Entrance animations of the footer, played once when it enters the screen (threshold 0.2):
 * words of the giant logo rise, the lime highlighter sweeps « master » then tilts, the figures
 * count from 0 (1.6 s, easeOutCubic) while their bars unfold. The server HTML is the final state:
 * elements are hidden (.armed) only here, once mounted, right before the animation can start.
 * Nothing is hidden or counted under prefers-reduced-motion.
 */
export function SiteFooterMotion() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>('footer[data-ft]');
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') return;
    const nums = [...root.querySelectorAll<HTMLElement>('[data-ft-value]')].map((el) => ({
      el,
      to: Number(el.dataset.ftValue) || 0,
      final: el.textContent ?? '',
    }));
    let raf = 0;
    let done = false;
    const render = (k: number) => {
      for (const n of nums)
        n.el.textContent = k >= 1 ? n.final : fmt.format(Math.round(n.to * easeOutCubic(k)));
    };
    root.classList.add('armed');
    render(0);
    const play = () => {
      if (done) return;
      done = true;
      root.classList.add('shown');
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / COUNT_MS);
        render(k);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      // Leaving mid-animation (navigation, HMR): back to the final state.
      root.classList.remove('armed', 'shown');
      render(1);
    };
  }, []);
  return <span ref={marker} hidden />;
}

/** « Clair / Sombre / Auto », styled for the dark footer (same theme as ThemeSwitcher). */
export function FooterThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  const keys = useRadioKeys(
    THEME_OPTIONS.map((o) => o.id),
    theme,
    setTheme,
  );
  return (
    <span
      role="radiogroup"
      aria-label="Thème"
      onKeyDown={keys.onKeyDown}
      className="inline-flex gap-0.5 rounded-pill bg-[#24202f] p-0.75"
    >
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.id}
          ref={keys.ref(o.id)}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          tabIndex={theme === o.id ? 0 : -1}
          onClick={() => setTheme(o.id)}
          className="ft-thm"
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
