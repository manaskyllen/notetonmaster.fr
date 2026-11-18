import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name (required: the button has no visible text). */
  label: string;
  variant?: 'soft' | 'night';
}

export function IconButton({ icon, label, variant = 'soft', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-tap flex-none cursor-pointer items-center justify-center rounded-sm border-0 disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'night' ? 'bg-night text-on-night' : 'bg-surface-100 text-ink',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
