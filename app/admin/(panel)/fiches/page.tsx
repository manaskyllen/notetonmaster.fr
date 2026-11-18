import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ExportButton,
  FichesTable,
  FichesToolbar,
  SaveViewButton,
} from '@/components/admin/FichesView';
import { ListFooter } from '@/components/admin/list';
import { Card } from '@/components/admin/ui';
import {
  ficheFilterOptions,
  ficheQueryString,
  getFichesPage,
  readFicheQuery,
  savedViewCount,
  VIEWS,
  viewCounts,
  type ViewKey,
} from '@/lib/admin/fiches';
import { getFicheDrawer } from '@/lib/admin/fiche-drawer';
import { requireAdmin } from '@/lib/auth/admin';
import { cn } from '@/lib/cn';
import { prisma } from '@/lib/db';
import { can } from '@/lib/domain/permissions';
import { readPage, type Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Fiches' };

const PER_PAGE = 50;
const CHOICES = [50, 100, 200] as const;
const nf = new Intl.NumberFormat('fr-FR');

const DOT: Record<ViewKey, string> = {
  'a-traiter': 'bg-[#ff8a73]',
  toutes: 'bg-ink',
  publiees: 'bg-success',
  'hors-ville': 'bg-[#b9b3c8]',
  brouillons: 'bg-[#f2c230]',
  conflits: 'bg-[#f2c230]',
  erreurs: 'bg-[#ff8a73]',
  'sans-programme': 'bg-[#b9b3c8]',
  'programme-ancien': 'bg-[#f2c230]',
  'sans-uai': 'bg-[#b9b3c8]',
};

export default async function FichesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = readFicheQuery(sp);
  const { page, perPage, offset } = readPage(sp, { perPage: PER_PAGE, choices: CHOICES });
  const ficheParam = Array.isArray(sp.fiche) ? sp.fiche[0] : sp.fiche;
  const [res, counts, saved, options, drawer] = await Promise.all([
    getFichesPage(q, offset, perPage),
    viewCounts(),
    prisma.savedView.findMany({
      where: { userId: admin.id, screen: 'fiches' },
      orderBy: { createdAt: 'asc' },
    }),
    ficheFilterOptions(q.universityId),
    ficheParam ? getFicheDrawer(ficheParam) : null,
  ]);
  const savedCounts = await Promise.all(saved.map((v) => savedViewCount(v.query)));
  const current = ficheQueryString(q);
  // Filters and sort are kept when the view changes (back to page 1).
  const keep = new URLSearchParams(current);
  const viewHref = (v: ViewKey) => {
    const p = new URLSearchParams(keep);
    if (v === 'a-traiter') p.delete('vue');
    else p.set('vue', v);
    if (perPage !== PER_PAGE) p.set('parPage', String(perPage));
    const s = p.toString();
    return s ? `/admin/fiches?${s}` : '/admin/fiches';
  };
  const savedCurrent = saved.find((v) => v.query === current);
  const groups = ['Suivi', 'Par problème'] as const;
  const filtered = !!(q.q || q.type || q.city || q.universityId || q.problem);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Catalogue</span>
          <h1
            id="fiches-titre"
            className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]"
          >
            Fiches
          </h1>
        </div>
        <div className="flex gap-2">
          <ExportButton query={current} total={res.total} />
          {can(admin.role, 'sync.run') && (
            <Link
              href="/admin/recuperation?onglet=sources"
              className="inline-flex min-h-10 items-center rounded-pill bg-violet-500 px-4 text-[13px] font-bold text-on-violet no-underline"
            >
              Lancer une synchro
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4.5 max-lg:flex-col">
        <nav
          aria-label="Vues"
          className="flex flex-[0_0_220px] flex-col gap-3.5 lg:sticky lg:top-4 max-lg:w-full"
        >
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-0.5">
              <span className="px-2.5 pb-1 text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
                {g}
              </span>
              {(Object.keys(VIEWS) as ViewKey[])
                .filter((k) => VIEWS[k].group === g)
                .map((k) => {
                  const on = q.view === k && !savedCurrent;
                  return (
                    <Link
                      key={k}
                      href={viewHref(k)}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'flex min-h-9 items-center gap-2 rounded-[10px] px-2.5 text-[14px] text-ink no-underline hover:bg-surface-0',
                        on
                          ? 'bg-surface-0 font-bold shadow-[0_1px_0_rgba(22,19,31,.04)]'
                          : 'font-medium',
                      )}
                    >
                      <span aria-hidden="true" className={cn('size-2 rounded-[3px]', DOT[k])} />
                      <span className="flex-1">{VIEWS[k].label}</span>
                      <span className="text-[12px] text-ink-muted tabular-nums">
                        {nf.format(counts[k] ?? 0)}
                      </span>
                    </Link>
                  );
                })}
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
              Mes vues
            </span>
            {saved.map((v, i) => {
              const on = v.id === savedCurrent?.id;
              return (
                <Link
                  key={v.id}
                  href={v.query ? `/admin/fiches?${v.query}` : '/admin/fiches'}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-2 rounded-[10px] px-2.5 text-[14px] text-ink no-underline hover:bg-surface-0',
                    on ? 'bg-surface-0 font-bold' : 'font-medium',
                  )}
                >
                  <span aria-hidden="true" className="size-2 rounded-[3px] bg-violet-500" />
                  <span className="flex-1">{v.name}</span>
                  <span className="text-[12px] text-ink-muted tabular-nums">
                    {nf.format(savedCounts[i] ?? 0)}
                  </span>
                </Link>
              );
            })}
            {!saved.length && (
              <span className="px-2.5 text-[12px] text-ink-muted">Aucune vue enregistrée.</span>
            )}
          </div>
          <SaveViewButton
            query={current}
            existing={savedCurrent ? { id: savedCurrent.id, name: savedCurrent.name } : null}
          />
        </nav>

        <section
          aria-label="Liste des fiches"
          className="flex min-w-0 flex-1 flex-col gap-2.5 max-lg:w-full"
        >
          <FichesToolbar
            key={current}
            q={q.q}
            type={sp.type ? String(sp.type) : ''}
            city={q.city ?? ''}
            problem={sp.probleme ? String(sp.probleme) : ''}
            sort={q.sort}
            cities={options.cities}
            universities={options.universities}
            university={options.current}
          />
          <Card className="overflow-hidden rounded-2xl">
            <FichesTable
              rows={res.rows}
              total={res.total}
              viewLabel={savedCurrent?.name ?? VIEWS[q.view].label}
              query={current}
              canEdit={can(admin.role, 'data.edit')}
              canSync={can(admin.role, 'sync.run')}
              initialDrawer={drawer}
            />
            {!res.rows.length && (
              <p className="m-0 p-7 text-center text-ink-muted">
                Aucune fiche dans cette vue avec ces filtres.
              </p>
            )}
            <ListFooter
              page={page}
              perPage={perPage}
              total={res.total}
              choices={CHOICES}
              defaultPerPage={PER_PAGE}
              suffix={filtered ? ' (filtrées)' : undefined}
            />
          </Card>
        </section>
      </div>
    </>
  );
}
