'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { cancelUrlUpdate, hrefFrom, liveParams, scheduleUrlUpdate } from '@/lib/url-update';

/**
 * Filters of a server-paginated admin list live in the URL: `hrefWith` builds the same list with
 * other parameters (back to page 1 unless asked), `go` navigates there, `typed` debounces a
 * search field (200 ms). `go` and the debounced search start from the address as it is when they
 * run, and `go` cancels a search still waiting (lib/url-update.ts): a filter or a tab chosen
 * during the wait is never undone by it.
 */
export function useListUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  useEffect(() => cancelUrlUpdate, []);
  /** For links rendered now (the parameters of this render). */
  const hrefWith = (set: Record<string, string | null>, keepPage = false) =>
    hrefFrom(pathname, sp, set, keepPage);
  const go = (set: Record<string, string | null>) => {
    cancelUrlUpdate();
    const href = hrefFrom(window.location.pathname, liveParams(), set);
    start(() => router.replace(href, { scroll: false }));
  };
  const typed = (key: string, v: string) =>
    scheduleUrlUpdate(() => go({ [key]: v.trim() || null }), 200);
  return { hrefWith, go, typed, pending, sp, refresh: () => router.refresh() };
}
