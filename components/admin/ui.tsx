import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/cn';

/** Admin page header: kicker, title, actions. */
export function AdminHeader({
  kicker,
  title,
  actions,
  children,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {kicker && <span className="text-[13px] text-ink-muted">{kicker}</span>}
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em] max-sm:text-[30px]">
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-3.5 rounded-lg border border-border bg-surface-0 p-5',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="m-0 font-display text-[22px] font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const PILL = {
  ok: 'bg-success-bg text-success',
  info: 'bg-violet-100 text-violet-700',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-danger-bg text-danger',
  muted: 'bg-surface-100 text-ink-muted',
  running: 'bg-violet-100 text-violet-700',
} as const;

/** Small status pill (label + dot), never color alone. */
export function Pill({
  tone,
  children,
  hollow,
  pulse,
}: {
  tone: keyof typeof PILL;
  children: React.ReactNode;
  hollow?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill py-1 pr-2.5 pl-2 text-[12px] font-bold whitespace-nowrap',
        PILL[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-pill',
          hollow ? 'box-content size-1.5 border-2 border-current' : 'size-2 bg-current',
          pulse && 'animate-[nm-pulse_1.2s_ease-in-out_infinite] motion-reduce:animate-none',
        )}
      />
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'brand';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-[20px] p-4.5',
        tone === 'brand' ? 'bg-violet-500 text-on-violet' : 'border border-border bg-surface-0',
      )}
    >
      <span
        className={cn(
          'text-[13px] font-medium',
          tone === 'brand' ? 'opacity-90' : 'text-ink-muted',
        )}
      >
        {label}
      </span>
      <span className="font-display text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </span>
      {hint && (
        <span className={cn('text-[12px]', tone === 'brand' ? '' : 'text-ink-muted')}>{hint}</span>
      )}
    </div>
  );
}

/** Urgency of a problem or a subject, the same on every admin screen. */
export const URGENCY = {
  block: { label: 'Bloquant', pill: 'bg-danger-bg text-danger', bar: 'bg-[#ff8a73]' },
  high: { label: 'Important', pill: 'bg-warning-bg text-warning', bar: 'bg-[#f2c230]' },
  low: {
    label: 'À faire',
    pill: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
    bar: 'bg-[#b9b3c8]',
  },
} as const;
export type UrgencyKey = keyof typeof URGENCY;

/** Problems of a fiche (pastilles of the list, cards of the drawer). */
export const ISSUE_TONE = {
  CONFLICT: 'bg-warning-bg text-warning',
  COLLECT_ERROR: 'bg-danger-bg text-danger',
  NO_PROGRAM: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
  OLD_PROGRAM: 'bg-warning-bg text-warning',
  NO_UAI: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
} as const;

/** Compact pill of the redesigned admin (11 px, bold). */
export function Tag({
  className,
  children,
  upper,
}: {
  className?: string;
  children: React.ReactNode;
  upper?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.25 rounded-pill px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        upper && 'text-[10px] tracking-[0.04em] uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Kind of a fiche: Parcours (violet), Mention (lime), Établissement (coral). */
export const KIND_TAG = {
  PROGRAM: { label: 'Parcours', cls: 'bg-violet-100 text-violet-700' },
  MENTION: { label: 'Mention', cls: 'bg-lime-100 text-lime-800' },
  UNIVERSITY: { label: 'Établissement', cls: 'bg-coral-100 text-coral-800' },
} as const;

/** Publication of a fiche. */
export const PUBLICATION_TAG = {
  pub: { label: 'Publiée', cls: 'bg-success-bg text-success' },
  off: { label: 'Hors ville ouverte', cls: 'bg-surface-100 text-ink-muted' },
  draft: { label: 'Brouillon', cls: 'bg-warning-bg text-warning' },
} as const;

/** White card of the redesigned admin screens. */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { className?: string }) {
  return (
    <section
      {...rest}
      className={cn('min-w-0 rounded-[18px] border border-border bg-surface-0', className)}
    >
      {children}
    </section>
  );
}

/** Thin progress bar of a table cell (completeness, programmes found). */
export function MiniBar({ pct, tone }: { pct: number; tone?: 'auto' | 'violet' }) {
  const color =
    tone === 'violet'
      ? 'bg-violet-500'
      : pct >= 80
        ? 'bg-success'
        : pct >= 50
          ? 'bg-[#c99a00]'
          : 'bg-danger';
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-100">
        <span
          className={cn('block h-full', color)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="w-11 text-right whitespace-nowrap text-[#3b3648] tabular-nums dark:text-ink-muted">
        {pct} %
      </span>
    </span>
  );
}

/** Header cell of the compact admin tables. */
export const TH =
  'border-b border-border bg-surface-subtle px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] whitespace-nowrap text-ink-muted uppercase';
/** Body cell of the compact admin tables. */
export const TD = 'border-b border-surface-100 px-3 py-2.25 align-middle';
