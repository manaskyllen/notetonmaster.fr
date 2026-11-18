import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Container } from '@/components/public/PageShell';
import { HomeSearch } from '@/components/public/HomeSearch';
import {
  chipClasses,
  ChipCount,
  CtaArrow,
  ctaClasses,
  DomainTile,
  MatchedBy,
  Pagination,
  ResultRow,
  SearchCapNotice,
  type IconName,
} from '@/components/ui';
import { SITE_DESCRIPTION, SLOGAN_HIGHLIGHT, SLOGAN_LEAD } from '@/lib/brand/copy';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { pagedSeoTitle } from '@/lib/seo/titles';
import { NotYetOpen, OpenCitiesLine } from '@/components/launch/OpenCities';
import { cachedOpenZones } from '@/lib/launch/cached';
import { notYetPlace } from '@/lib/launch/places';
import { zonesLabel } from '@/lib/launch/zones';
import { HOME_PER_PAGE, homeResults, type HomeType } from '@/lib/catalog/home';
import {
  outOfRange,
  pageCount,
  pageHref,
  readPage,
  SEARCH_CAP,
  type Params,
} from '@/lib/pagination';
import { getDomains } from '@/lib/queries/catalog';

type HomeParams = { q?: string; type?: string; page?: string; prive?: string };

/**
 * The home page is indexable without parameters only: a search (?q=), a type or a page of
 * results is noindex, follow.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<HomeParams>;
}): Promise<Metadata> {
  const [sp, zones] = await Promise.all([searchParams, cachedOpenZones()]);
  const { noindex, page } = listIndexing('/', sp as Params, { strict: true });
  const where = zones.length
    ? zones.length > 3
      ? ` dans ${zones.length} villes`
      : ` à ${zonesLabel(zones.map((z) => z.name))}`
    : '';
  const description = `Avis d’étudiant·es, programmes et admission de chaque parcours de master des universités publiques${where}. Compare, puis donne ton avis.`;
  return seoMetadata({
    title: pagedSeoTitle(HOME_TITLE, page),
    description: description.length <= 170 ? description : SITE_DESCRIPTION,
    canonical: noindex || sp.q || sp.type || sp.prive ? pageHref('/', sp as Params, page) : '/',
    noindex: noindex || !!(sp.q || sp.type || sp.prive),
  });
}

/** Proposed in docs/seo/audit.md: what people search (« avis master »), then the brand. */
const HOME_TITLE = 'Avis sur les masters, programmes et admission | notetonmaster';

const TYPES: { id: HomeType; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'parcours', label: 'Parcours' },
  { id: 'mention', label: 'Mentions' },
  { id: 'universite', label: 'Universités' },
];
const nf = new Intl.NumberFormat('fr-FR');
const WORDS = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
/** « trois villes », « 12 villes ». */
const countWord = (n: number) => WORDS[n] ?? nf.format(n);

export const dynamic = 'force-dynamic';

const STEPS = [
  [
    '01',
    'Cherche',
    'Par mot-clé, ville ou fac. Chaque parcours a sa fiche, rattachée à sa mention et à son université.',
  ],
  [
    '02',
    'Compare',
    'Programme, admission, certification : les données publiques (Mon Master, France Compétences) au même endroit.',
  ],
  [
    '03',
    'Lis & partage',
    'Des avis anonymes, relus par l’équipe. Le badge « Parcours vérifié » signale les auteurs qui ont prouvé leur parcours.',
  ],
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<HomeParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 120);
  const type = TYPES.find((t) => t.id === sp.type)?.id ?? 'all';
  const includePrivate = sp.prive === '1';
  const { page } = readPage(sp as Params, { perPage: HOME_PER_PAGE });
  const [res, domains, zones, notYet] = await Promise.all([
    homeResults({ q, type, page, includePrivate }),
    getDomains(),
    cachedOpenZones(),
    q ? notYetPlace(q) : null,
  ]);
  const beyond = outOfRange(page, res.total, HOME_PER_PAGE);
  if (beyond && res.total > 0) redirect(pageHref('/', sp as Params, beyond));
  const params = sp as Params;
  const typeHref = (t: HomeType) => pageHref('/', params, 1, { type: t === 'all' ? null : t });
  const explorerHref = `/explorer${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  const capped =
    !!q && pageCount(res.total, HOME_PER_PAGE) === page && res.counts[type] > SEARCH_CAP;

  return (
    <main>
      <Container className="relative flex flex-col items-center gap-5 pt-18 pb-10 text-center max-sm:pt-10">
        <h1 className="m-0 max-w-[960px] font-display text-[clamp(40px,6vw,76px)] leading-none font-extrabold tracking-[-0.035em]">
          {SLOGAN_LEAD}{' '}
          <span className="rounded-[16px] bg-lime-400 px-3 text-on-lime [-webkit-box-decoration-break:clone] [box-decoration-break:clone]">
            {SLOGAN_HIGHLIGHT}
          </span>
        </h1>
        <p className="m-0 max-w-[640px] text-body-l text-ink-muted">
          Programmes, admission et vrais retours d’étudiant·es, parcours par parcours.
          {zones.length > 0 &&
            ` Pour commencer : les universités publiques ${zones.length > 1 ? `de ${countWord(zones.length)} villes` : `de ${zones[0]!.name}`}.`}
        </p>
        <HomeSearch initialQuery={q} />
        <OpenCitiesLine zones={zones} />

        <section
          id="resultats"
          aria-label="Résultats de recherche"
          className="mt-10 flex w-full scroll-mt-24 flex-col gap-4 text-left"
        >
          <h2 id="resultats-titre" className="sr-only">
            {q ? `Résultats pour « ${q} »` : 'Tout le catalogue'}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filtrer par type" className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Link
                  key={t.id}
                  href={typeHref(t.id)}
                  scroll={false}
                  aria-current={type === t.id ? 'true' : undefined}
                  className={chipClasses(type === t.id)}
                >
                  {t.label}
                  <ChipCount count={res.counts[t.id]} selected={type === t.id} />
                </Link>
              ))}
            </nav>
            <span role="status" className="text-[14px] text-ink-muted">
              {nf.format(res.counts[type])} résultat{res.counts[type] > 1 ? 's' : ''}
            </span>
          </div>
          {notYet && <NotYetOpen place={notYet.place} />}
          {res.rows.length > 0 ? (
            <ul key={`${q}|${type}|${page}`} className="flex flex-col gap-3">
              {res.rows.map((r, i) => (
                <li key={`${r.type}:${r.id}`} data-kind={r.kind}>
                  <ResultRow
                    kind={r.kind}
                    title={r.title}
                    subtitle={r.subtitle}
                    href={r.href}
                    extra={q ? <MatchedBy match={r.matchedBy} /> : undefined}
                    className="nm-drop"
                    style={{ animationDelay: `${Math.min(i, 9) * 55}ms` }}
                  />
                </li>
              ))}
            </ul>
          ) : notYet ? null : (
            <div className="flex flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed border-border-control bg-surface-0 px-6 py-9 text-center">
              <span className="font-display text-[22px] font-bold">Rien pour l’instant…</span>
              <span className="text-[15px] text-ink-muted">
                Essaie un mot plus court, une ville, le nom d’une université ou un n° RNCP.
              </span>
            </div>
          )}
          {res.hiddenPrivate > 0 && (
            <p className="m-0 text-[14px] text-ink-muted">
              {nf.format(res.hiddenPrivate)} parcours d’établissements privés masqués ·{' '}
              <Link href={pageHref('/', params, 1, { prive: '1' })} scroll={false}>
                Afficher
              </Link>
            </p>
          )}
          <Pagination
            pathname="/"
            params={params}
            page={page}
            perPage={HOME_PER_PAGE}
            total={res.total}
            targetId="resultats-titre"
          />
          <SearchCapNotice shown={capped} />
          <Link href={explorerHref} className="self-center text-[15px] font-semibold">
            Voir tout dans Explorer
          </Link>
        </section>
      </Container>

      <Container className="flex flex-col gap-5 pb-18">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="m-0 font-display text-h2 max-sm:text-[32px]">Explorer par domaine</h2>
          <span className="text-[15px] text-ink-muted">
            Les 4 grands domaines nationaux du master
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
          {domains.map((d) => {
            const mention = d.mentions.length === 1 ? d.mentions[0] : null;
            return (
              <DomainTile
                key={d.slug}
                title={d.name}
                tone={d.tone as 'violet' | 'lime' | 'coral' | 'night'}
                icon={d.icon as IconName}
                href={mention ? `/mentions/${mention.slug}` : `/explorer?domaine=${d.slug}`}
                hint={
                  d.mentions.length
                    ? `${d.mentions.length} mention${d.mentions.length > 1 ? 's' : ''}`
                    : 'Bientôt'
                }
              />
            );
          })}
        </div>
      </Container>

      <Container className="pb-18">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8 rounded-xl border border-border bg-surface-0 p-10 max-sm:p-6">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="flex flex-col gap-2.5">
              <span
                aria-hidden="true"
                className="font-display text-[56px] leading-none font-extrabold text-violet-500"
              >
                {n}
              </span>
              <h3 className="m-0 font-display text-[24px] font-bold">{t}</h3>
              <p className="m-0 text-[16px] leading-[1.55] text-ink-muted">{d}</p>
            </div>
          ))}
        </div>
      </Container>

      <Container className="pb-18">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-xl bg-night px-10 py-12 text-on-night max-sm:px-6 max-sm:py-8">
          <div className="flex max-w-[620px] flex-col gap-2.5">
            <h2 className="m-0 font-display text-h2 max-sm:text-[30px]">
              Tu es en master ? <span className="text-lime-400">Aide la promo d’après.</span>
            </h2>
            <p className="m-0 text-[17px] leading-[1.5] text-on-night-muted">
              3 minutes, même sans compte. Ton nom n’apparaît jamais.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/avis/nouveau" className={ctaClasses('lime', 'l', 'text-[17px]')}>
              Donner mon avis
              <CtaArrow />
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
