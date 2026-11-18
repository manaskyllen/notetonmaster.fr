'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { gradeColor } from '@/lib/domain/rating';

export const GRADE_WORDS = ['', 'À éviter', 'Décevant', 'Correct', 'Bien', 'Excellent'] as const;
export const GRADE_HELP = '1 : à éviter · 5 : je le recommande sans hésiter';

export interface GradePickerProps {
  /** Visible label above the buttons; also names the radio group. */
  label?: React.ReactNode;
  /** Accessible name when the label is shown elsewhere (detailed criteria rows). */
  ariaLabel?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (v: number) => void;
  /** `l` = 56px buttons (overall rating), `m` = 44px (detailed ratings). */
  size?: 'l' | 'm';
  hideWord?: boolean;
  /** Shows "1 : à éviter · 5 : je le recommande sans hésiter" under the buttons. */
  help?: boolean;
  /** Hidden input name, to submit the value with a plain form. */
  name?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/** Five numbered radio buttons (1–5); the chosen one takes its rating's colour (red → green) and tilts by −3°. No stars. */
export function GradePicker({
  label,
  ariaLabel,
  value: controlled,
  defaultValue = 0,
  onChange,
  size = 'l',
  hideWord,
  help,
  name,
  invalid,
  describedBy,
  className,
}: GradePickerProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();
  const helpId = useId();

  const pick = (n: number) => {
    if (controlled === undefined) setInner(n);
    onChange?.(n);
  };

  const described = [help ? helpId : null, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {label ? (
        <span id={labelId} className="nm-label">
          {label}
        </span>
      ) : null}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : (ariaLabel ?? 'Note, de 1 à 5')}
        aria-describedby={described}
        aria-invalid={invalid || undefined}
        className={cn('flex flex-wrap items-center', size === 'l' ? 'gap-2' : 'gap-1.5')}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[n] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} sur 5 · ${GRADE_WORDS[n]}`}
              tabIndex={on || (value === 0 && n === 1) ? 0 : -1}
              onClick={() => pick(n)}
              style={on ? { backgroundColor: gradeColor(n) } : undefined}
              onKeyDown={(e) => {
                const next =
                  e.key === 'ArrowRight' || e.key === 'ArrowUp'
                    ? Math.min(5, (value || 0) + 1)
                    : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                      ? Math.max(1, (value || 2) - 1)
                      : 0;
                if (next) {
                  e.preventDefault();
                  pick(next);
                  refs.current[next]?.focus();
                }
              }}
              className={cn(
                'nm-gpick-btn inline-flex cursor-pointer items-center justify-center border-2 p-0 font-display font-extrabold',
                size === 'l'
                  ? 'size-14 rounded-[16px] text-[24px]'
                  : 'size-11 rounded-[13px] text-[18px]',
                on
                  ? '-rotate-3 border-night text-on-lime'
                  : 'border-border bg-surface-0 text-ink hover:border-ink',
              )}
            >
              {n}
            </button>
          );
        })}
        {!hideWord && (
          <span
            key={value}
            className={cn(
              'nm-gpick-word ml-1.5 text-[15px] font-bold',
              value ? 'text-ink' : 'text-ink-muted',
            )}
          >
            {value ? `${value}/5 · ${GRADE_WORDS[value]}` : 'Choisis une note'}
          </span>
        )}
      </div>
      {help && (
        <span id={helpId} className="text-[13px] leading-[1.45] text-ink-muted">
          {GRADE_HELP}
        </span>
      )}
      {name ? <input type="hidden" name={name} value={value || ''} /> : null}
    </div>
  );
}
