import { cn } from '@/lib/cn';

export const formCardClass = 'nm-form-card';

/** White card holding a form: radius 28px, padding 28px, 22px between blocks. */
export function FormCard({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={cn(formCardClass, className)} />;
}

/** Bottom bar: 1px top border, "Retour" on the left, main action on the right. */
export function FormNav({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('nm-form-nav', className)} />;
}

/** "Ton avis apparaîtra ainsi" block (surface-50, radius 18px, padding 16px). */
export function FormPreview({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('nm-form-preview', className)} />;
}

/** Step title: Bricolage 800, clamp(32px, 5vw, 46px), −0.03em. */
export function StepTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      {...rest}
      className={cn(
        'm-0 font-display text-[clamp(32px,5vw,46px)] leading-[1.05] font-extrabold tracking-[-0.03em]',
        className,
      )}
    />
  );
}
