import Link from 'next/link';
import { cityPageHref } from '@/lib/launch/href';
import { openCitiesLine } from '@/lib/launch/line';
import type { OpenZone } from '@/lib/launch/zones';

/**
 * Under the search of the home: one line in a white pill, whatever the number of
 * open cities, after a pin on a lime square tilted −3°. The names (the cities with the most
 * masters, never one without) lead to the page of that city (/masters/{ville}), underlined in lime; the link at the
 * end leads to /universites. It comes in once (`zone`).
 */
export function OpenCitiesLine({ zones }: { zones: OpenZone[] }) {
  if (!zones.length) return null;
  const l = openCitiesLine(zones);
  return (
    <nav aria-label="Villes ouvertes">
      <p className="zone m-0 mt-0.5 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 rounded-pill border-[1.5px] border-border bg-surface-0 py-2 pr-4 pl-2 text-[15px] text-ink-muted max-sm:rounded-[20px]">
        <span
          aria-hidden="true"
          className="inline-flex size-7.5 flex-none -rotate-3 items-center justify-center rounded-[10px] bg-lime-400"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16131f"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
        </span>
        <span>
          {l.intro}{' '}
          {l.shown.map((z, i) => (
            <span key={z.slug}>
              <Link
                href={cityPageHref(z.slug)}
                className="font-bold text-ink decoration-lime-400 decoration-[3px] underline-offset-[3px] hover:text-ink"
              >
                {z.name}
              </Link>
              {l.seps[i]}
            </span>
          ))}
          {l.rest}
        </span>{' '}
        <Link href="/universites" className="text-[14px] font-bold whitespace-nowrap">
          {l.link} →
        </Link>
      </p>
    </nav>
  );
}
