import Link from 'next/link';
import { Fragment } from 'react';
import { BrandName } from '@/components/ui/BrandName';
import { shortLede, themeInfo } from '@/lib/articles/model';
import type { GuideItem } from '@/lib/articles/queries';
import type { ArticleTheme } from '@/lib/db/generated/enums';

/** Pieces of the guide pages (ArticlePublic and ArticlesIndex mockups), server components. */

const nf = new Intl.NumberFormat('fr-FR');

/** « note ton master » (or « notetonmaster ») in a short text: the logo in text. */
export function withBrandSpaced(text: string) {
  const parts = text.split(/note ton master|notetonmaster/gi);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && <BrandName />}
    </Fragment>
  ));
}

/** Theme label at its color (« Guide », « Sélectivité »…). */
export function ThemeTag({ theme, className = '' }: { theme: ArticleTheme; className?: string }) {
  const t = themeInfo(theme);
  return (
    <span
      className={`inline-block rounded-pill px-2.5 py-0.75 text-[12px] font-bold whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg }}
    >
      {t.label}
    </span>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="g-arr flex-none text-[20px]">
      →
    </span>
  );
}

/** « À lire aussi »: one line per guide, separated by rules (no cards). */
export function AlsoRead({ guides }: { guides: GuideItem[] }) {
  if (!guides.length) return null;
  return (
    <nav aria-labelledby="also-read" className="mt-7 flex flex-col">
      <span
        id="also-read"
        className="pb-1.5 text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase"
      >
        À lire aussi
      </span>
      {guides.map((g) => (
        <Link key={g.slug} href={`/guides/${g.slug}`} className="g-also">
          <span className="min-w-[92px] flex-none">
            <ThemeTag theme={g.theme} />
          </span>
          <span className="g-also__t min-w-0 flex-1 font-display text-[20px] leading-[1.25] font-bold">
            {g.title}
          </span>
          <Arrow />
        </Link>
      ))}
    </nav>
  );
}

export interface CityCardData {
  slug: string;
  name: string;
  programs: number;
  establishments: number;
  veryselective: number;
  selective: number;
  accessible: number;
}

/** Card of the city of a guide: its parcours, its selectivity, a link to its page. */
export function CityCard({ c, className = '' }: { c: CityCardData; className?: string }) {
  const known = c.veryselective + c.selective + c.accessible;
  return (
    <section
      aria-label={`Masters à ${c.name}`}
      className={`flex flex-col gap-3.5 rounded-[22px] border border-border bg-surface-0 p-4.5 ${className}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase">
          Masters à {c.name}
        </span>
        <span className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-[34px] leading-none font-extrabold tracking-[-0.03em]">
            {nf.format(c.programs)}
          </span>
          <span className="font-display text-[18px] font-bold">parcours</span>
        </span>
        <span className="text-[13px] text-ink-muted">
          dans {nf.format(c.establishments)} établissement{c.establishments > 1 ? 's' : ''} public
          {c.establishments > 1 ? 's' : ''}
        </span>
      </div>
      {known > 0 && (
        <div className="flex flex-col gap-1.5">
          <span
            role="img"
            aria-label={`${c.veryselective} très sélectifs, ${c.selective} sélectifs, ${c.accessible} accessibles`}
            className="g-bar h-1.5! gap-0.5!"
          >
            <span className="g-bar__tres" style={{ flex: c.veryselective }} />
            <span className="g-bar__sel" style={{ flex: c.selective }} />
            <span className="g-bar__acc" style={{ flex: c.accessible }} />
          </span>
          <span className="flex justify-between gap-2 text-[11px] text-ink-muted">
            <span>{nf.format(c.veryselective)} très sélectifs</span>
            <span>{nf.format(c.accessible)} accessibles</span>
          </span>
        </div>
      )}
      <Link
        href={`/masters/${c.slug}`}
        className="g-citycard__go flex min-h-11 items-center justify-between gap-2 rounded-pill bg-night px-4 text-[14px] font-bold text-on-night no-underline"
      >
        Voir les {nf.format(c.programs)} masters
        <span aria-hidden="true" className="g-arr">
          →
        </span>
      </Link>
    </section>
  );
}

/** For a guide about every city: the page of the cities. */
export function CitiesLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/masters"
      className={`g-citycard__go flex min-h-11 items-center justify-between gap-2 rounded-[18px] border border-border bg-surface-0 px-4.5 py-3.5 text-[15px] font-bold text-ink no-underline ${className}`}
    >
      Les masters ville par ville
      <span aria-hidden="true" className="g-arr">
        →
      </span>
    </Link>
  );
}

/** Lines of guides (section of the city pages): theme, title, short chapô, reading time. */
export function GuideList({ guides }: { guides: GuideItem[] }) {
  return (
    <ul className="m-0 list-none border-t border-border p-0">
      {guides.map((g) => (
        <li key={g.slug}>
          <Link href={`/guides/${g.slug}`} className="g-row">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <ThemeTag theme={g.theme} className="self-start" />
              <span className="g-row__t font-display text-[21px] leading-[1.2] font-bold">
                {g.title}
              </span>
              <span className="text-[15px] leading-normal text-ink-muted">{shortLede(g.lede)}</span>
            </span>
            <span className="flex-none text-[13px] text-ink-muted">
              {g.minutes} min <Arrow />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
