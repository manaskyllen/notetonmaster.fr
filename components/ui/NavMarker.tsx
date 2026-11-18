'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Removes <html class="nm-first"> at the first client navigation. On the first load of a
 * document the entrance animations (page fade, cascades) are off: their elements start at
 * opacity 0, which holds the Largest Contentful Paint back until the JavaScript has run
 * (docs/seo/audit.md). From the first navigation on, new content comes in animated as before.
 * The address is compared with the first one (not a « first effect » flag): Strict Mode runs
 * effects twice in development.
 */
export function NavMarker() {
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const first = useRef(url);
  useEffect(() => {
    if (url !== first.current) document.documentElement.classList.remove('nm-first');
  }, [url]);
  return null;
}
