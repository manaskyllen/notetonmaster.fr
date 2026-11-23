import Link from 'next/link';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { JsonLd } from '@/components/seo/JsonLd';
import { truncateMiddle } from '@/lib/domain/truncate';

export interface BreadcrumbProps {
  items: { label: string; href?: string }[];
  /** Public pages: also a BreadcrumbList (JSON-LD) built from the same items. */
  structured?: boolean;
}

/** A label cut in the middle when too long; the full one in the tooltip and for screen readers. */
function Label({ text }: { text: string }) {
  const short = truncateMiddle(text);
  if (short === text) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true" title={text}>
        {short}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

export function Breadcrumb({ items, structured }: BreadcrumbProps) {
  return (
    <nav aria-label="Fil d’Ariane">
      {structured && (
        <JsonLd data={{ '@context': 'https://schema.org', ...breadcrumbJsonLd(items) }} />
      )}
      <ol className="flex flex-wrap items-center gap-2 text-[14px] text-ink-muted max-sm:gap-y-6">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {last || !it.href ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? 'font-semibold text-ink' : undefined}
                >
                  <Label text={it.label} />
                </span>
              ) : (
                <Link href={it.href} className="nm-hit text-ink-muted">
                  <Label text={it.label} />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
