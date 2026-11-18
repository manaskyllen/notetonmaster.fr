'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { useSearchShortcut } from './SearchShortcut';

const SUGGESTIONS = ['patrimoine', 'Nantes', 'alternance', 'RNCP42684', '2500101KDKQN'];

/**
 * Hero search bar of the home page. The results below it are rendered by the server from the
 * URL (/?q=…&type=…&page=…): typing updates the URL (120 ms debounce) and the server answers with
 * the first page. Without JavaScript the bar is a plain GET form.
 */
export function HomeSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // ⌘K puts the cursor in the hero bar.
  useSearchShortcut({ kind: 'focus', get: () => input.current });

  // Back / forward: the field follows the URL.
  const urlQuery = sp.get('q') ?? '';
  useEffect(() => {
    if (document.activeElement !== input.current) setQuery(urlQuery);
  }, [urlQuery]);

  const go = (v: string, now = false) => {
    window.clearTimeout(timer.current);
    const run = () => {
      const p = new URLSearchParams(sp.toString());
      if (v.trim()) p.set('q', v.trim());
      else p.delete('q');
      p.delete('page');
      p.delete('prive');
      const qs = p.toString();
      start(() => router.replace(qs ? `/?${qs}` : '/', { scroll: false }));
    };
    if (now) run();
    else timer.current = window.setTimeout(run, 120);
  };

  return (
    <>
      <div className="mt-4 w-full max-w-[820px]" aria-busy={pending || undefined}>
        <SearchBar
          value={query}
          onChange={(v) => {
            setQuery(v);
            go(v);
          }}
          onSubmit={(v) => {
            go(v, true);
            document
              .getElementById('resultats')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          action="/"
          placeholder="Un master, une fac, une ville, un n° RNCP ou Mon Master…"
          autoFocus={false}
          inputRef={input}
          shortcut
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-[14px] font-medium text-ink-muted">Essaie :</span>
        {SUGGESTIONS.map((s) => (
          <Chip
            key={s}
            variant="suggest"
            onClick={() => {
              setQuery(s);
              go(s, true);
            }}
          >
            {s}
          </Chip>
        ))}
      </div>
    </>
  );
}
