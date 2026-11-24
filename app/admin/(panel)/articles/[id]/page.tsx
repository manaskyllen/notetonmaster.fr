import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleEditor } from '@/components/admin/ArticleEditor';
import { adminLinkContext, analyse, editorData } from '@/lib/articles/admin';
import { tokenValues } from '@/lib/articles/tokens';
import { requireAdmin } from '@/lib/auth/admin';
import { siteOrigin } from '@/lib/seo/site';

export const metadata: Metadata = { title: 'Modifier l’article' };

/** Editor of a guide (A11 mockup): editor and admin roles only. */
export default async function ArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('articles.edit');
  const { id } = await params;
  const data = await editorData(id);
  if (!data) notFound();
  const { article: a, analysis } = data;
  const preview = await analyse(a, 'preview', await adminLinkContext());
  const f = preview.figures;
  return (
    <ArticleEditor
      key={a.id}
      initial={{
        id: a.id,
        title: a.title,
        slug: a.slug,
        city: a.city,
        theme: a.theme,
        lede: a.lede,
        body: a.body,
        metaDescription: a.metaDescription,
        keyword: a.keyword,
        secondaryKeywords: a.secondaryKeywords,
        searchKeywords: a.searchKeywords,
        relatedSlugs: a.relatedSlugs,
        signature: a.signature ?? '',
        status: a.status,
        online: a.online,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
      }}
      cities={data.cities}
      closedCity={data.closedCity}
      others={data.others}
      host={siteOrigin().replace(/^https?:\/\//, '')}
      changed={data.changed}
      preview={{
        editHtml: analysis.render.html,
        previewHtml: preview.render.html,
        toc: preview.render.toc,
        checklist: preview.checklist,
        score: preview.score,
        words: preview.render.words,
        blockers: preview.blockers,
        menu: data.tokens.map((t) => ({
          ...t,
          value: tokenValues(`{{${t.code}}}`, f)[t.code] ?? null,
        })),
        session: f.session,
        dataUpdatedAt: f.dataUpdatedAt,
        cityName: f.city?.name ?? null,
      }}
    />
  );
}
