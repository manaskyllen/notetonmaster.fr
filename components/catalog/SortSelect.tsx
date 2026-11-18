'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { controlClass } from '@/components/ui/form/Controls';

/**
 * « Trier par » of a program list. A GET form (works without JavaScript, with its button); with
 * JavaScript the change applies at once and goes back to page 1.
 */
export function SortSelect({
  value,
  options,
  hidden,
  pathname,
}: {
  value: string;
  options: { id: string; label: string }[];
  /** Other parameters of the list, kept (the page is not: a new sort starts at page 1). */
  hidden: [string, string][];
  pathname: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <form method="get" action={pathname} className="flex items-center gap-2">
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
        Trier par
        <select
          name="tri"
          defaultValue={value}
          onChange={(e) => {
            const p = new URLSearchParams(hidden);
            p.set('tri', e.target.value);
            start(() => router.push(`${pathname}?${p}`, { scroll: false }));
          }}
          className={`${controlClass} w-auto`}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="min-h-tap rounded-pill border px-3 text-[14px]">
          Trier
        </button>
      </noscript>
    </form>
  );
}
