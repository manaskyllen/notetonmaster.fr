import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlsoRead, CitiesLink, CityCard, withBrandSpaced } from '@/components/guides/GuideParts';
import { ArticleHtml } from '@/components/public/ArticleHtml';
import { Container } from '@/components/public/PageShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { DEFAULT_SIGNATURE, readingMinutes, themeInfo } from '@/lib/articles/model';
import { getGuide } from '@/lib/articles/queries';
import { articleJsonLd, pageJsonLd } from '@/lib/seo/jsonld';
import { seoMetadata } from '@/lib/seo/meta';
import { ogImagePath } from '@/lib/seo/og-path';

const date = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

const ogPath = (g: { slug: string; title: string; updatedAt: string }) =>
  ogImagePath('guide', g.slug, [g.title, g.updatedAt]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) return { title: 'Guide introuvable', robots: { index: false } };
  return seoMetadata({
    title: g.title,
    description: g.metaDescription,
    canonical: `/guides/${g.slug}`,
    type: 'article',
    image: { path: ogPath(g), alt: g.title },
  });
}

/**
 * A guide (ArticlePublic mockup, 23): rendered on the server from its Markdown, its figures read
 * in the cache of the last sync (lib/articles). No script of its own: the table of contents
 * follows the reading with CSS where the browser can, the FAQ is native <details>. A draft, a
 * guide of a closed city or an unknown slug answers 404 (proxy.ts, before the page streams); a
 * former slug answers 301.
 */
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  if (!g) notFound();
  const theme = themeInfo(g.theme);
  const minutes = readingMinutes(g.render.words);
  const signature = g.signature?.trim() || DEFAULT_SIGNATURE;
  const card = g.city && g.cityCard ? { ...g.city, ...g.cityCard } : null;
  const crumbs = [
    { label: 'Accueil', href: '/' },
    ...(g.city ? [{ label: `Masters à ${g.city.name}`, href: `/masters/${g.city.slug}` }] : []),
    { label: 'Guides', href: '/guides' },
  ];
  return (
    <main>
      <JsonLd
        data={pageJsonLd([
          articleJsonLd({
            slug: g.slug,
            title: g.title,
            description: g.metaDescription,
            publishedAt: g.publishedAt,
            updatedAt: g.updatedAt,
            image: ogPath(g),
          }),
        ])}
      />
      <Container className="flex flex-col gap-7 pt-7 pb-20">
        <Breadcrumb structured items={crumbs} />
        <header className="flex max-w-[860px] flex-col gap-4">
          <span className="self-start rounded-pill bg-night px-3 py-1.25 text-[12px] font-bold tracking-[0.04em] text-lime-400 uppercase">
            {g.city ? `${g.city.name} · ` : ''}
            {theme.label}
          </span>
          <h1 className="m-0 font-display text-[clamp(38px,5.4vw,64px)] leading-none font-extrabold tracking-[-0.035em] text-balance">
            {g.title}
          </h1>
          <p className="m-0 text-[21px] leading-normal text-ink-soft max-sm:text-[19px]">
            {withBrandSpaced(g.lede)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-ink-muted">
            <span>{withBrandSpaced(signature)}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={g.publishedAt}>{date.format(new Date(g.publishedAt))}</time>
            <span aria-hidden="true">·</span>
            <span>{minutes} min de lecture</span>
            {g.session && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-bg px-2.5 py-1 font-semibold text-success">
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-none"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
                Chiffres Mon Master {g.session}, mis à jour automatiquement
              </span>
            )}
          </div>
        </header>

        <div className="flex items-start gap-12">
          <article className="flex max-w-[780px] min-w-0 flex-[1_1_760px] flex-col">
            <ArticleHtml className="g-prose" html={g.render.html} />
            {/* Phones and tablets: the card of the city at the end of the text. */}
            {card ? (
              <CityCard c={card} className="mt-10 min-[901px]:hidden" />
            ) : (
              <CitiesLink className="mt-10 min-[901px]:hidden" />
            )}
            <AlsoRead guides={g.related} />
          </article>

          <aside className="sticky top-[100px] flex flex-[0_0_260px] flex-col gap-4.5 max-[900px]:hidden">
            {g.render.toc.length > 0 && (
              <nav aria-label="Sommaire" className="g-toc">
                <span className="mb-2 text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase">
                  Sommaire
                </span>
                {g.render.toc.map((h) => (
                  <a key={h.id} href={`#${h.id}`}>
                    {h.text}
                  </a>
                ))}
              </nav>
            )}
            {card ? <CityCard c={card} /> : <CitiesLink />}
          </aside>
        </div>
      </Container>
    </main>
  );
}
