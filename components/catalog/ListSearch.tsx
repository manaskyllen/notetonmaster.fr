'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ShortcutKbd } from '@/components/ui/Kbd';
import { useSearchShortcut } from '@/components/public/SearchShortcut';

/**
 * Keyword field of a program list (Explorer, « Chercher dans les 40 parcours de Droit… »): the
 * site search, applied to the list. ⌘K / Ctrl K puts the cursor here on these pages. Typing
 * updates ?q= (120 ms debounce) and goes back to page 1; without JavaScript, a GET form.
 */
export function ListSearch({
  placeholder,
  label = 'Mot-clé',
}: {
  placeholder: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlQ = sp.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  const [pending, start] = useTransition();
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const timer = useRef<number | undefined>(undefined);
  useSearchShortcut({ kind: 'focus', get: () => field.current });
  useEffect(() => {
    if (document.activeElement !== field.current) setQ(urlQ);
  }, [urlQ]);

  const apply = (v: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (v.trim()) p.set('q', v.trim());
      else p.delete('q');
      p.delete('page');
      const qs = p.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 120);
  };

  return (
    <form
      role="search"
      method="get"
      action={pathname}
      onSubmit={(e) => {
        e.preventDefault();
        apply(q);
      }}
      aria-busy={pending || undefined}
      className="nm-search-field flex items-center gap-2.5 rounded-md border-[1.5px] border-ink bg-surface-0 px-3.5 focus-within:shadow-[0_0_0_4px_var(--focus-halo)]"
    >
      <Icon name="search" size={18} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {[...sp.entries()]
        .filter(([k]) => k !== 'q' && k !== 'page')
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <input
        ref={field}
        id={id}
        name="q"
        aria-keyshortcuts="Meta+K Control+K"
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          apply(e.target.value);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[15px] text-ink outline-none placeholder:text-ink-muted"
      />
      {!q && <ShortcutKbd />}
    </form>
  );
}
