import { formatGrade } from '@/components/ui/Grade';
import { HoverLink } from '@/components/ui/HoverLink';
import { gradeColor } from '@/lib/domain/rating';
import type { HomeReview } from '@/lib/home/data';
import { AUTHOR_LEVEL, reviewAge } from '@/lib/home/labels';

/**
 * « Ce qu'en disent les étudiant·es »: the three latest reviews, as excerpts. Only what their
 * fiche already shows: the month of publication (as an age), the overall rating, the start of
 * « Les plus », the parcours, its establishment and city, and the level of the author, without
 * the promo. Not marked up as Review (structured data): the fiche carries the reviews. The whole
 * card leads to the reviews of the fiche (its name, stretched).
 */
export function HomeReviews({ items, now }: { items: HomeReview[]; now: Date }) {
  return (
    <section aria-labelledby="t-avis" className="mx-auto max-w-page px-6 pt-8 pb-18 max-sm:px-4">
      <div className="mb-4.5 flex flex-col gap-1.5">
        <h2 id="t-avis" className="m-0 font-display text-h2 max-sm:text-[32px]">
          Ce qu’en disent les étudiant·es
        </h2>
        <p className="m-0 text-[17px] text-ink-muted">
          Les derniers avis publiés, relus par l’équipe, sans filtre marketing.
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-3.5 p-0">
        {items.map((r) => {
          const v = formatGrade(r.rating);
          return (
            <li key={r.id} className="flex">
              <article className="rv relative flex w-full flex-col gap-3.5 rounded-[24px] border border-border bg-surface-0 p-5.5 text-ink">
                <span className="flex items-center justify-between gap-2.5">
                  <span
                    role="img"
                    aria-label={`Note : ${v} sur 5`}
                    style={{ backgroundColor: gradeColor(r.rating, 5) }}
                    className="inline-flex -rotate-3 items-baseline rounded-[10px] px-[9px] pt-[3px] pb-1 font-display text-[20px] leading-tight font-extrabold text-on-lime tabular-nums"
                  >
                    <span aria-hidden="true">{v}</span>
                    <span aria-hidden="true" className="text-[12px] opacity-80">
                      /5
                    </span>
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    Publié {reviewAge(new Date(r.month), now)}
                  </span>
                </span>
                <p className="m-0 text-[16px] leading-[1.55]">« {r.text} »</p>
                <span className="mt-auto flex flex-col gap-0.5 border-t border-surface-100 pt-3">
                  <HoverLink
                    href={`/parcours/${r.programSlug}#avis`}
                    className="text-[15px] font-bold text-ink no-underline after:absolute after:inset-0 after:rounded-[24px] after:content-[''] hover:text-ink"
                  >
                    {r.programTitle}
                    <span className="sr-only"> : lire les avis</span>
                  </HoverLink>
                  <span className="text-[13px] text-ink-muted">
                    {r.where} · {AUTHOR_LEVEL[r.level]}
                  </span>
                </span>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
