import { HoverLink } from '@/components/ui/HoverLink';
import type { HomeZone } from '@/lib/home/data';
import { QUICK_FILTERS, zoneLieu, type Quick } from '@/lib/home/form';
import { openCitiesLine } from '@/lib/launch/line';

/**
 * The parts of the home search that need no state, rendered by the server and placed by the
 * island (HomeSearch): their markup is not part of the JavaScript of the page.
 */

/** Without JavaScript, « Où ? » is the native list of the open cities. */
export function WhereFallback({
  zones,
  city,
  labelledBy,
}: {
  zones: HomeZone[];
  city: string | null;
  labelledBy: string;
}) {
  return (
    <select
      name="lieu"
      aria-labelledby={labelledBy}
      defaultValue={city ? zoneLieu(city) : ''}
      className="nm-nojs-only min-h-11 w-full rounded-[12px] border-[1.5px] border-border-control bg-surface-0 px-2 font-sans text-[16px] font-semibold text-ink"
    >
      <option value="">Toutes les villes</option>
      {zones.map((z) => (
        <option key={z.slug} value={zoneLieu(z.slug)}>
          {z.name}
        </option>
      ))}
    </select>
  );
}

/** Without JavaScript, each quick filter is a checkbox with its Explorer parameter. */
export function quickFallbacks(quick: Quick) {
  return Object.fromEntries(
    QUICK_FILTERS.map((f) => [
      f.key,
      <label
        key={f.key}
        className="tg nm-nojs-only border-[#d7d3e0] bg-surface-0 dark:border-border-control"
      >
        <input
          type="checkbox"
          name={f.param}
          value={f.value}
          defaultChecked={quick[f.key]}
          className="size-4.5 accent-violet-500"
        />
        {f.label}
      </label>,
    ]),
  ) as Record<(typeof QUICK_FILTERS)[number]['key'], React.ReactNode>;
}

/**
 * « Déjà ouvert à A, B et C » under the search, in plain text (no frame), after a pin on a lime
 * square tilted −3°. Each city is a submit button of the form: without JavaScript it opens the
 * Explorer of that city; with it, the island catches the click (data-city) and fills « Où ? ».
 */
export function CityLine({ zones }: { zones: HomeZone[] }) {
  if (!zones.length) return null;
  const line = openCitiesLine(zones);
  return (
    <div
      role="group"
      aria-label="Villes ouvertes"
      className="zone m-0 mt-2 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[15px] text-ink-soft"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 flex-none -rotate-3 items-center justify-center rounded-[8px] bg-lime-400"
      >
        <svg
          width="13"
          height="13"
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
        {line.intro}{' '}
        {line.shown.map((z, i) => (
          <span key={z.slug}>
            <button
              type="submit"
              name="lieu"
              value={zoneLieu(z.slug)}
              data-city={z.slug}
              aria-label={`Choisir ${z.name}`}
              className="inline cursor-pointer border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-ink underline decoration-lime-400 decoration-[3px] underline-offset-[3px]"
            >
              {z.name}
            </button>
            {line.seps[i]}
          </span>
        ))}
        {line.rest}
      </span>{' '}
      <HoverLink href={line.href} className="text-[14px] font-bold whitespace-nowrap">
        {line.link} →
      </HoverLink>
    </div>
  );
}

const svg = (size: number, width: number, paths: React.ReactNode, className = 'flex-none') => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {paths}
  </svg>
);

/** The static SVG of the form (search, clear, pin, chevron, arrow, tick), drawn here. */
export function formIcons() {
  return {
    search: svg(
      22,
      2.2,
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>,
      'flex-none text-ink',
    ),
    clear: svg(16, 2.4, <path d="M6 6l12 12M18 6L6 18" />),
    pin: svg(
      20,
      2.2,
      <>
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>,
    ),
    chevron: svg(14, 2.6, <path d="M6 9l6 6 6-6" />),
    arrow: svg(18, 2.6, <path d="M5 12h14M13 6l6 6-6 6" />, 'nm-cta-arr flex-none'),
    check: (
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--on-lime)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    ),
  };
}
