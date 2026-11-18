import Link from 'next/link';

const nf = new Intl.NumberFormat('fr-FR');

/**
 * One line of links under a header (city and mention pages): « Aussi à : Marseille (30) ·
 * Lyon (29) · Toutes les villes → ». Short labels, a count in grey, then the « all » links.
 */
export function LinkLine({
  label,
  items,
  more = [],
}: {
  label: string;
  items: { href: string; label: string; count?: number }[];
  /** Links after the list (« Toutes les mentions à Nantes → »), in bold. */
  more?: { href: string; label: string }[];
}) {
  if (!items.length && !more.length) return null;
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1.5 text-[15px] leading-[1.6]">
      <span className="font-semibold">{label}</span>
      {items.map((it, i) => (
        <span key={it.href} className="inline-flex items-baseline gap-1">
          <Link href={it.href} className="font-semibold">
            {it.label}
          </Link>
          {it.count != null && (
            <span className="text-[13px] text-ink-muted">({nf.format(it.count)})</span>
          )}
          {(i < items.length - 1 || more.length > 0) && (
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
          )}
        </span>
      ))}
      {more.map((m, i) => (
        <span key={m.href} className="inline-flex items-baseline gap-1">
          <Link href={m.href} className="font-bold whitespace-nowrap">
            {m.label} →
          </Link>
          {i < more.length - 1 && (
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
          )}
        </span>
      ))}
    </p>
  );
}
