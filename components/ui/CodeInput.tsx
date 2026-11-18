'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { CODE_LENGTH } from '@/lib/auth/login-code';

/**
 * Six boxes for a one-time code: typing moves to the next box, Backspace to the previous one,
 * and pasting (or the code suggested by the phone keyboard, `autocomplete="one-time-code"`)
 * fills every box at once. `onComplete` fires when the sixth digit arrives. The boxes keep their
 * own state: give the component a new `key` to empty them.
 */
export function CodeInput({
  onChange,
  onComplete,
  invalid,
  disabled,
  labelId,
  autoFocus,
}: {
  /** The digits typed so far (empty boxes left out). */
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Id of the visible label of the group. */
  labelId: string;
  autoFocus?: boolean;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const update = (next: string[]) => {
    setDigits(next);
    onChange?.(next.join(''));
  };

  const focus = (i: number) => {
    const el = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  /** Writes `typed` from box `at`: one digit, or a whole pasted code. */
  const write = (at: number, typed: string) => {
    const clean = typed.replace(/\D/g, '');
    if (!clean) return;
    // A full code always starts at the first box, wherever it was pasted.
    const start = clean.length >= CODE_LENGTH ? 0 : at;
    const next = digits.slice();
    for (let k = 0; k < clean.length && start + k < CODE_LENGTH; k++) next[start + k] = clean[k]!;
    update(next);
    focus(start + clean.length);
    if (!next.includes('')) onComplete?.(next.join(''));
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex gap-2 max-sm:gap-1.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          // The first box receives the code suggested by the keyboard (iOS, Android).
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          inputMode="numeric"
          pattern="[0-9]*"
          // Room for a whole pasted / suggested code; trimmed to one digit by write().
          maxLength={i === 0 ? CODE_LENGTH : 1}
          autoFocus={autoFocus && i === 0}
          aria-label={`Chiffre ${i + 1} sur ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          data-code-box=""
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === '') {
              const next = digits.slice();
              next[i] = '';
              update(next);
              return;
            }
            // Typing over a selected digit gives one char; a suggestion or paste gives several.
            write(i, v.length > 1 && d && v.startsWith(d) ? v.slice(1) : v);
          }}
          onPaste={(e) => {
            e.preventDefault();
            write(i, e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              const next = digits.slice();
              next[i - 1] = '';
              update(next);
              focus(i - 1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focus(i - 1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              focus(i + 1);
            }
          }}
          className={cn(
            'box-border h-16 w-13 min-w-0 flex-1 rounded-[14px] border-2 bg-surface-0 p-0 text-center font-mono text-[28px] font-bold text-ink outline-none max-sm:h-14 max-sm:text-[24px]',
            'focus:border-violet-500 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--violet-500)_18%,transparent)]',
            invalid ? 'border-danger' : d ? 'border-ink' : 'border-border-control',
          )}
        />
      ))}
    </div>
  );
}
