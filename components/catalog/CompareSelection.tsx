'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CompareButton } from './CompareButton';

/**
 * « Comparer » selection (3 programs at most), kept in the URL (?comparer=slug,slug) and in
 * sessionStorage, so it survives a change of page, of filter or of list (Explorer, mention and
 * university pages). The bar « À comparer (n/3) » appears with the first parcours ticked; the
 * comparison itself needs 2 at least.
 */
export interface Picked {
  slug: string;
  title: string;
}
const MAX = 3;
const KEY = 'nm-compare';

const Ctx = createContext<{
  picked: Picked[];
  toggle: (p: Picked) => void;
  /** A 4th was pressed: the bar says why nothing happened. */
  refuse: () => void;
  refused: boolean;
} | null>(null);

function readStore(): Picked[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Picked[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function CompareProvider({
  initial,
  children,
}: {
  /** Programs named in the URL, resolved by the server. */
  initial: Picked[];
  children: React.ReactNode;
}) {
  const [picked, setPicked] = useState<Picked[]>(initial);
  // A client navigation (next page, a filter) keeps this provider: the URL is synced again.
  const sp = useSearchParams();

  // A link without ?comparer (pagination rendered before a tick, another list): the session
  // keeps the selection.
  useEffect(() => {
    if (initial.length) return;
    const stored = readStore();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once after mount
    if (stored.length) setPicked(stored);
  }, [initial.length]);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(picked));
    } catch {
      /* no storage: the URL still carries it */
    }
    const url = new URL(window.location.href);
    if (picked.length) url.searchParams.set('comparer', picked.map((p) => p.slug).join(','));
    else url.searchParams.delete('comparer');
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, '', url);
  }, [picked, sp]);

  const toggle = useCallback(
    (p: Picked) =>
      setPicked((xs) =>
        xs.some((x) => x.slug === p.slug)
          ? xs.filter((x) => x.slug !== p.slug)
          : xs.length >= MAX
            ? xs
            : [...xs, p],
      ),
    [],
  );
  const [refused, setRefused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const refuse = useCallback(() => {
    setRefused(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRefused(false), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const value = useMemo(
    () => ({ picked, toggle, refuse, refused: refused && picked.length >= MAX }),
    [picked, toggle, refuse, refused],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <CompareBar />
    </Ctx.Provider>
  );
}

export function CompareToggle({ slug, title }: Picked) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const on = ctx.picked.some((p) => p.slug === slug);
  return (
    <CompareButton
      title={title}
      on={on}
      blocked={!on && ctx.picked.length >= MAX}
      onToggle={() => ctx.toggle({ slug, title })}
      onBlocked={ctx.refuse}
    />
  );
}

function CompareBar() {
  const ctx = useContext(Ctx)!;
  const { picked, toggle, refused } = ctx;
  const shown = picked.length > 0;
  return (
    <div
      className="nm-compare-bar sticky bottom-4 z-20 mt-6"
      data-shown={shown}
      inert={!shown}
      aria-hidden={!shown || undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-night py-3.5 pr-4 pl-5.5 text-on-night shadow-[0_20px_50px_rgba(22,19,31,.3)]">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">
            À comparer ({picked.length}/{MAX}) :
          </span>
          {picked.map((p) => (
            <span
              key={p.slug}
              className="inline-flex items-center gap-1 rounded-pill bg-white/12 py-1 pr-1 pl-3 text-[13px]"
            >
              {p.title}
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-label={`Retirer ${p.title} de la comparaison`}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent text-on-night"
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </span>
        {picked.length >= 2 ? (
          <Link
            href={`/comparer?ids=${picked.map((p) => p.slug).join(',')}`}
            className={buttonClasses('lime', 'm')}
          >
            Comparer ({picked.length})
          </Link>
        ) : (
          <span className="inline-flex min-h-12 items-center rounded-pill bg-[#2d2840] px-4.5 text-[14px] font-semibold text-[#cfcadb]">
            Ajoute au moins un 2e parcours
          </span>
        )}
        <span
          role="status"
          className="basis-full text-[14px] font-semibold text-lime-400 empty:hidden"
        >
          {refused ? 'Retire un parcours pour en ajouter un autre' : ''}
        </span>
      </div>
    </div>
  );
}
