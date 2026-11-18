import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

export interface TagProps {
  fill?: boolean;
  icon?: IconName;
  children?: React.ReactNode;
  className?: string;
}

export function Tag({ fill, icon, children, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[14px]',
        fill
          ? 'border-transparent bg-violet-100 font-semibold text-violet-700'
          : 'border-border bg-surface-0 font-medium text-ink',
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}
