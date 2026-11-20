import type { Metadata } from 'next';
import { CityCard } from '@/components/catalog/CityCard';
import { DomainTiles } from '@/components/home/DomainTiles';
import { HomeReviews } from '@/components/home/HomeReviews';
import { HomeSearch } from '@/components/home/HomeSearch';
import {
  CityLine,
  formIcons,
  quickFallbacks,
  WhereFallback,
} from '@/components/home/HomeSearchStatic';
import { Container } from '@/components/public/PageShell';
import { CtaArrow, ctaClasses } from '@/components/ui/Button';
import { HoverLink } from '@/components/ui/HoverLink';
import { Icon, type IconName } from '@/components/ui/Icon';
import { SLOGAN_HIGHLIGHT, SLOGAN_LEAD } from '@/lib/brand/copy';
import { homeData, REVIEWS_MIN } from '@/lib/home/data';
import { firstReviewCities, NO_QUICK, QUICK_FILTERS, type Quick } from '@/lib/home/labels';
import { suggestCount } from '@/lib/home/suggest';
import type { Params } from '@/lib/pagination';
import { cachedSearch } from '@/lib/search-guard';
import { seoMetadata } from '@/lib/seo/meta';

/**
 * Home (MainV2 mockup): the hero and its guided search, the latest reviews (from 3 published),
 * the domains, the cities, the call to give a review. Everything visible is rendered here, on the
 * server, from cached and denormalised reads (lib/home/data.ts); the only client island is the
 * search form, whose suggestions load at the first interaction.
 *
 * Indexable without parameters only: `?q=`, `?ville=`… (old links, the search kept in the
 * address) are noindex, follow, and the canonical never carries a parameter.
 */

/** « avis » + « master » first, then the brand (docs/seo/audit.md); no count, no city. */
const HOME_TITLE = 'Avis sur les masters : programmes, admission | notetonmaster';
const HOME_DESCRIPTION =
  'Avis d’étudiant·es sur chaque parcours de master des universités publiques, avec son programme et son admission. Compare, puis donne ton avis.';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const withParams = Object.values(sp).some((v) => v !== undefined && v !== '');
  return seoMetadata({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonical: '/',
    noindex: withParams,
  });
}

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Sections below the fold: rendered by the browser when they come near the screen. */
const BELOW = '[content-visibility:auto]';

export default async function HomePage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, data] = await Promise.all([searchParams, homeData()]);
  const { zones, reviews } = data;

  // The search kept in the address (old links /?q=…, back from the Explorer): the form starts
  // from it. Same parameters as the Explorer, ?ville= being the slug of an open city.
  const q = one(sp.q).slice(0, 120);
  const villeParam = one(sp.ville) || one(sp.lieu).replace(/^zone:/, '');
  const city = zones.some((z) => z.slug === villeParam) ? villeParam : null;
  const quick: Quick = { ...NO_QUICK };
  for (const f of QUICK_FILTERS) quick[f.key] = one(sp[f.param]).split(',').includes(f.value);
  const count = q.trim()
    ? await cachedSearch(
        `h:c:${q.trim().toLowerCase()}:${city ?? ''}:${JSON.stringify(quick)}`,
        () => suggestCount({ q: q.trim(), city, quick }),
      )
    : null;

  const hasReviews = reviews.total >= REVIEWS_MIN && reviews.items.length > 0;
  const names = zones.map((z) => z.name);
  const now = new Date();

  return (
    <main>
      <Container className="hero flex flex-col items-center gap-4.5 pt-18 pb-14 text-center max-sm:pt-10 max-sm:pb-10">
        <h1 className="m-0 max-w-[900px] font-display text-[clamp(38px,5.4vw,68px)] leading-[1.02] font-extrabold tracking-[-0.035em]">
          {SLOGAN_LEAD}{' '}
          <span className="rounded-[16px] bg-lime-400 px-3 text-on-lime [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">
            {SLOGAN_HIGHLIGHT}
          </span>
        </h1>
        <p className="m-0 max-w-[720px] text-[19px] leading-normal text-balance text-ink-muted max-sm:text-[17px]">
          Programmes, admission et vrais retours d’étudiant·es, parcours par parcours.
        </p>
        <HomeSearch
          zones={zones}
          counts={data.counts}
          frequent={data.frequent}
          tries={data.tries}
          domains={data.domains.map((d) => ({ slug: d.slug, name: d.name, tone: d.tone }))}
          initial={{ q, city, quick, count }}
          fallback={{
            where: <WhereFallback zones={zones} city={city} labelledBy="home-wl" />,
            quick: quickFallbacks(quick),
            line: <CityLine zones={zones} />,
            icons: formIcons(),
          }}
        />
      </Container>

      {hasReviews && <HomeReviews items={reviews.items} now={now} />}

      <section
        aria-labelledby="t-dom"
        className={`mx-auto max-w-page px-6 pb-18 max-sm:px-4 ${BELOW} [contain-intrinsic-size:auto_330px] max-sm:[contain-intrinsic-size:auto_800px]`}
      >
        <DomainTiles
          domains={data.domains}
          zones={zones.map((z) => ({ slug: z.slug, name: z.name }))}
          initialCity={city}
          icons={Object.fromEntries(
            data.domains.map((d) => [
              d.slug,
              {
                tile: <Icon name={d.icon as IconName} size={34} strokeWidth={1.8} />,
                soon: <Icon name={d.icon as IconName} size={20} strokeWidth={1.8} />,
              },
            ]),
          )}
        />
      </section>

      {data.cities.length > 0 && (
        <section
          aria-labelledby="t-ville"
          className={`mx-auto max-w-page px-6 pb-18 max-sm:px-4 ${BELOW} [contain-intrinsic-size:auto_420px] max-sm:[contain-intrinsic-size:auto_1300px]`}
        >
          <div className="mb-4.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col gap-1.5">
              <h2 id="t-ville" className="m-0 font-display text-h2 max-sm:text-[32px]">
                Pars de ta ville
              </h2>
              <p className="m-0 text-[17px] text-ink-muted">
                On ouvre ville par ville, pour des fiches justes et assez d’avis dans chacune.
              </p>
            </div>
            <HoverLink href="/masters" className="text-[15px] font-bold">
              {data.cities.length > 4
                ? `Voir les ${data.cities.length} villes`
                : 'Toutes les villes'}{' '}
              →
            </HoverLink>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3.5 p-0">
            {data.cities.slice(0, 4).map((c, i) => (
              <li key={c.slug} className="flex">
                <CityCard city={c} domains={data.legend} delay={i * 40} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="t-cta"
        className={`mx-auto max-w-page px-6 pb-6 max-sm:px-4 ${BELOW} [contain-intrinsic-size:auto_300px]`}
      >
        {hasReviews ? (
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-[32px] bg-night px-10 py-12 text-on-night max-sm:px-6 max-sm:py-8">
            <div className="flex max-w-[640px] flex-col gap-2.5">
              <h2 id="t-cta" className="m-0 font-display text-h2 max-sm:text-[30px]">
                Tu es en master ? <span className="text-lime-400">Aide la promo d’après.</span>
              </h2>
              <p className="m-0 text-[17px] leading-normal text-on-night-muted">
                5 minutes, sans compte. Ton nom n’apparaît jamais, et chaque avis est relu avant
                publication.
              </p>
            </div>
            <HoverLink href="/avis/nouveau" className={ctaClasses('lime', 'l', 'text-[17px]')}>
              Donner mon avis
              <CtaArrow />
            </HoverLink>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-7 rounded-[32px] bg-night px-10 py-12 text-on-night max-sm:px-6 max-sm:py-8">
            <div className="flex max-w-[660px] flex-col gap-3">
              <span className="-rotate-2 self-start rounded-[10px] bg-lime-400 px-3 pt-1 pb-[5px] text-[14px] font-bold text-on-lime">
                Les premiers avis arrivent
              </span>
              <h2 id="t-cta" className="m-0 font-display text-h2 max-sm:text-[30px]">
                Ici, tu liras ce qu’en disent les étudiant·es.{' '}
                <span className="text-lime-400">Et si tu commençais ?</span>
              </h2>
              <p className="m-0 text-[17px] leading-normal text-on-night-muted">
                Tu as fait ton master {firstReviewCities(names)} ? Ton avis sera parmi les premiers,
                et les suivant·es le liront avant de candidater. 5 minutes, sans compte, ton nom
                n’apparaît jamais.
              </p>
            </div>
            <HoverLink href="/avis/nouveau" className={ctaClasses('lime', 'l', 'text-[17px]')}>
              Donner le premier avis
              <CtaArrow />
            </HoverLink>
          </div>
        )}
      </section>
    </main>
  );
}
