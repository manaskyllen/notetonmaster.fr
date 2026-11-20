import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';
import { buttonClasses, CtaArrow, type ButtonSize, type ButtonVariant } from './button-classes';

export {
  buttonClasses,
  ctaClasses,
  CtaArrow,
  type ButtonSize,
  type ButtonVariant,
} from './button-classes';

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  /** Call to action: arrow → after the label, lift and nudge. */
  cta?: boolean;
  /** Sending: a 16px spinner turns before the label, which stays. */
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export type ButtonProps = Common &
  (
    | ({ href: string; prefetch?: boolean } & Omit<
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
        'href'
      >)
    | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  );

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'm',
    icon,
    iconRight,
    cta,
    loading,
    className,
    children,
    ...rest
  } = props;
  const cls = buttonClasses(variant, size, cn(cta && 'nm-cta', className));
  const kids = (
    <>
      {loading ? (
        <span className="nm-spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={18} />
      )}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
      {cta && <CtaArrow />}
    </>
  );
  if ('href' in rest && rest.href !== undefined) {
    const { href, ...a } = rest as { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <Link href={href} className={cls} {...a}>
        {kids}
      </Link>
    );
  }
  const b = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type="button"
      className={cls}
      aria-busy={loading || undefined}
      {...b}
      disabled={b.disabled || loading}
    >
      {kids}
    </button>
  );
}
