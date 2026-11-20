import { HoverLink } from '@/components/ui/HoverLink';
import {
  cityReviewsShown,
  domainShares,
  plural,
  type CityEntry,
  type DomainLegend,
} from '@/lib/catalog/index-labels';
import { IndexRating } from './IndexRating';

/** Colours of the national domains, those of the home tiles. */
const TONE: Record<string, string> = {
  violet: 'var(--violet-500)',
  lime: 'var(--lime-400)',
  coral: 'var(--coral-300)',
  night: 'var(--night)',
};
export const domainTone = (t: string) => TONE[t] ?? TONE.violet!;

const nf = new Intl.NumberFormat('fr-FR');

/**
 * The card of an open city (VillesIndex mockup), on /masters and on the home (« Pars de ta
 * ville »): name and region, number of masters, bar of the domains, establishments, rating from 3
 * reviews. The whole card is the link (the name, stretched), to the page of the city. Server-safe.
 */
export function CityCard({
  city: c,
  domains,
  delay,
}: {
  city: CityEntry;
  domains: DomainLegend[];
  delay: number;
}) {
  const shares = domainShares(c.domains, domains);
  const shown = cityReviewsShown(c.reviews, c.avg);
  return (
    <div
      className="vc relative flex w-full flex-col gap-3.5 rounded-[22px] border-[1.5px] border-border bg-surface-0 p-5 text-ink"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* The name is the link (its visible text is in its label); its ::after covers the
              whole card. */}
          <HoverLink
            href={`/masters/${c.slug}`}
            aria-label={`Masters à ${c.name} : ${plural(c.masters, 'parcours', 'parcours')}, ${plural(c.reviews, 'avis', 'avis')}`}
            className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.025em] text-ink no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[22px] after:content-[''] hover:text-ink"
          >
            {c.name}
          </HoverLink>
          {c.region && <span className="text-[13px] text-ink-muted">{c.region}</span>}
        </div>
        <span
          aria-hidden="true"
          className="go flex size-[38px] flex-none items-center justify-center rounded-[12px] bg-surface-100 text-ink"
        >
          <svg
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
        </span>
      </div>
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
          {nf.format(c.masters)}
        </span>
        <span className="text-[15px] font-semibold text-ink-muted">
          {c.masters > 1 ? 'masters' : 'master'}
        </span>
      </p>
      {shares.length > 0 && (
        <div
          role="img"
          aria-label={`Répartition par domaine : ${shares.map((s) => `${s.name} ${s.pct} %`).join(', ')}`}
          className="flex h-2.5 gap-0.5 overflow-hidden rounded-pill"
        >
          {shares.map((s, k) => (
            <span
              key={s.slug}
              className="seg"
              style={{
                flex: `${s.n} 1 0`,
                background: domainTone(s.tone),
                animationDelay: `${120 + 60 * k}ms`,
              }}
            />
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-surface-100 pt-3">
        <span className="text-[13px] text-ink-muted">
          {plural(c.establishments, 'établissement public', 'établissements publics')}
        </span>
        {shown === 'grade' ? (
          <IndexRating avg={c.avg} reviews={c.reviews} />
        ) : shown === 'count' ? (
          <span className="text-[13px] text-ink-muted">{plural(c.reviews, 'avis', 'avis')}</span>
        ) : (
          <span className="text-[13px] text-ink-muted">Pas encore d’avis</span>
        )}
      </div>
    </div>
  );
}
