'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

/**
 * Filters of a server-paginated admin list live in the URL: `hrefWith` builds the same list with
 * other parameters (back to page 1 unless asked), `go` navigates there, `typed` debounces a
 * search field (200 ms).
 */
export function useListUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const hrefWith = (set: Record<string, string | null>, keepPage = false) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(set)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!keepPage) p.delete('page');
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const go = (set: Record<string, string | null>) =>
    start(() => router.replace(hrefWith(set), { scroll: false }));
  const typed = (key: string, v: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ [key]: v.trim() || null }), 200);
  };
  return { hrefWith, go, typed, pending, sp, refresh: () => router.refresh() };
}
