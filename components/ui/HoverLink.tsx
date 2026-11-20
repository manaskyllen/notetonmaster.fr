'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/**
 * A link that prefetches its page on intent only: hover, keyboard focus or touch. Next.js
 * prefetches every link that enters the screen by default, which on the home (many cards, a
 * phone on 4G) means downloading pages nobody asked for. A plain `<a href>` for the robots and
 * without JavaScript.
 */
export function HoverLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string }) {
  const router = useRouter();
  const prefetch = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        prefetch();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        prefetch();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        prefetch();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
