'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/cn';

type Size = 'md' | 'sm';

const TRACK: Record<Size, string> = { md: 'h-8 w-14', sm: 'h-6 w-11' };
const KNOB: Record<Size, string> = { md: 'top-1 size-6', sm: 'top-0.5 size-5' };
/** Left of the knob, off and on: it slides on `left` (.sw / .knob). */
const LEFT: Record<Size, [number, number]> = { md: [4, 28], sm: [2, 22] };

/**
 * True once the switch changed after its first render: the stretch (knob-on / knob-off) plays on
 * a change, not when the page loads.
 */
function useMoved(checked: boolean) {
  const [initial] = useState(checked);
  const [moved, setMoved] = useState(false);
  if (!moved && checked !== initial) setMoved(true);
  return moved;
}

function Knob({ checked, size }: { checked: boolean; size: Size }) {
  return (
    <span
      aria-hidden="true"
      className={cn('knob absolute rounded-pill bg-white', KNOB[size])}
      style={{ left: LEFT[size][checked ? 1 : 0] }}
    />
  );
}

const trackClass = (checked: boolean, size: Size, className?: string) =>
  cn(
    'sw relative inline-block flex-none cursor-pointer rounded-pill border-0 p-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    TRACK[size],
    checked ? 'bg-violet-500' : 'bg-border-control',
    className,
  );

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Accessible name when no visible label is associated. */
  label?: string;
  /** Id of a visible label (instead of `label`). */
  labelledBy?: string;
  disabled?: boolean;
  /** When set, renders a hidden input so the switch works in plain forms. */
  name?: string;
  className?: string;
  id?: string;
  size?: Size;
}

/**
 * On/off switch (role="switch"), the only one of the site (MonEspace:
 * `.sw`, `.knob`). The knob slides with a slight bounce and stretches then tightens at each
 * change, from the side it arrives at; the track fades from one colour to the other; pressed, the
 * knob already stretches; hovered, a discreet violet halo. Nothing moves with reduced motion; a
 * disabled switch has neither halo nor stretch (styles/motion.css). A <button>: Space and Enter
 * toggle it, the focus ring stays. Track violet when on, border-control when off: both ≥ 3:1.
 */
export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  disabled,
  name,
  className,
  id,
  size = 'md',
}: SwitchProps) {
  const moved = useMoved(checked);
  return (
    <>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        disabled={disabled}
        data-moved={moved || undefined}
        onClick={() => onChange?.(!checked)}
        className={trackClass(checked, size, className)}
      >
        <Knob checked={checked} size={size} />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? 'on' : 'off'} /> : null}
    </>
  );
}

/**
 * The same switch as a link, when turning it on or off is a change of address (« Inclure les
 * parcours de l'… » on a university). The visible text inside the link is its label.
 */
export function SwitchLink({
  checked,
  href,
  children,
  className,
  size = 'sm',
}: {
  checked: boolean;
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: Size;
}) {
  const moved = useMoved(checked);
  return (
    <Link
      href={href}
      role="switch"
      aria-checked={checked}
      data-moved={moved || undefined}
      className={cn('sw-link', className)}
    >
      <span aria-hidden="true" className={trackClass(checked, size)}>
        <Knob checked={checked} size={size} />
      </span>
      {children}
    </Link>
  );
}
