'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { ShortcutKbd } from './Kbd';

export interface SearchBarProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  label?: string;
  submitLabel?: string;
  size?: 'l' | 'm';
  /** Name of the input, for plain GET forms (action). */
  name?: string;
  /** When set, the form submits natively to this URL (GET). */
  action?: string;
  autoFocus?: boolean;
  className?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  inputRef?: React.Ref<HTMLInputElement>;
  /** The field is the page's search: ⌘K / Ctrl K chip and aria-keyshortcuts. */
  shortcut?: boolean;
}

export function SearchBar({
  value,
  defaultValue = '',
  onChange,
  onSubmit,
  placeholder = 'Un master, une fac, une ville…',
  label = 'Rechercher un master, une université ou une ville',
  submitLabel = 'Chercher',
  size = 'l',
  name = 'q',
  action,
  autoFocus,
  className,
  inputProps,
  inputRef,
  shortcut,
}: SearchBarProps) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = (v: string) => {
    if (!controlled) setInner(v);
    onChange?.(v);
  };
  const large = size === 'l';

  return (
    <form
      role="search"
      action={action}
      method={action ? 'get' : undefined}
      onSubmit={(e) => {
        if (onSubmit) {
          e.preventDefault();
          onSubmit(current);
        } else if (!action) e.preventDefault();
      }}
      className={cn(
        'nm-search-field flex w-full items-center gap-3 border-ink bg-surface-0 text-ink',
        large
          ? 'rounded-lg border-2 py-1.5 pr-1.5 pl-5 shadow-search focus-within:shadow-[0_0_0_4px_var(--focus-halo),var(--shadow-search)] max-sm:pl-4'
          : 'rounded-md border-[1.5px] py-0 pr-1.5 pl-4 focus-within:shadow-[0_0_0_4px_var(--focus-halo)]',
        className,
      )}
    >
      <Icon name="search" size={large ? 26 : 18} strokeWidth={2.2} className="max-sm:size-5" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        aria-keyshortcuts={shortcut ? 'Meta+K Control+K' : undefined}
        type="search"
        name={name}
        value={current}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => set(e.target.value)}
        className={cn(
          'min-w-0 flex-1 border-0 bg-transparent font-sans text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden',
          large ? 'py-3.5 text-[19px] max-sm:text-[16px]' : 'py-3 text-[16px]',
        )}
        {...inputProps}
      />
      {shortcut && <ShortcutKbd className="max-sm:hidden" />}
      {current ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => set('')}
          className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-surface-100 text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
      {large && (
        <button
          type="submit"
          className="min-h-control-l flex-none cursor-pointer rounded-[18px] border-0 bg-violet-500 px-6.5 font-sans text-[16px] font-bold text-on-violet max-sm:px-4"
        >
          {submitLabel}
        </button>
      )}
    </form>
  );
}
