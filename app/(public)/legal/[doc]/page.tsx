import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/public/PageShell';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { LEGAL_DOCS, readLegalDoc, type LegalSlug } from '@/lib/legal';
import { seoMetadata } from '@/lib/seo/meta';
import { plainTitle } from '@/lib/seo/titles';

const LEGAL_DESCRIPTIONS: Record<LegalSlug, string> = {
  charte:
    'Ce qu’un avis peut dire et ce qu’il ne peut pas dire, comment l’équipe relit chaque avis avant publication, et comment signaler un contenu sur notetonmaster.',
  'mentions-legales':
    'Éditeur, directeur de la publication, hébergeur et contact de notetonmaster, le site indépendant d’avis d’étudiant·es sur les masters.',
  cgu: 'Conditions d’utilisation de notetonmaster : compte, dépôt d’un avis, questions aux auteurs, droit de réponse des formations et responsabilités.',
  confidentialite:
    'Les données personnelles que notetonmaster traite, pourquoi, combien de temps, et comment exercer tes droits (accès, rectification, suppression).',
};

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  if (!d) return { title: 'Document introuvable', robots: { index: false } };
  return seoMetadata({
    title: plainTitle(d.label),
    description: LEGAL_DESCRIPTIONS[d.slug],
    canonical: `/legal/${d.slug}`,
  });
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!LEGAL_DOCS.some((d) => d.slug === doc)) notFound();
  const { title, updated, html } = await readLegalDoc(doc as LegalSlug);
  return (
    <main>
      <Container className="flex flex-wrap items-start gap-7 pt-8 pb-20">
        <nav aria-label="Documents" className="flex flex-[1_1_240px] flex-col gap-1.5">
          <span className="mb-1 text-label text-ink-muted uppercase">Documents</span>
          {LEGAL_DOCS.map((d) => {
            const current = d.slug === doc;
            return (
              <Link
                key={d.slug}
                href={`/legal/${d.slug}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center rounded-[14px] px-3.5 text-[15px] no-underline',
                  current
                    ? 'bg-night font-bold text-on-night'
                    : 'font-medium text-ink hover:bg-surface-0',
                )}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>
        <article className="nm-doc min-w-0 flex-[999_1_620px] rounded-[28px] border border-border bg-surface-0 p-9 max-sm:p-5">
          {updated && (
            <span className="text-[13px] text-ink-muted">
              Dernière mise à jour : {formatDate(updated)}
            </span>
          )}
          <h1 className="mt-1 mb-6 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            {title}
          </h1>
          {/* html-safe: Markdown of content/legal in this repository, raw HTML escaped before marked (lib/legal.ts). */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </Container>
    </main>
  );
}
