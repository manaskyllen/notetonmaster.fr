import type { Metadata } from 'next';
import Link from 'next/link';
import { GuidesBrowser, type BrowserGuide } from '@/components/guides/GuidesBrowser';
import { formIcons } from '@/components/home/HomeSearchStatic';
import { Container } from '@/components/public/PageShell';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { CLIENT_SEARCH_MAX } from '@/lib/articles/model';
import { publishedGuides } from '@/lib/articles/queries';
import { pageSlice, readGuideParams, searchGuides } from '@/lib/articles/search';
import { pageHref, type Params } from '@/lib/pagination';
import { seoMetadata } from '@/lib/seo/meta';

const TITLE = 'Guides pour choisir son master, ville par ville';
const DESCRIPTION =
  'Les masters de chaque ville, la sélectivité, l’alternance, le calendrier Mon Master : des guides écrits par l’équipe, avec des chiffres mis à jour.';

/**
 * Indexing: the bare list and its pages are indexable, each with its own canonical (?page=2);
 * a filtered version (q, ville, sujet) is noindex, its canonical the list at the same page
 * without the filters.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const p = readGuideParams(await searchParams);
  const filtered = !!(p.q || p.city || p.subject);
  return seoMetadata({
    title: p.page > 1 ? `${TITLE} · page ${p.page}` : TITLE,
    description: DESCRIPTION,
    canonical: pageHref('/guides', {}, p.page),
    noindex: filtered,
  });
}

/**
 * Index of the guides (ArticlesIndex mockup, 24): rendered on the server from the address
 * (/guides?q=alternance&ville=dijon&sujet=alternance&page=2), so it works without JavaScript and
 * every search has its address; then the island filters in the browser. Up to CLIENT_SEARCH_MAX
 * guides the browser gets them all, beyond only the page (the search stays on the server).
 */
export default async function GuidesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const p = readGuideParams(sp);
  const all = await publishedGuides();
  const results = searchGuides(all, p);
  const client = all.length <= CLIENT_SEARCH_MAX;
  const pick = (g: (typeof all)[number]): BrowserGuide => ({
    slug: g.slug,
    title: g.title,
    lede: g.lede,
    theme: g.theme,
    city: g.city,
    searchKeywords: g.searchKeywords,
    minutes: g.minutes,
  });
  const counts = new Map<string, { slug: string; name: string; count: number }>();
  for (const g of all)
    if (g.city) {
      const c = counts.get(g.city.slug) ?? { ...g.city, count: 0 };
      c.count++;
      counts.set(g.city.slug, c);
    }
  const icons = formIcons();
  return (
    <main>
      <Container className="flex max-w-[1028px]! flex-col gap-7 pt-7 pb-20">
        <Breadcrumb structured items={[{ label: 'Accueil', href: '/' }, { label: 'Guides' }]} />
        <header className="flex flex-col gap-3">
          <h1 className="m-0 font-display text-[clamp(38px,5.4vw,58px)] leading-none font-extrabold tracking-[-0.035em]">
            Guides pour choisir son master
          </h1>
          <p className="m-0 max-w-[660px] text-[19px] leading-normal text-ink-soft">
            L’offre de chaque ville, la sélectivité, l’alternance, le calendrier. Les chiffres
            viennent de Mon Master et se mettent à jour à chaque session.
          </p>
        </header>
        <GuidesBrowser
          key={JSON.stringify(p)}
          guides={client ? all.map(pick) : pageSlice(results, p.page).map(pick)}
          total={results.length}
          mode={client ? 'client' : 'server'}
          initial={p}
          cities={[...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))}
          icons={{
            search: icons.search,
            clear: icons.clear,
            pin: icons.pin,
            chevron: icons.chevron,
          }}
        />
        <p className="m-0 border-t border-border pt-6 text-[15px] text-ink-soft">
          Les guides ne remplacent pas les avis. Tu es en master dans l’une de ces villes ?{' '}
          <Link href="/avis/nouveau" className="font-bold text-violet-700">
            Raconte comment ça se passe →
          </Link>
        </p>
      </Container>
    </main>
  );
}
