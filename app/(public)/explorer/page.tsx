import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container } from '@/components/public/PageShell';
import { ActiveFilters, FacetsShell, type FacetGroup } from '@/components/catalog/Facets';
import {
  CompareProvider,
  loadPage,
  pickedFromUrl,
  ProgramList,
} from '@/components/catalog/ProgramBrowser';
import { followedSet } from '@/lib/favorites';
import { getCurrentStudent } from '@/lib/auth/student';
import { cachedFacets } from '@/lib/catalog/cached';
import { readFilters } from '@/lib/catalog/filters';
import { prisma } from '@/lib/db';
import { NotYetOpen } from '@/components/launch/OpenCities';
import { cachedOpenZones } from '@/lib/launch/cached';
import { notYetPlace } from '@/lib/launch/places';
import { pageHref, type Params } from '@/lib/pagination';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { inCities, pagedSeoTitle, plainTitle } from '@/lib/seo/titles';
import { getDomains } from '@/lib/queries/catalog';

export const dynamic = 'force-dynamic';

const LIST = { perPage: 24, choices: [24, 48, 96] } as const;
const GROUPS: FacetGroup[] = [
  'q',
  'avis',
  'domaine',
  'mention',
  'lieu',
  'etab',
  'type',
  'modalite',
  'entree',
  'acces',
  'places',
];

/** Only /explorer without any parameter is indexable; filters, sorts, searches and pages: noindex, follow. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [sp, zones] = await Promise.all([searchParams, cachedOpenZones()]);
  const { canonical, noindex, page } = listIndexing('/explorer', sp, { strict: true });
  const where = zones.length ? ` ${inCities(zones.map((z) => z.name))}` : '';
  return seoMetadata({
    title: pagedSeoTitle(plainTitle(`Explorer les masters${where}`), page),
    description: `Filtre, trie et compare les parcours de master des universités publiques${where}, avec les avis des étudiant·es et les chiffres d’admission.`,
    canonical,
    noindex,
  });
}

export default async function ExplorerPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  // Former link of the ⌘K palette (?ville=nantes): now a place filter (commune INSEE code).
  if (typeof sp.ville === 'string' && sp.ville) {
    const city = await prisma.city.findUnique({
      where: { slug: sp.ville },
      select: { inseeCode: true },
    });
    const { ville: _v, ...rest } = sp;
    void _v;
    redirect(
      pageHref('/explorer', rest, 1, {
        lieu: city?.inseeCode ? `insee:${city.inseeCode}` : `nom:${sp.ville}`,
      }),
    );
  }
  const filters = readFilters(sp);
  // Results and facets in parallel; the facets follow the typo fallback when it happens.
  const [{ result, page, perPage }, plainFacets, domains, student, picked, notYet] =
    await Promise.all([
      loadPage(filters, {}, sp, '/explorer', LIST),
      cachedFacets(filters, {}),
      getDomains(),
      getCurrentStudent(),
      pickedFromUrl(sp),
      // « Lyon »: a city not open yet, said rather than an empty list
      filters.q.trim() ? notYetPlace(filters.q) : null,
    ]);
  const facets = result.fuzzy ? await cachedFacets(filters, {}, { fuzzy: true }) : plainFacets;
  const followed = await followedSet(student);
  const domainList = domains.map((d) => ({ slug: d.slug, name: d.name }));
  return (
    <main>
      <Container className="flex flex-col gap-6 pt-10 pb-20">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[clamp(36px,5vw,56px)] leading-none font-extrabold tracking-[-0.035em]">
            Explorer les masters
          </h1>
          <p className="m-0 text-body-l text-ink-muted">
            Filtre, trie, et coche jusqu’à 3 parcours à comparer.
          </p>
        </div>
        <CompareProvider initial={picked}>
          <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
            {/* The facet groups are h3: an h2 above them keeps the outline without a jump. */}
            <h2 className="sr-only">Filtres</h2>
            <FacetsShell
              facets={facets}
              filters={filters}
              domains={domainList}
              groups={GROUPS}
              searchPlaceholder="Mot-clé : patrimoine, médiation…"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <ActiveFilters facets={facets} filters={filters} domains={domainList} />
              {notYet && <NotYetOpen place={notYet.place} />}
              <ProgramList
                result={result}
                page={page}
                perPage={perPage}
                opts={LIST}
                pathname="/explorer"
                sp={sp}
                titleId="explorer-resultats"
                title="Parcours"
                followed={followed}
                loggedIn={!!student}
                empty={notYet ? <></> : undefined}
              />
              <p className="m-0 text-caption text-ink-muted">
                Sources : Mon Master (données ouvertes du ministère, dernière session publiée) ;
                annuaire des établissements de l’enseignement supérieur.
              </p>
            </div>
          </div>
        </CompareProvider>
      </Container>
    </main>
  );
}
