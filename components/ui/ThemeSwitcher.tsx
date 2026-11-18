'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

/**
 * Theme of the site: « Clair », « Sombre » or « Auto » (follows prefers-color-scheme). The choice
 * is kept in the `nm-theme` cookie (one year) and applied before first paint by the root layout
 * script (data-theme on <html>), so a reload never flashes the other theme.
 */
export type Theme = 'light' | 'dark' | 'auto';

export const THEME_OPTIONS: { id: Theme; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Clair', icon: 'sun' },
  { id: 'dark', label: 'Sombre', icon: 'moon' },
  { id: 'auto', label: 'Auto', icon: 'monitor' },
];

export const THEME_COOKIE = 'nm-theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const secure = location.protocol === 'https:' ? ';secure' : '';
  document.cookie =
    theme === 'auto'
      ? `${THEME_COOKIE}=;path=/;max-age=0;samesite=lax${secure}`
      : `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax${secure}`;
  try {
    localStorage.removeItem(THEME_COOKIE); // former storage
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent('nm-theme', { detail: theme }));
}

/** Current theme and setter, kept in sync between every switcher of the page. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('auto');
  useEffect(() => {
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setTheme(t === 'light' || t === 'dark' ? t : 'auto');
    };
    read();
    const on = () => read();
    window.addEventListener('nm-theme', on);
    return () => window.removeEventListener('nm-theme', on);
  }, []);
  const set = useCallback((t: Theme) => {
    setTheme(t);
    applyTheme(t);
  }, []);
  return [theme, set];
}

/**
 * Radio group with roving focus: Tab reaches the checked option, arrows move and choose
 * (left / up: previous, right / down: next, wrapping), Home / End: first / last.
 */
export function useRadioKeys<T extends string>(
  ids: readonly T[],
  value: T,
  onChange: (v: T) => void,
) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ids.indexOf(value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = ids[next]!;
    onChange(id);
    refs.current.get(id)?.focus();
  };
  const ref = (id: T) => (el: HTMLButtonElement | null) => {
    refs.current.set(id, el);
  };
  return { onKeyDown, ref };
}

export function ThemeSwitcher({
  className,
  tone = 'light',
}: {
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const [theme, setTheme] = useTheme();
  const keys = useRadioKeys(
    THEME_OPTIONS.map((o) => o.id),
    theme,
    setTheme,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Thème"
      onKeyDown={keys.onKeyDown}
      className={cn(
        'inline-flex gap-1 rounded-pill p-1',
        tone === 'dark' ? 'bg-white/10' : 'bg-surface-100',
        className,
      )}
    >
      {THEME_OPTIONS.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            ref={keys.ref(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setTheme(o.id)}
            className={cn(
              'inline-flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill border-0 px-3 text-[13px] font-semibold',
              on
                ? tone === 'dark'
                  ? 'bg-lime-400 text-on-lime'
                  : 'bg-surface-0 text-ink shadow-[0_0_0_1.5px_var(--border-control)]'
                : tone === 'dark'
                  ? 'bg-transparent text-on-night'
                  : 'bg-transparent text-ink',
            )}
          >
            <Icon name={o.icon} size={16} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
