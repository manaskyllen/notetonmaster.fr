import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'example' | 'success';

const TONE: Record<NoticeTone, { box: string; icon: string }> = {
  example: {
    box: 'border-[1.5px] border-dashed border-border-control bg-surface-0',
    icon: 'text-ink',
  },
  info: { box: 'bg-violet-100', icon: 'text-violet-700' },
  warning: { box: 'bg-warning-bg', icon: 'text-warning' },
  danger: { box: 'bg-danger-bg', icon: 'text-danger' },
  success: { box: 'bg-success-bg', icon: 'text-success' },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Notice({ tone = 'info', title, children, className }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-md px-4 py-3.5 text-[14px] leading-[1.5] text-ink',
        t.box,
        className,
      )}
    >
      <Icon
        name={
          tone === 'warning' || tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'info'
        }
        size={20}
        className={cn('mt-px', t.icon)}
      />
      <div className="min-w-0">
        {title ? <span className="block font-bold">{title}</span> : null}
        {children}
      </div>
    </div>
  );
}

/** Standard notice shown wherever demo (fictitious) data appears. */
export function DemoNotice({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Notice tone="example" title="Exemple" className={className}>
      {children ?? 'Ces avis et comptes sont fictifs : ils servent à la démonstration du site.'}
    </Notice>
  );
}
