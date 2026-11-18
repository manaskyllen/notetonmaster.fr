import { cn } from '@/lib/cn';

export interface CheckboxCardProps extends Omit<
  React.ComponentProps<'input'>,
  'type' | 'children' | 'title'
> {
  /** Bold first line. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * `card` (bordered, violet when checked), `tint` (violet-100, no border: "Obtenir le badge"),
   * `plain` (no box: charter acknowledgement).
   */
  variant?: 'card' | 'tint' | 'plain';
  labelClassName?: string;
}

/** Native 22px checkbox (accent violet) inside a clickable card label. */
export function CheckboxCard({
  title,
  children,
  variant = 'card',
  labelClassName,
  className,
  ...input
}: CheckboxCardProps) {
  return (
    <label
      className={cn(
        'nm-check-card',
        variant === 'tint' && 'nm-check-card--tint',
        variant === 'plain' && 'nm-check-card--plain',
        labelClassName,
      )}
    >
      <input type="checkbox" {...input} className={cn('nm-checkbox', className)} />
      <span className="min-w-0">
        {title && <strong>{title}</strong>}
        {title && children ? <br /> : null}
        {children}
      </span>
    </label>
  );
}
