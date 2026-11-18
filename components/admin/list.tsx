'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { useListUrl } from './useListUrl';

/**
 * Building blocks of the server-paginated admin lists. Their state lives in the URL (filters,
 * sort, view, page, page size): a list can be shared, reloaded, and never loads more than a page.
 */

const SEL =
  'min-h-9.5 cursor-pointer rounded-[10px] border-[1.5px] bg-surface-0 px-2.5 text-[13px] font-semibold text-ink';

/** Compact drop-down filter (`.sel`): outlined in night when a filter is set. */
export function Sel({
  param,
  label,
  options,
  value,
  defaultValue = '',
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  /** Value meaning « no filter » (removed from the URL). */
  defaultValue?: string;
  className?: string;
}) {
  const { go } = useListUrl();
  const on = value !== defaultValue;
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => go({ [param]: e.target.value === defaultValue ? null : e.target.value })}
        className={cn(
          SEL,
          on ? 'border-ink' : 'border-[#d7d3e0] dark:border-border-control',
          className,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** « Effacer »: shown as soon as one of `params` is set. */
export function ClearFilters({ params }: { params: string[] }) {
  const { sp, hrefWith } = useListUrl();
  if (!params.some((p) => sp.get(p))) return null;
  return (
    <Link
      href={hrefWith(Object.fromEntries(params.map((p) => [p, null])))}
      replace
      scroll={false}
      className="text-[13px] font-semibold text-violet-700 underline"
    >
      Effacer
    </Link>
  );
}

/** Search field of a list, debounced into the URL. */
export function SearchBox({
  param = 'q',
  label,
  placeholder,
  value,
  className,
}: {
  param?: string;
  label: string;
  placeholder: string;
  value: string;
  className?: string;
}) {
  const { typed } = useListUrl();
  // The field keeps what is typed; « Effacer » remounts it (key = the value of the URL).
  const [v, setV] = useState(value);
  return (
    <div
      className={cn(
        'flex flex-[1_1_260px] items-center gap-2 rounded-[12px] border-[1.5px] border-ink bg-surface-0 px-3',
        className,
      )}
    >
      <Icon name="search" size={16} />
      <label className="sr-only" htmlFor={`q-${param}`}>
        {label}
      </label>
      <input
        id={`q-${param}`}
        type="search"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          typed(param, e.target.value);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[14px] text-ink outline-none"
      />
    </div>
  );
}

const nf = new Intl.NumberFormat('fr-FR');

/** Footer of a paginated list: « 1–50 sur 183 », page size, previous / next. */
export function ListFooter({
  page,
  perPage,
  total,
  choices = [50, 100, 200],
  defaultPerPage = 50,
  suffix,
}: {
  page: number;
  perPage: number;
  total: number;
  choices?: readonly number[];
  defaultPerPage?: number;
  suffix?: string;
}) {
  const { go, hrefWith } = useListUrl();
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(total, page * perPage);
  const last = Math.max(1, Math.ceil(total / perPage));
  const step =
    'inline-flex min-h-8.5 items-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-2.5 font-bold text-ink no-underline dark:border-border-control';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border bg-[#fbfafd] px-3.5 py-2.5 text-[13px] dark:bg-surface-50">
      <span className="text-[#3b3648] dark:text-ink-muted" role="status">
        {total ? `${nf.format(from)}–${nf.format(to)} sur ${nf.format(total)}` : '0 résultat'}
        {suffix}
      </span>
      <span className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Par page
          <select
            value={perPage}
            onChange={(e) =>
              go({ parPage: Number(e.target.value) === defaultPerPage ? null : e.target.value })
            }
            className={cn(SEL, 'border-[#d7d3e0] dark:border-border-control')}
          >
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {page > 1 ? (
          <Link
            href={hrefWith({ page: page - 1 > 1 ? String(page - 1) : null }, true)}
            scroll={false}
            className={step}
            aria-label="Page précédente"
          >
            ←
          </Link>
        ) : (
          <span className={cn(step, 'opacity-40')} aria-hidden="true">
            ←
          </span>
        )}
        <span className="px-1 text-ink-muted tabular-nums">
          {page} / {last}
        </span>
        {page < last ? (
          <Link
            href={hrefWith({ page: String(page + 1) }, true)}
            scroll={false}
            className={step}
            aria-label="Page suivante"
          >
            →
          </Link>
        ) : (
          <span className={cn(step, 'opacity-40')} aria-hidden="true">
            →
          </span>
        )}
      </span>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Side panel (540 px) over the list: a modal dialog. The focus goes to « Fermer » and stays
 * inside (Tab cycles), Échap or a click outside closes it, and the focus goes back to the element
 * that opened it.
 */
export function Drawer({
  open,
  onClose,
  labelledBy,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  width?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const first =
      box.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const a = items[0]!;
      const z = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      const back = opener.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div
        className="drawer-bg fixed inset-0 z-40 bg-[rgba(22,19,31,.35)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="drawer fixed top-0 right-0 bottom-0 z-41 flex flex-col bg-surface-0 text-[14px] text-ink shadow-[-20px_0_60px_rgba(22,19,31,.25)]"
        style={{ width: `min(${width}px, 100vw)` }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
