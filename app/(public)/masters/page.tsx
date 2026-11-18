import type { Metadata } from 'next';
import { CitiesBrowser } from '@/components/catalog/CitiesBrowser';
import { Container } from '@/components/public/PageShell';
import { Breadcrumb } from '@/components/ui';
import { CITY_SORTS, regionSlug, type CitySort } from '@/lib/catalog/index-labels';
import { cityIndex } from '@/lib/catalog/indexes';
import type { Params } from '@/lib/pagination';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { inCities } from '@/lib/seo/titles';

const nf = new Intl.NumberFormat('fr-FR');

/** Filters of the list (?q=, ?region=, ?tri=): noindex, follow, canonical /masters. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [sp, { entries }] = await Promise.all([searchParams, cityIndex()]);
  const { noindex } = listIndexing('/masters', sp);
  const programs = entries.reduce((n, c) => n + c.masters, 0);
  return seoMetadata({
    title: `Les masters par ville : ${nf.format(entries.length)} villes ouvertes | notetonmaster`,
    description: `Les ${nf.format(programs)} parcours de master des universités publiques ${inCities(entries.map((c) => c.name))}, ville par ville : mentions, établissements et avis d’étudiant·es.`,
    canonical: '/masters',
    noindex,
  });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Every open city with a published master, one card each (VillesIndex mockup), from the figures
 * denormalised on LaunchZone; filters and sorts in the browser. Linked from the footer
 * (« Toutes les villes ») when it lists only the first ones.
 */
export default async function CitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [sp, { entries, domains }] = await Promise.all([searchParams, cityIndex()]);
  const tri = one(sp.tri);
  const region = one(sp.region);
  return (
    <main>
      <Container className="flex flex-col gap-5.5 pt-7 pb-10">
        <Breadcrumb structured items={[{ label: 'Accueil', href: '/' }, { label: 'Villes' }]} />
        <CitiesBrowser
          entries={entries}
          domains={domains}
          initial={{
            q: one(sp.q).slice(0, 120),
            region: entries.some((e) => e.region && regionSlug(e.region) === region)
              ? region
              : null,
            tri: CITY_SORTS.some((s) => s.id === tri) ? (tri as CitySort) : 'masters',
          }}
        />
      </Container>
    </main>
  );
}
