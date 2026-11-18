import { followedSet } from '@/lib/favorites';
import { getCurrentStudent } from '@/lib/auth/student';
import { type BrowseContext } from '@/lib/catalog/browse';
import { cachedFacets } from '@/lib/catalog/cached';
import { readFilters } from '@/lib/catalog/filters';
import type { Params } from '@/lib/pagination';
import { getDomains } from '@/lib/queries/catalog';
import { ActiveFilters, FacetsShell, type FacetGroup } from './Facets';
import { CompareProvider, loadPage, pickedFromUrl, ProgramList } from './ProgramBrowser';

/**
 * The parcours of a mention or of a university: one list,
 * 20 per page, with the search inside the context, the useful facets and their counts, the sorts
 * (best rated by default) and « Comparer », in the Explorer cards. No grouped view any more: an
 * old `?vue=groupe` or `?vue=liste` is simply ignored.
 */
const LIST = { perPage: 20, choices: [20] } as const;
const nf = new Intl.NumberFormat('fr-FR');

export async function ContextBrowser({
  ctx,
  pathname,
  sp,
  facetGroups,
  searchPlaceholder,
  title,
}: {
  ctx: BrowseContext;
  pathname: string;
  sp: Params;
  facetGroups: FacetGroup[];
  searchPlaceholder: string;
  /** Title of the list; « Les n parcours » by default. */
  title?: string;
}) {
  const filters = readFilters(sp);
  const [facets, domains, student, picked, { result, page, perPage }] = await Promise.all([
    cachedFacets(filters, ctx),
    getDomains(),
    getCurrentStudent(),
    pickedFromUrl(sp),
    loadPage(filters, ctx, sp, pathname, LIST),
  ]);
  const domainList = domains.map((d) => ({ slug: d.slug, name: d.name }));
  return (
    <CompareProvider initial={picked}>
      <section aria-labelledby="liste-titre" className="flex flex-col gap-4">
        <h2
          id="liste-titre"
          className="m-0 font-display text-[clamp(30px,4vw,40px)] font-extrabold tracking-[-0.03em]"
        >
          {title ?? `Les ${nf.format(result.total)} parcours`}
        </h2>
        <div className="flex items-start gap-6 max-lg:flex-col max-lg:items-stretch">
          <FacetsShell
            facets={facets}
            filters={filters}
            domains={domainList}
            groups={facetGroups}
            searchPlaceholder={searchPlaceholder}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <ActiveFilters facets={facets} filters={filters} domains={domainList} />
            <ProgramList
              result={result}
              page={page}
              perPage={perPage}
              opts={LIST}
              pathname={pathname}
              sp={sp}
              titleId="liste-parcours"
              title="Parcours de la liste"
              followed={await followedSet(student)}
              loggedIn={!!student}
              sorts={['pertinence', 'notes', 'avis', 'az']}
            />
          </div>
        </div>
      </section>
    </CompareProvider>
  );
}
