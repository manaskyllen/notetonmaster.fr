import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

const TONE = {
  violet: 'bg-violet-500 text-on-violet',
  lime: 'bg-lime-400 text-on-lime',
  coral: 'bg-coral-300 text-on-lime',
  night: 'bg-night text-on-night',
} as const;

export interface DomainTileProps {
  title: string;
  tone?: keyof typeof TONE;
  icon?: IconName;
  href: string;
  hint?: React.ReactNode;
  className?: string;
}

export function DomainTile({
  title,
  tone = 'violet',
  icon = 'mention',
  href,
  hint,
  className,
}: DomainTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        'nm-lift flex min-h-[180px] flex-col justify-between gap-4 rounded-lg p-6 no-underline',
        TONE[tone],
        className,
      )}
    >
      <Icon name={icon} size={34} strokeWidth={1.8} />
      <span className="flex flex-col gap-1">
        <span className="font-display text-[26px] leading-[1.1] font-bold max-sm:text-[22px]">
          {title}
        </span>
        {hint ? <span className="text-[14px] font-medium opacity-90">{hint}</span> : null}
      </span>
    </Link>
  );
}
