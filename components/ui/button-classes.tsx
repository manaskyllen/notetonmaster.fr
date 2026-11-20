import { cn } from '@/lib/cn';

/**
 * Classes of the buttons and calls to action, and the arrow of « Donner mon avis », apart from
 * the Button component (components/ui/Button.tsx): the header and the server pages that only
 * style a link need neither Button nor the icon set it draws with.
 */

export type ButtonVariant = 'primary' | 'night' | 'lime' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'm' | 'l' | 'form';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-violet-500 text-on-violet',
  night: 'border-transparent bg-night text-on-night',
  lime: 'border-transparent bg-lime-400 text-on-lime',
  outline: 'border-current bg-transparent text-inherit',
  ghost:
    'border-transparent bg-transparent text-ink underline underline-offset-[3px] font-semibold',
  danger: 'border-transparent bg-danger text-surface-0',
};

const SIZE: Record<ButtonSize, string> = {
  // "s" keeps a 44px hit area through padding on the wrapper (min-h) for touch targets.
  s: 'min-h-tap px-3.5 text-[14px] sm:min-h-9',
  m: 'min-h-tap px-5 text-[15px]',
  l: 'min-h-control-l px-7 text-[16px]',
  // Form actions: 52px, padding 0 24px, Inter 700 16px.
  form: 'min-h-13 px-6 text-[16px]',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'm',
  className?: string,
) {
  return cn(
    'nm-btn-press inline-flex items-center justify-center gap-2 rounded-pill border-2 font-sans font-bold whitespace-nowrap no-underline cursor-pointer',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-40',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

/** The arrow that always follows "Donner mon avis". */
export function CtaArrow() {
  return (
    <svg
      className="nm-cta-arr"
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Classes of a call to action with the arrow: lift on hover, arrow nudge (`.cta`). */
export function ctaClasses(
  variant: ButtonVariant = 'night',
  size: ButtonSize = 'm',
  className?: string,
) {
  return buttonClasses(variant, size, cn('nm-cta', className));
}
