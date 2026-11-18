'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';

export interface ChoiceOption<V extends string> {
  value: V;
  label: React.ReactNode;
  /** Card content for the `mode` variant (title, description, tag). */
  description?: React.ReactNode;
  tag?: React.ReactNode;
}

export interface ChoiceGroupProps<V extends string> {
  /** Visible legend; also names the radio group. */
  legend?: React.ReactNode;
  ariaLabel?: string;
  options: ChoiceOption<V>[];
  value: V | '' | null | undefined;
  onChange: (v: V) => void;
  /**
   * `level` (52px), `situation` (48px, graduate status), `mode` (publication cards),
   * `request` (Signaler: type of request).
   */
  variant?: 'level' | 'situation' | 'mode' | 'request';
  error?: string | null;
  className?: string;
  /** Class of each card (flex basis…). */
  itemClassName?: string;
}

const ROW: Record<NonNullable<ChoiceGroupProps<string>['variant']>, string> = {
  level: 'flex flex-wrap gap-2',
  situation: 'flex flex-wrap gap-2',
  mode: 'grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2.5',
  request: 'grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2.5',
};

const ITEM: Record<NonNullable<ChoiceGroupProps<string>['variant']>, string> = {
  level: 'flex-[1_1_140px]',
  situation: 'flex-[1_1_150px]',
  mode: '',
  request: '',
};

/**
 * Radio group drawn as cards: `role="radio"` buttons, arrow keys move the choice
 * (roving tabindex), the chosen card gets a violet border on violet-100.
 */
export function ChoiceGroup<V extends string>({
  legend,
  ariaLabel,
  options,
  value,
  onChange,
  variant = 'level',
  error,
  className,
  itemClassName,
}: ChoiceGroupProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n]!.value);
    refs.current[n]?.focus();
  };
  const group = (
    <div
      role="radiogroup"
      aria-label={legend ? undefined : ariaLabel}
      aria-invalid={error ? true : undefined}
      className={ROW[variant]}
    >
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (current === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move((current === -1 ? -1 : current) + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move((current === -1 ? 0 : current) - 1);
              }
            }}
            className={cn(
              'nm-choice',
              variant === 'situation' && 'nm-choice--situation',
              variant === 'mode' && 'nm-choice--mode',
              variant === 'request' && 'nm-choice--request',
              ITEM[variant],
              itemClassName,
            )}
          >
            {variant === 'mode' || variant === 'request' ? (
              <>
                <span className="nm-choice__title">{o.label}</span>
                {o.description && <span className="nm-choice__desc">{o.description}</span>}
                {o.tag}
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
  if (!legend)
    return (
      <div className={className}>
        {group}
        {error && <span className="nm-error mt-2 block">{error}</span>}
      </div>
    );
  return (
    <fieldset className={cn('m-0 min-w-0 border-0 p-0', className)}>
      <legend className="nm-label mb-2.5 px-0.5">{legend}</legend>
      {group}
      {error && <span className="nm-error mt-2 block">{error}</span>}
    </fieldset>
  );
}
