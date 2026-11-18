'use client';

import { useEffect } from 'react';

/**
 * Sets <html data-hydrated> once React has hydrated the page. Used by the end-to-end tests to
 * wait for an interactive page (more reliable than "network idle" on the dev server).
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = '';
  }, []);
  return null;
}
