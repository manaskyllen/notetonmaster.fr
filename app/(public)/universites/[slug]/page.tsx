import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContextBrowser } from '@/components/catalog/ContextBrowser';
import type { FacetGroup } from '@/components/catalog/Facets';
import { Container, SourceLine } from '@/components/public/PageShell';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { SwitchLink } from '@/components/ui/Switch';
import { sourcesOf } from '@/lib/catalog/browse';
import { NC } from '@/lib/format';
import { pageHref, type Params } from '@/lib/pagination';
import { getUniversity, universityFigures } from '@/lib/queries/catalog';
import { universityCities } from '@/lib/catalog/cities';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageJsonLd, universityJsonLd } from '@/lib/seo/jsonld';
import { listIndexing, seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';
import { universityDescription, universityTitle, cutWords } from '@/lib/seo/titles';

export const dynamic = 'force-dynamic';

/** Same rules as a mention: the bare list (and its pages) indexable, filtered variants not. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const u = await getUniversity(slug);
  if (!u) return { title: 'Université introuvable', robots: { index: false } };
  const ids = [u.id, ...u.children.map((c) => c.id)];
  const [f, cities] = await Promise.all([universityFigures(ids), universityCities(ids)]);
  const { canonical, noindex, page } = listIndexing(`/universites/${u.slug}`, sp);
  const description = universityDescription({
    name: u.name,
    programs: f.programs,
    mentions: f.mentions,
    reviews: f.reviews,
    cities: cities.map((c) => c.name),
  });
  return seoMetadata({
    title: universityTitle({ name: u.name, shortName: u.shortName, programs: f.programs, page }),
    description: page > 1 ? cutWords(`Page ${page} · ${description}`, 170) : description,
    canonical,
    noindex: noindex || u.sector !== 'PUBLIC',
    image: {
      path: ogImagePath('universite', u.slug, [u.name, u.avgRating, u.reviewCount, f.programs]),
      alt: `Les masters de ${u.name} sur notetonmaster`,
    },
  });
}

export default async function UniversitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const u = await getUniversity(slug);
  if (!u) notFound();
  // Paris-Saclay: its établissements-composantes (UVSQ, Évry) included unless asked otherwise.
  const hasChildren = u.children.length > 0;
  const include = hasChildren && sp.inclure !== 'non';
  const ids = [u.id, ...(include ? u.children.map((c) => c.id) : [])];
  const [f, sources, cities] = await Promise.all([
    universityFigures(ids),
    sourcesOf({ universityIds: ids }),
    universityCities([u.id, ...u.children.map((c) => c.id)]),
  ]);
  const facets: FacetGroup[] = [
    'q',
    'avis',
    'domaine',
    'mention',
    'composante',
    ...(include ? (['etab'] as const) : []),
    'lieu',
    'modalite',
    'entree',
    'acces',
  ];
  const childNames = u.children.map((c) => c.shortName ?? c.name).join(' et d’');

  return (
    <main>
      <Container className="flex flex-col gap-7 pt-7 pb-20">
        <Breadcrumb
          structured
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Universités', href: '/universites' },
            { label: u.name },
          ]}
        />

        <section className="relative flex flex-wrap items-end justify-between gap-7 overflow-hidden rounded-xl bg-[#16131f] p-10 text-white max-sm:p-6">
          <div
            aria-hidden="true"
            className="absolute -right-10 -bottom-20 size-70 rounded-pill bg-coral-300"
          />
          <div
            aria-hidden="true"
            className="absolute -top-7.5 right-50 size-30 -rotate-[14deg] rounded-[32px] bg-violet-500 max-sm:hidden"
          />
          <div className="relative flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
            <span className="self-start rounded-pill bg-coral-300 px-3 py-1.5 text-[12px] font-bold tracking-[0.05em] text-[#16131f] uppercase">
              Université
            </span>
            <h1 className="m-0 font-display text-[clamp(40px,6vw,72px)] leading-none font-extrabold tracking-[-0.035em]">
              {u.name}
            </h1>
            <p className="m-0 flex items-center gap-2 text-[18px] text-[#cfcadb]">
              <Icon name="pin" size={20} />
              {u.cities.join(' · ')} · {u.region}
            </p>
          </div>
          {u.website && (
            <div className="relative">
              <a
                href={u.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-13 items-center gap-2 rounded-pill border-2 border-white px-5 text-[15px] font-bold text-white no-underline"
              >
                Site officiel
                <Icon name="external" size={16} />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            </div>
          )}
        </section>

        {u.sector === 'PUBLIC' && (
          <JsonLd
            data={pageJsonLd([
              universityJsonLd({ name: u.name, slug: u.slug, website: u.website, city: u.city }),
            ])}
          />
        )}
        {cities.length > 0 && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px]">
            <span className="font-semibold">Ses masters, ville par ville :</span>
            {cities.map((c) => (
              <Link key={c.slug} href={c.href} className="font-semibold">
                Les masters à {c.name}
              </Link>
            ))}
          </p>
        )}
        {u.parent && (
          <p className="m-0 text-[15px]">
            Établissement-composante de l’
            <Link href={`/universites/${u.parent.slug}`}>{u.parent.name}</Link>.
          </p>
        )}
        {u.sector !== 'PUBLIC' && (
          <p className="m-0 self-start rounded-pill bg-coral-100 px-3 py-1.5 text-[13px] font-bold text-coral-800">
            Établissement privé
          </p>
        )}

        <section
          aria-label="Chiffres clés"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3.5"
        >
          <StatCard label="Parcours" value={f.programs} />
          <StatCard label="Mentions" value={f.mentions} />
          <StatCard label="Places (cumulées)" value={f.places ?? NC} />
          <StatCard
            label={`Candidatures${f.session ? ` ${f.session}` : ''}`}
            value={f.applications ?? NC}
          />
          <StatCard
            label="Avis publiés"
            value={f.reviews}
            tone="brand"
            hint={f.reviews ? undefined : 'Sois le premier ou la première'}
          />
        </section>

        {hasChildren && (
          <nav
            aria-label="Établissements-composantes"
            className="flex flex-wrap items-center gap-3 text-[15px]"
          >
            <SwitchLink
              href={pageHref(`/universites/${u.slug}`, sp, 1, {
                inclure: include ? 'non' : null,
                etab: null,
              })}
              checked={include}
              className="inline-flex min-h-tap items-center gap-2.5 font-semibold text-ink no-underline"
            >
              Inclure les parcours de l’{childNames}
            </SwitchLink>
          </nav>
        )}

        <ContextBrowser
          ctx={{ universityIds: ids }}
          pathname={`/universites/${u.slug}`}
          sp={sp}
          facetGroups={facets}
          title="Les masters de la fac"
          searchPlaceholder={`Chercher dans les ${f.programs} parcours de ${u.shortName && u.name.length > 42 ? u.shortName : u.name}…`}
        />
        {sources.length > 0 && (
          <SourceLine className="-mt-3">Sources : {sources.join(' ; ')}.</SourceLine>
        )}
      </Container>
    </main>
  );
}
