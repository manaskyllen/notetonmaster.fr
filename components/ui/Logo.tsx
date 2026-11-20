import { HoverLink } from './HoverLink';
import { cn } from '@/lib/cn';

export type LogoTone = 'light' | 'dark' | 'coral' | 'mono' | 'outline';
export type LogoSize = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface LogoProps {
  href?: string;
  /** light (default) · dark (on night or violet-500) · coral (on coral-300) · mono · outline */
  tone?: LogoTone;
  /** s 20px · m 24px (site header) · l 44px · xl 96px. Never narrower than 120px. */
  size?: LogoSize;
  /** App icon: "m" on a tilted lime square (xs = 16px dark favicon version). */
  iconOnly?: boolean;
  className?: string;
}

const WORD_SIZE: Record<LogoSize, string> = {
  xs: 'text-[20px]',
  s: 'text-[20px]',
  m: 'text-[24px]',
  l: 'text-[44px]',
  xl: 'text-[96px]',
};

const TONE_WORD: Record<LogoTone, string> = {
  light: 'text-ink',
  dark: 'text-on-night',
  coral: 'text-on-lime',
  mono: 'text-ink',
  outline: 'text-ink',
};

const TONE_BLOCK: Record<LogoTone, string> = {
  light: 'bg-lime-400 text-on-lime',
  dark: 'bg-lime-400 text-on-lime',
  coral: 'bg-night text-lime-400',
  mono: 'bg-ink text-surface-0',
  outline: 'bg-transparent text-current shadow-[inset_0_0_0_0.07em_currentColor]',
};

const ICON_SIZE: Record<LogoSize, string> = {
  xs: 'size-4 rounded-[4px] text-[12px] bg-[#16131f] text-[#d4f75a] rotate-0',
  s: 'size-6 rounded-[6px] text-[18px] rotate-0',
  m: 'size-12 rounded-[13px] text-[36px]',
  l: 'size-24 rounded-[26px] text-[72px]',
  xl: 'size-24 rounded-[26px] text-[72px]',
};

/** The notetonmaster logotype, version B "Surligneur". The only source of the logo. */
export function Logo({ href, tone = 'light', size = 'm', iconOnly, className }: LogoProps) {
  const a11y = href
    ? { 'aria-label': 'notetonmaster, accueil' }
    : ({ role: 'img', 'aria-label': 'notetonmaster' } as const);

  const content = iconOnly ? (
    <span aria-hidden="true" className="-mt-[0.17em]">
      m
    </span>
  ) : (
    <>
      <span aria-hidden="true">
        note<span className="ml-[0.14em]">ton</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'ml-[0.07em] inline-block -rotate-3 rounded-[0.32em] px-[0.26em] pt-[0.02em] pb-[0.14em]',
          TONE_BLOCK[tone],
        )}
      >
        master
      </span>
    </>
  );

  const cls = iconOnly
    ? cn(
        'inline-flex -rotate-3 items-center justify-center bg-lime-400 font-display leading-none font-extrabold text-on-lime no-underline',
        ICON_SIZE[size],
        className,
      )
    : cn(
        'inline-flex items-center font-display leading-[1.1] font-extrabold tracking-[-0.045em] whitespace-nowrap no-underline',
        WORD_SIZE[size],
        TONE_WORD[tone],
        className,
      );

  if (href)
    return (
      <HoverLink href={href} className={cls} {...a11y}>
        {content}
      </HoverLink>
    );
  return (
    <span className={cls} {...a11y}>
      {content}
    </span>
  );
}
