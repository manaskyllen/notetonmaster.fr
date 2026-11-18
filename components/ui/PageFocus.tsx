'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * After a change of page (not on first load), brings the top of the list back on screen and
 * moves the focus to its title, so keyboard and screen reader users start from the new page.
 */
export function PageFocus({ targetId }: { targetId: string }) {
  const sp = useSearchParams();
  const page = sp.get('page') ?? '1';
  const previous = useRef(page);
  useEffect(() => {
    if (previous.current === page) return;
    previous.current = page;
    const el = document.getElementById(targetId);
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [page, targetId]);
  return null;
}
