import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContextBrowser } from '@/components/catalog/ContextBrowser';
import { LinkLine } from '@/components/catalog/LinkLine';
import type { FacetGroup } from '@/components/catalog/Facets';
import { Container } from '@/components/public/PageShell';
import { Breadcrumb } from '@/components/ui';
import type { Params } from '@/lib/pagination';
import { getMention } from '@/lib/queries/catalog';
import { mentionCities } from '@/lib/catalog/cities';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';
import { mentionDescription, mentionTitle, cutWords } from '@/lib/seo/titles';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('fr-FR');
const FACETS: FacetGroup[] = [
  'q',
  'avis',
  'etab',
  'lieu',
  'type',
  'modalite',
  'entree',
  'acces',
  'places',
];

/**
 * Indexable without filters (each page of the list with its own canonical); a filter, a sort or
 * a search inside the mention: noindex, follow, canonical to the mention.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const m = await getMention(slug);
  if (!m) return { title: 'Mention introuvable', robots: { index: false } };
  const cities = await mentionCities(m.id, m.slug);
  const { canonical, noindex, page } = listIndexing(`/mentions/${m.slug}`, sp);
  const description = mentionDescription({
    name: m.name,
    programs: m.figures.programs,
    universities: m.figures.universities,
    reviews: m.reviewCount,
    cities: cities.map((c) => c.name),
  });
  return seoMetadata({
    title: mentionTitle({
      name: m.name,
      programs: m.figures.programs,
      cities: cities.map((c) => c.name),
      page,
    }),
    description: page > 1 ? cutWords(`Page ${page} · ${description}`, 170) : description,
    canonical,
    noindex,
    image: {
      path: ogImagePath('mention', m.slug, [
        m.name,
        m.avgRating,
        m.reviewCount,
        m.figures.programs,
      ]),
      alt: `Master ${m.name} sur notetonmaster`,
    },
  });
}

export default async function MentionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const m = await getMention(slug);
  if (!m) notFound();
  const cities = await mentionCities(m.id, m.slug);
  return (
    <main>
      <Container className="flex flex-col gap-7 pt-7 pb-20">
        <Breadcrumb
          structured
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Mentions', href: '/mentions' },
            { label: m.name },
          ]}
        />

        <section className="flex flex-wrap items-end justify-between gap-7 rounded-xl bg-lime-400 p-10 text-on-lime max-sm:p-6">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <span className="self-start rounded-pill bg-[#16131f] px-3 py-1.5 text-[12px] font-bold tracking-[0.05em] text-[#d4f75a] uppercase">
              Mention nationale
            </span>
            <h1 className="m-0 font-display text-[clamp(36px,5vw,64px)] leading-none font-extrabold tracking-[-0.035em]">
              {m.name}
            </h1>
            <p className="m-0 max-w-[620px] text-[18px] leading-[1.5]">
              Un même diplôme national, mais un contenu différent selon l’université : chaque fac
              crée ses propres parcours.
            </p>
          </div>
        </section>

        {cities.length > 0 && (
          <nav aria-label={`${m.name}, ville par ville`}>
            <LinkLine
              label="Par ville :"
              items={cities.map((c) => ({ href: c.href, label: c.name, count: c.programs }))}
            />
          </nav>
        )}

        <ContextBrowser
          ctx={{ mentionId: m.id }}
          pathname={`/mentions/${m.slug}`}
          sp={sp}
          facetGroups={FACETS}
          searchPlaceholder={`Chercher dans les ${nf.format(m.figures.programs)} parcours de ${m.name}…`}
        />
      </Container>
    </main>
  );
}
