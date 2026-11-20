import { cn } from '@/lib/cn';

/**
 * Draws a stroke icon from its parts: 2 px, round caps, 24 grid, currentColor.
 * Part syntax: "C cx cy r" circle, "E cx cy rx ry" ellipse, "R x y w h rx" rect, otherwise a path.
 * Icon (components/ui/Icon.tsx) gives it a name from the whole set; the layout gives it the few
 * glyphs of components/ui/glyphs.ts.
 */
export interface GlyphProps {
  parts: readonly string[];
  size?: number;
  strokeWidth?: number;
  /** When set, the icon carries meaning and gets role="img". Otherwise it is decorative. */
  label?: string;
  className?: string;
}

export function Glyph({ parts, size = 20, strokeWidth = 2, label, className }: GlyphProps) {
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <svg
      className={cn('inline-block flex-none align-middle', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
    >
      {parts.map((p, i) => {
        const kind = p.charAt(0);
        const n = p.slice(1).trim().split(' ').map(Number);
        if (kind === 'C') return <circle key={i} cx={n[0]} cy={n[1]} r={n[2]} />;
        if (kind === 'E') return <ellipse key={i} cx={n[0]} cy={n[1]} rx={n[2]} ry={n[3]} />;
        if (kind === 'R')
          return <rect key={i} x={n[0]} y={n[1]} width={n[2]} height={n[3]} rx={n[4]} />;
        return <path key={i} d={p} />;
      })}
    </svg>
  );
}
