import type { Metadata } from 'next';
import Link from 'next/link';
import { NewArticleButton } from '@/components/admin/ArticleEditor';
import { ClearFilters, Sel } from '@/components/admin/list';
import { AdminHeader, Card, Tag, TD, TH } from '@/components/admin/ui';
import { listAdminArticles, openCities } from '@/lib/articles/admin';
import { STATUS_LABEL, themeInfo } from '@/lib/articles/model';
import { requireAdmin } from '@/lib/auth/admin';
import { cn } from '@/lib/cn';
import type { ArticleStatus } from '@/lib/db/generated/enums';

export const metadata: Metadata = { title: 'Articles' };

const d = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

const STATUS_TAG: Record<ArticleStatus, string> = {
  DRAFT: 'bg-warning-bg text-warning',
  SCHEDULED: 'bg-violet-100 text-violet-700',
  PUBLISHED: 'bg-success-bg text-success',
  TO_REVIEW: 'bg-danger-bg text-danger',
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Guides (A11 mockup): filters by city and status; editor and admin roles only. */
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin('articles.edit');
  const sp = await searchParams;
  const city = one(sp.ville) || null;
  const status = (Object.keys(STATUS_LABEL) as ArticleStatus[]).find(
    (s) => s.toLowerCase() === one(sp.statut),
  );
  const [rows, cities] = await Promise.all([
    listAdminArticles({ city, status: status ?? null }),
    openCities(),
  ]);
  return (
    <>
      <AdminHeader title="Articles" actions={<NewArticleButton />}>
        <p className="m-0 max-w-[720px] text-[14px] text-ink-muted">
          Les guides publiés sur /guides. Leurs chiffres viennent de la base (jetons et blocs de
          données) et se mettent à jour à chaque synchronisation Mon Master.
        </p>
      </AdminHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Sel
          param="ville"
          label="Ville"
          value={city ?? ''}
          options={[
            { value: '', label: 'Toutes les villes' },
            { value: 'toutes', label: 'Guides « toutes villes »' },
            ...cities.map((c) => ({ value: c.slug, label: c.name })),
          ]}
        />
        <Sel
          param="statut"
          label="Statut"
          value={status?.toLowerCase() ?? ''}
          options={[
            { value: '', label: 'Tous les statuts' },
            ...(Object.entries(STATUS_LABEL) as [ArticleStatus, string][]).map(([k, v]) => ({
              value: k.toLowerCase(),
              label: v,
            })),
          ]}
        />
        <ClearFilters params={['ville', 'statut']} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <caption className="sr-only">Articles</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Titre
              </th>
              <th scope="col" className={TH}>
                Ville
              </th>
              <th scope="col" className={TH}>
                Statut
              </th>
              <th scope="col" className={TH}>
                Date
              </th>
              <th scope="col" className={TH}>
                Score SEO
              </th>
              <th scope="col" className={TH}>
                À relire
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className={cn(TD, 'py-8 text-center text-ink-muted')}>
                  Aucun article pour ces filtres.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const t = themeInfo(r.theme);
              return (
                <tr key={r.id}>
                  <td className={TD}>
                    <Link href={`/admin/articles/${r.id}`} className="font-bold text-ink">
                      {r.title}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-muted">
                      <span
                        className="rounded-pill px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: t.bg, color: t.fg }}
                      >
                        {t.label}
                      </span>
                      /guides/{r.slug}
                    </span>
                  </td>
                  <td className={TD}>{r.cityName}</td>
                  <td className={TD}>
                    <Tag className={STATUS_TAG[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                    {r.status === 'TO_REVIEW' && r.online && (
                      <span className="ml-1 text-[12px] text-ink-muted">en ligne</span>
                    )}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap')}>
                    {r.publishedAt ? d.format(r.publishedAt) : '—'}
                  </td>
                  <td className={cn(TD, 'tabular-nums')}>
                    <span className={r.score >= 6 ? 'font-bold text-success' : 'font-bold'}>
                      {r.score} / 7
                    </span>
                  </td>
                  <td className={TD}>
                    {r.toReview ? (
                      <Tag className="bg-danger-bg text-danger">À relire</Tag>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
