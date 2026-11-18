import { cn } from '@/lib/cn';

export interface RadioCardProps extends Omit<React.ComponentProps<'input'>, 'type' | 'children'> {
  children: React.ReactNode;
  labelClassName?: string;
}

/** Native radio (20px, accent violet) in a card label; violet-100 when chosen. */
export function RadioCard({ children, labelClassName, className, ...input }: RadioCardProps) {
  return (
    <label className={cn('nm-radio-card', labelClassName)}>
      <input type="radio" {...input} className={cn('nm-radio', className)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
