import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContextBrowser } from '@/components/catalog/ContextBrowser';
import { LinkLine } from '@/components/catalog/LinkLine';
import type { FacetGroup } from '@/components/catalog/Facets';
import { Container, SourceLine } from '@/components/public/PageShell';
import { Breadcrumb } from '@/components/ui';
import { getCityMention } from '@/lib/catalog/cities';
import type { Params } from '@/lib/pagination';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';
import {
  cityMentionDescription,
  cityMentionIntro,
  cityMentionTitle,
  deMention,
  cutWords,
} from '@/lib/seo/titles';

const nf = new Intl.NumberFormat('fr-FR');
const FACETS: FacetGroup[] = ['q', 'avis', 'etab', 'lieu', 'modalite', 'entree', 'acces'];

type P = Promise<{ ville: string; mention: string }>;

/** Same rules as a mention: the bare list (and its pages) indexable, filtered variants not. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: P;
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [{ ville, mention }, sp] = await Promise.all([params, searchParams]);
  const c = await getCityMention(ville, mention);
  if (!c) return { title: 'Page introuvable', robots: { index: false } };
  const f = {
    city: c.zone.name,
    mention: c.mention.name,
    programs: c.programs.length,
    universities: c.universities,
    reviews: c.reviews,
  };
  const { canonical, noindex, page } = listIndexing(
    `/masters/${c.zone.slug}/${c.mention.slug}`,
    sp,
  );
  const description = cityMentionDescription(f);
  return seoMetadata({
    title: cityMentionTitle({ ...f, page }),
    description: page > 1 ? cutWords(`Page ${page} · ${description}`, 170) : description,
    canonical,
    noindex,
    image: {
      path: ogImagePath('ville', `${c.zone.slug}--${c.mention.slug}`, [f.programs, f.reviews]),
      alt: `Masters ${deMention(c.mention.name)} à ${c.zone.name}`,
    },
  });
}

/**
 * « Masters de droit à Nantes »: only when the city has at least 2 published parcours of the
 * mention (lib/catalog/cities.ts), else 404. Built like the mention page: header, the other open
 * cities that teach the mention and the national mention, then the parcours with the same filters
 * and list (best rated first).
 */
export default async function CityMentionPage({
  params,
  searchParams,
}: {
  params: P;
  searchParams: Promise<Params>;
}) {
  const [{ ville, mention }, sp] = await Promise.all([params, searchParams]);
  const c = await getCityMention(ville, mention);
  if (!c) notFound();
  const city = c.zone.name;
  const de = deMention(c.mention.name);
  return (
    <main>
      <Container className="flex flex-col gap-7 pt-7 pb-20">
        <Breadcrumb
          structured
          items={[
            { label: 'Accueil', href: '/' },
            { label: city, href: `/masters/${c.zone.slug}` },
            { label: c.mention.name },
          ]}
        />

        <section className="flex flex-wrap items-end justify-between gap-7 rounded-xl bg-lime-400 p-10 text-on-lime max-sm:p-6">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <span className="self-start rounded-pill bg-[#16131f] px-3 py-1.5 text-[12px] font-bold tracking-[0.05em] text-[#d4f75a] uppercase">
              Mention nationale · {city}
            </span>
            <h1 className="m-0 font-display text-[clamp(32px,5vw,58px)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
              Masters {de} à {city}
            </h1>
            <p className="m-0 max-w-[680px] text-[18px] leading-[1.5]">
              {cityMentionIntro({
                city,
                mention: c.mention.name,
                programs: c.programs.length,
                universities: c.universities,
                reviews: c.reviews,
              })}
            </p>
          </div>
        </section>

        <nav aria-label={`${c.mention.name} dans les autres villes`}>
          <LinkLine
            label="Aussi à :"
            items={c.otherCities.map((o) => ({
              href: `/masters/${o.slug}/${c.mention.slug}`,
              label: o.name,
              count: o.programs,
            }))}
            more={[
              { href: `/mentions/${c.mention.slug}`, label: 'Toutes les villes' },
              { href: `/masters/${c.zone.slug}`, label: `Toutes les mentions à ${city}` },
            ]}
          />
        </nav>

        <ContextBrowser
          ctx={{ zoneSlug: c.zone.slug, mentionId: c.mention.id }}
          pathname={`/masters/${c.zone.slug}/${c.mention.slug}`}
          sp={sp}
          facetGroups={FACETS}
          searchPlaceholder={`Chercher dans les ${nf.format(c.programs.length)} parcours…`}
        />
        <SourceLine className="-mt-3">
          Établissements publics, parcours publiés dans l’intercommunalité de {city}. Sources : Mon
          Master, France compétences.
        </SourceLine>
      </Container>
    </main>
  );
}
