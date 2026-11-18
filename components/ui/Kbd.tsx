'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

const noop = () => () => {};

/** Mac (⌘) or not (Ctrl), from navigator.userAgentData.platform or navigator.platform. */
function detectMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** True on Apple platforms. The server render assumes a Mac, then corrects. */
export function useIsMac(): boolean {
  return useSyncExternalStore(noop, detectMac, () => true);
}

/** A keyboard key (`.kbd`). Decorative: hidden from screen readers. */
export function Kbd({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span aria-hidden="true" title={title} className={cn('nm-kbd', className)}>
      {children}
    </span>
  );
}

/** « ⌘ K » on a Mac, « Ctrl K » elsewhere: the shortcut to the page's search. */
export function ShortcutKbd({ className }: { className?: string }) {
  const mac = useIsMac();
  return (
    <Kbd className={className} title={mac ? 'Ctrl + K sur Windows et Linux' : '⌘ K sur Mac'}>
      {mac ? '⌘ K' : 'Ctrl K'}
    </Kbd>
  );
}
