import { redirect } from 'next/navigation';
import {
  EmptyState,
  PageSummary,
  Pagination,
  PerPageChoice,
  SearchCapNotice,
} from '@/components/ui';
import { type BrowseContext, type BrowseResult } from '@/lib/catalog/browse';
import { cachedBrowse } from '@/lib/catalog/cached';
import { SORTS, type Filters } from '@/lib/catalog/filters';
import { prisma } from '@/lib/db';
import { outOfRange, pageCount, pageHref, readPage, type Params } from '@/lib/pagination';
import { FollowButton } from '@/components/public/FollowButton';
import { SourceLine } from '@/components/public/PageShell';
import { CompareProvider, CompareToggle } from './CompareSelection';
import { ProgramCard } from './ProgramCard';
import { SortSelect } from './SortSelect';
import { BrandName } from '@/components/ui/BrandName';

/**
 * The filterable list of parcours, with an imposed context: a mention, a university,
 * or nothing (Explorer). Server-paginated (?page, ?parPage), sorted (?tri), the Compare selection
 * kept across pages. Facets and the grouped view are passed by the page (slots).
 */
export interface ListOptions {
  perPage: number;
  choices: readonly number[];
}

export async function loadPage(
  filters: Filters,
  ctx: BrowseContext,
  sp: Params,
  pathname: string,
  opts: ListOptions,
): Promise<{ result: BrowseResult; page: number; perPage: number }> {
  const { page, perPage, offset } = readPage(sp, { perPage: opts.perPage, choices: opts.choices });
  const result = await cachedBrowse(filters, ctx, { offset, limit: perPage });
  const beyond = outOfRange(page, result.reachable, perPage);
  if (beyond && result.total > 0) redirect(pageHref(pathname, sp, beyond));
  return { result, page, perPage };
}

/** Programs ticked for comparison in the URL (?comparer=slug,slug), with their titles. */
export async function pickedFromUrl(sp: Params) {
  const raw = Array.isArray(sp.comparer) ? sp.comparer[0] : sp.comparer;
  const slugs = (raw ?? '').split(',').filter(Boolean).slice(0, 3);
  if (!slugs.length) return [];
  const rows = await prisma.programSearchIndex.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, title: true, shortName: true },
  });
  return slugs
    .map((s) => rows.find((r) => r.slug === s))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ slug: r.slug, title: r.shortName ?? r.title }));
}

export function ProgramList({
  result,
  page,
  perPage,
  opts,
  pathname,
  sp,
  titleId,
  title,
  followed,
  loggedIn,
  sorts = SORTS.map((s) => s.id),
  empty,
}: {
  result: BrowseResult;
  page: number;
  perPage: number;
  opts: ListOptions;
  pathname: string;
  sp: Params;
  titleId: string;
  title: string;
  followed: Set<string>;
  loggedIn: boolean;
  sorts?: string[];
  empty?: React.ReactNode;
}) {
  const hidden = Object.entries(sp)
    .filter(([k, v]) => k !== 'tri' && k !== 'page' && typeof v === 'string' && v)
    .map(([k, v]) => [k, v as string] as [string, string]);
  const capped = result.reachable < result.total && page === pageCount(result.reachable, perPage);
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageSummary
          page={page}
          perPage={perPage}
          total={result.total}
          noun="parcours"
          plural="parcours"
        />
        <div className="flex flex-wrap items-center gap-3">
          {opts.choices.length > 1 && (
            <PerPageChoice
              pathname={pathname}
              params={sp}
              perPage={perPage}
              choices={opts.choices}
              defaultPerPage={opts.perPage}
            />
          )}
          <SortSelect
            pathname={pathname}
            value={result.sort}
            hidden={hidden}
            options={SORTS.filter(
              (s) =>
                sorts.includes(s.id) && (s.id !== 'pertinence' || result.sort === 'pertinence'),
            )}
          />
        </div>
      </div>
      {result.fuzzy && (
        <p className="m-0 text-[14px] text-ink-muted">
          Aucun résultat exact : voici les parcours les plus proches de ta recherche.
        </p>
      )}
      {result.rows.length ? (
        <ul
          aria-label="Parcours de la page"
          key={`${page}|${result.rows[0]?.programId}`}
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3.5 p-0"
        >
          {result.rows.map((p, i) => (
            <ProgramCard
              key={p.programId}
              p={p}
              index={i}
              follow={
                <FollowButton
                  variant="icon"
                  programId={p.programId}
                  title={p.title}
                  initial={followed.has(p.programId)}
                  loggedIn={loggedIn}
                />
              }
              action={<CompareToggle slug={p.slug} title={p.shortName ?? p.title} />}
            />
          ))}
        </ul>
      ) : (
        (empty ?? (
          <EmptyState title="Aucun parcours avec ces filtres">
            Essaie un autre mot-clé ou retire un filtre.
          </EmptyState>
        ))
      )}
      <Pagination
        pathname={pathname}
        params={sp}
        page={page}
        perPage={perPage}
        total={result.reachable}
        targetId={titleId}
      />
      <SearchCapNotice shown={capped} />
      <SourceLine>
        Notes : avis publiés sur <BrandName />. Un parcours sans avis passe en fin de liste quand on
        trie par note.
      </SourceLine>
    </section>
  );
}

export { CompareProvider };
