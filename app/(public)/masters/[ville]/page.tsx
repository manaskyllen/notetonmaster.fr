import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContextBrowser } from '@/components/catalog/ContextBrowser';
import { LinkLine } from '@/components/catalog/LinkLine';
import type { FacetGroup } from '@/components/catalog/Facets';
import { Container, SourceLine } from '@/components/public/PageShell';
import { Breadcrumb, Icon } from '@/components/ui';
import { getCityOverview } from '@/lib/catalog/cities';
import type { Params } from '@/lib/pagination';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';
import { cityDescription, cityIntro, cityTitle, cutWords } from '@/lib/seo/titles';

const nf = new Intl.NumberFormat('fr-FR');
/** Mentions named in the header line (the most furnished); the others: the mentions index. */
const TOP_MENTIONS = 6;
const FACETS: FacetGroup[] = [
  'q',
  'avis',
  'domaine',
  'mention',
  'etab',
  'lieu',
  'modalite',
  'entree',
  'acces',
];

/** Same rules as a mention: the bare list (and its pages) indexable, filtered variants not. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ ville: string }>;
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [{ ville }, sp] = await Promise.all([params, searchParams]);
  const c = await getCityOverview(ville);
  if (!c) return { title: 'Ville introuvable', robots: { index: false } };
  const { canonical, noindex, page } = listIndexing(`/masters/${c.zone.slug}`, sp);
  const description = cityDescription({
    name: c.zone.name,
    programs: c.programs,
    universities: c.universities.length,
    reviews: c.reviews,
    topMentions: c.mentions.map((m) => m.name),
  });
  return seoMetadata({
    title: cityTitle({ name: c.zone.name, programs: c.programs, page }),
    description: page > 1 ? cutWords(`Page ${page} · ${description}`, 170) : description,
    canonical,
    noindex,
    image: {
      path: ogImagePath('ville', c.zone.slug, [c.zone.name, c.programs, c.reviews]),
      alt: `Les masters à ${c.zone.name} sur notetonmaster`,
    },
  });
}

/**
 * « Les masters à Strasbourg »: a page per open city (lib/catalog/cities.ts), built like the
 * mention and university pages. Header, a line of the main mentions and one of the
 * establishments, then every parcours of the city with the same
 * filters and list as a mention (best rated first).
 */
export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ ville: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ ville }, sp] = await Promise.all([params, searchParams]);
  const c = await getCityOverview(ville);
  if (!c) notFound();
  const name = c.zone.name;
  return (
    <main>
      <Container className="flex flex-col gap-7 pt-7 pb-20">
        <Breadcrumb structured items={[{ label: 'Accueil', href: '/' }, { label: name }]} />

        <section className="relative flex flex-wrap items-end justify-between gap-7 overflow-hidden rounded-xl bg-violet-500 p-10 text-on-violet max-sm:p-6">
          <div
            aria-hidden="true"
            className="absolute -top-15 -right-15 size-65 rounded-pill bg-lime-400 opacity-90 max-sm:-top-20 max-sm:-right-20 max-sm:size-36"
          />
          <div className="relative flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <span className="self-start rounded-pill bg-white px-3 py-1.5 text-[12px] font-bold tracking-[0.05em] text-[#3b23b8] uppercase">
              Ville ouverte
            </span>
            <h1 className="m-0 font-display text-[clamp(36px,5vw,64px)] leading-none font-extrabold tracking-[-0.035em]">
              Les masters à {name}
            </h1>
            <p className="m-0 flex max-w-[640px] items-center gap-2 text-[18px] leading-[1.5]">
              <Icon name="pin" size={20} />
              {cityIntro({
                programs: c.programs,
                universities: c.universities.length,
                reviews: c.reviews,
              })}
              .
            </p>
          </div>
        </section>

        {/* Two short lines: the main mentions (to the city × mention page, or to the only
            parcours) with the whole list on /mentions?ville=, and the establishments. The list
            below filters by mention too. */}
        <nav aria-label={`Parcourir les masters à ${name}`} className="flex flex-col gap-1.5">
          <LinkLine
            label="Les plus proposées :"
            items={c.mentions.slice(0, TOP_MENTIONS).map((m) => ({
              href: m.onlySlug ? `/parcours/${m.onlySlug}` : `/masters/${c.zone.slug}/${m.slug}`,
              label: m.name,
              count: m.programs,
            }))}
            more={[
              {
                href: `/mentions?ville=${c.zone.slug}`,
                label: `Les ${nf.format(c.mentions.length)} mentions à ${name}`,
              },
            ]}
          />
          <LinkLine
            label="Établissements :"
            items={c.universities.map((u) => ({
              href: `/universites/${u.slug}`,
              label: u.name,
              count: u.programs,
            }))}
          />
        </nav>

        <ContextBrowser
          ctx={{ zoneSlug: c.zone.slug }}
          pathname={`/masters/${c.zone.slug}`}
          sp={sp}
          facetGroups={FACETS}
          searchPlaceholder={`Chercher dans les ${nf.format(c.programs)} parcours de ${name}…`}
        />
        <SourceLine className="-mt-3">
          Établissements publics, parcours publiés dans l’intercommunalité de {name}. Sources : Mon
          Master, annuaire de l’enseignement supérieur.
        </SourceLine>
      </Container>
    </main>
  );
}
