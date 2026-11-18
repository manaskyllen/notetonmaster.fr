import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Badge, type Kind } from './Badge';
import { Icon } from './Icon';

const ICON_BG: Record<Kind, string> = {
  parcours: 'bg-violet-100 text-violet-700',
  mention: 'bg-lime-100 text-lime-800',
  universite: 'bg-coral-100 text-coral-800',
  ville: 'bg-warning-bg text-warning',
};

const ICON = {
  parcours: 'parcours',
  mention: 'mention',
  universite: 'universite',
  ville: 'pin',
} as const;

export interface ResultRowProps {
  kind: Kind;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href: string;
  /** Under the subtitle: « Trouvé par … » label. */
  extra?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ResultRow({
  kind,
  title,
  subtitle,
  href,
  extra,
  className,
  style,
}: ResultRowProps) {
  return (
    <Link
      href={href}
      style={style}
      className={cn(
        'nm-lift flex items-center gap-4.5 rounded-[20px] border border-border bg-surface-0 px-5 py-4.5 text-ink no-underline max-sm:gap-3 max-sm:px-4',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-13 flex-none items-center justify-center rounded-md max-sm:size-11',
          ICON_BG[kind],
        )}
      >
        <Icon name={ICON[kind]} size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-display text-[19px] font-bold">
          {title}
          <Badge kind={kind} />
        </span>
        {subtitle ? <span className="text-[14px] text-ink-muted">{subtitle}</span> : null}
        {extra}
      </span>
      <Icon name="arrow" size={22} strokeWidth={2.2} />
    </Link>
  );
}
