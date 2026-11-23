import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Tag, TH, URGENCY } from '@/components/admin/ui';
import { Notice } from '@/components/ui/Notice';
import { adminCounts, overviewData } from '@/lib/admin/counts';
import { buildSubjects, type SubjectIcon, type Urgency } from '@/lib/admin/overview';
import { cap, formatWhen } from '@/lib/admin/when';
import { requireAdmin } from '@/lib/auth/admin';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Vue d’ensemble' };

const nf = new Intl.NumberFormat('fr-FR');

/** Icons of the subjects (AdminOverview mockup). */
const ICON: Record<SubjectIcon, string> = {
  legal: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z',
  mod: 'M5 21V4M5 4h11l-2 4 2 4H5',
  err: 'M12 8v5M12 16.5v.5M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  conflict: 'M7 7h10M7 7l3-3M7 7l3 3M17 17H7M17 17l-3-3M17 17l-3 3',
  prog: 'M7 3h7l5 5v13H7zM14 3v5h5',
  old: 'M12 7v5l3 2M12 3a9 9 0 110 18 9 9 0 010-18z',
  cms: 'M4 5h16v14H4zM4 9h16',
  id: 'M4 7h16M4 12h10M4 17h7',
};
const ICON_TONE: Record<SubjectIcon, string> = {
  legal: 'bg-danger-bg text-danger',
  err: 'bg-danger-bg text-danger',
  mod: 'bg-violet-100 text-violet-700',
  conflict: 'bg-warning-bg text-warning',
  prog: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
  old: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
  cms: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
  id: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
};

const FILTERS: { key: Urgency | 'all'; param: string | null; label: string }[] = [
  { key: 'all', param: null, label: 'Tout' },
  { key: 'block', param: 'bloquant', label: 'Bloquant' },
  { key: 'high', param: 'important', label: 'Important' },
  { key: 'low', param: 'a-faire', label: 'À faire' },
];

const RUN_DOT: Record<string, string> = {
  SUCCEEDED: 'bg-success',
  FAILED: 'bg-danger',
  AWAITING_VALIDATION: 'bg-[#c99a00]',
  RUNNING: 'bg-violet-500',
};

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ refus?: string; urgence?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const [counts, data] = await Promise.all([adminCounts(), overviewData()]);
  const subjects = buildSubjects(counts, admin.role);
  const filter = FILTERS.find((f) => f.param === sp.urgence) ?? FILTERS[0]!;
  const shown = subjects.filter((s) => filter.key === 'all' || s.urgency === filter.key);
  const items = subjects.reduce((a, s) => a + s.n, 0);
  const today = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date());

  const kpis = [
    {
      label: 'Fiches publiées',
      value: nf.format(data.published),
      sub: `sur ${nf.format(data.inBase)} en base`,
      href: '/admin/fiches?vue=publiees',
      tone: '',
    },
    {
      label: 'Avec programme',
      value: data.programmeShare == null ? '—' : `${data.programmeShare} %`,
      sub:
        data.programmeDelta == null
          ? 'évolution dans 7 jours'
          : `${data.programmeDelta >= 0 ? '+' : ''}${data.programmeDelta} pt${Math.abs(data.programmeDelta) > 1 ? 's' : ''} cette semaine`,
      href: '/admin/fiches?vue=sans-programme',
      tone:
        data.programmeDelta != null && data.programmeDelta > 0
          ? 'text-success'
          : data.programmeDelta != null && data.programmeDelta < 0
            ? 'text-danger'
            : '',
    },
    {
      label: 'Avis publiés',
      value: nf.format(data.reviewsPublished),
      sub: `${nf.format(counts.moderation.reviews)} en attente`,
      href: '/admin/avis',
      tone: '',
    },
    {
      label: 'Sources actives',
      value: `${data.sourcesEnabled} / ${data.sourcesTotal}`,
      sub: data.sourcesInError ? `${data.sourcesInError} en erreur` : 'aucune en erreur',
      href: '/admin/recuperation?onglet=sources',
      tone: data.sourcesInError ? 'text-danger' : '',
    },
    {
      label: 'Villes ouvertes',
      value: String(data.cities.length),
      sub: data.cities.map((c) => c.name).join(', ') || 'aucune',
      href: '/admin/parametres?onglet=villes',
      tone: '',
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">{cap(today)}</span>
          <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Vue d’ensemble
          </h1>
        </div>
        {data.lastSync && (
          <Link
            href="/admin/recuperation"
            className="inline-flex min-h-9.5 items-center gap-2 rounded-pill border border-border bg-surface-0 px-3.5 text-[13px] font-semibold text-ink no-underline"
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-2 rounded-pill',
                counts.collectErrors.total ? 'bg-danger' : 'bg-success',
              )}
            />
            Dernière synchro : {formatWhen(data.lastSync.at).replace(' ', ', ')}
            {counts.collectErrors.total > 0 && (
              <span className="text-danger">· {counts.collectErrors.total} en erreur</span>
            )}
          </Link>
        )}
      </div>
      {sp.refus && <Notice tone="warning">Ton rôle ne donne pas accès à cette page.</Notice>}

      <section
        aria-label="Chiffres clés"
        className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] overflow-hidden rounded-[18px] border border-border bg-surface-0"
      >
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="flex flex-col gap-0.5 border-r border-surface-100 px-4.5 py-3.5 text-ink no-underline hover:bg-[#f8f7fb] dark:hover:bg-surface-50"
          >
            <span className="text-[12px] text-ink-muted">{k.label}</span>
            <span className="font-display text-[26px] font-extrabold tracking-[-0.02em] tabular-nums">
              {k.value}
            </span>
            <span className={cn('truncate text-[12px] text-ink-muted', k.tone)}>{k.sub}</span>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-4.5">
        <Card aria-labelledby="todo-t" className="flex-[2_1_560px] overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4.5 py-4">
            <div className="flex items-baseline gap-2.5">
              <h2 id="todo-t" className="m-0 font-display text-[22px] font-extrabold">
                À traiter
              </h2>
              <span className="text-[13px] text-ink-muted">
                {subjects.length} sujet{subjects.length > 1 ? 's' : ''} · {nf.format(items)} élément
                {items > 1 ? 's' : ''}
              </span>
            </div>
            <nav
              aria-label="Filtrer par urgence"
              className="flex gap-1 rounded-pill bg-surface-100 p-1"
            >
              {FILTERS.map((f) => {
                const on = f.key === filter.key;
                const n =
                  f.key === 'all'
                    ? subjects.length
                    : subjects.filter((s) => s.urgency === f.key).length;
                return (
                  <Link
                    key={f.key}
                    href={f.param ? `/admin?urgence=${f.param}` : '/admin'}
                    replace
                    scroll={false}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'inline-flex min-h-8.5 items-center gap-2 rounded-pill px-3.5 text-[13px] font-semibold no-underline',
                      on ? 'bg-night text-on-night' : 'text-ink',
                    )}
                  >
                    {f.label}
                    <span className="text-[11px] opacity-75">{n}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {shown.length ? (
            <ul className="m-0 list-none p-0">
              {shown.map((s) => (
                <li key={s.key} className="border-b border-surface-100" data-subject={s.key}>
                  <Link
                    href={s.href}
                    className="todo-row flex items-center gap-3.5 py-3 pr-4.5 text-ink no-underline hover:bg-[#f8f7fb] dark:hover:bg-surface-50"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'w-1 flex-none self-stretch rounded-r-[4px]',
                        URGENCY[s.urgency].bar,
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-9.5 flex-none items-center justify-center rounded-[11px]',
                        ICON_TONE[s.icon],
                      )}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={ICON[s.icon]} />
                      </svg>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px]">
                        <strong className="font-display text-[17px]">{nf.format(s.n)}</strong>{' '}
                        {s.title}
                      </span>
                      {s.detail && <span className="text-[13px] text-ink-muted">{s.detail}</span>}
                    </span>
                    <Tag className={URGENCY[s.urgency].pill}>{URGENCY[s.urgency].label}</Tag>
                    <Tag className="bg-surface-50 text-[#3b3648] max-sm:hidden dark:bg-surface-100 dark:text-ink-muted">
                      {s.role}
                    </Tag>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap text-violet-700">
                      {s.cta}
                      <svg
                        className="go"
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 p-7 text-center text-ink-muted">Rien à traiter pour ce filtre.</p>
          )}
          <p className="m-0 bg-surface-subtle px-4.5 py-3 text-[12px] text-ink-muted">
            Classé par urgence, puis par nombre d’éléments. Un sujet disparaît dès qu’il est réglé ;
            les compteurs sont recalculés toutes les 5 minutes.
          </p>
        </Card>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4.5">
          <Card
            aria-labelledby="cov-t"
            className="flex flex-col gap-2.5 rounded-[20px] px-4.5 py-4"
          >
            <h2 id="cov-t" className="m-0 font-display text-[18px] font-extrabold">
              Villes ouvertes
            </h2>
            {data.cities.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className={cn(TH, 'bg-transparent px-0 py-1.5 dark:bg-transparent')}
                      >
                        Ville
                      </th>
                      <th
                        scope="col"
                        className={cn(
                          TH,
                          'bg-transparent px-0 py-1.5 text-right dark:bg-transparent',
                        )}
                      >
                        Fiches
                      </th>
                      <th
                        scope="col"
                        className={cn(TH, 'bg-transparent py-1.5 pr-0 pl-2.5 dark:bg-transparent')}
                      >
                        Programme
                      </th>
                      <th
                        scope="col"
                        className={cn(
                          TH,
                          'bg-transparent px-0 py-1.5 text-right dark:bg-transparent',
                        )}
                      >
                        Avis
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cities.map((c) => (
                      <tr key={c.slug} className="border-b border-surface-100">
                        <th scope="row" className="py-2 text-left font-bold">
                          <Link
                            href={`/admin/fiches?vue=publiees&ville=${c.slug}`}
                            className="text-ink no-underline hover:underline"
                          >
                            {c.name}
                          </Link>
                        </th>
                        <td className="py-2 text-right tabular-nums">{nf.format(c.fiches)}</td>
                        <td className="py-2 pl-2.5">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-100"
                            >
                              <span
                                className="block h-full bg-violet-500"
                                style={{ width: `${c.programme}%` }}
                              />
                            </span>
                            <span className="w-8.5 text-right tabular-nums">{c.programme} %</span>
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{nf.format(c.reviews)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-ink-muted">Aucune ville n’est ouverte.</p>
            )}
            <Link href="/admin/parametres?onglet=villes" className="text-[13px] font-semibold">
              Gérer les villes ouvertes →
            </Link>
          </Card>
          <Card aria-labelledby="sy-t" className="flex flex-col gap-1.5 rounded-[20px] px-4.5 py-4">
            <h2 id="sy-t" className="m-0 mb-1 font-display text-[18px] font-extrabold">
              Dernières synchros
            </h2>
            {data.runs.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2.5 border-b border-surface-100 py-1.5 text-[13px]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 flex-none rounded-pill',
                    RUN_DOT[r.status] ?? 'bg-border-control',
                  )}
                />
                <span className="min-w-0 flex-1 font-semibold">{r.name}</span>
                <span
                  className={cn(
                    'whitespace-nowrap',
                    r.status === 'FAILED' ? 'text-danger' : 'text-ink-muted',
                  )}
                >
                  {r.status === 'FAILED'
                    ? 'Échec · '
                    : r.status === 'RUNNING'
                      ? 'En cours · '
                      : r.status === 'AWAITING_VALIDATION'
                        ? 'À valider · '
                        : ''}
                  {r.at
                    ? r.status === 'FAILED' ||
                      r.status === 'RUNNING' ||
                      r.status === 'AWAITING_VALIDATION'
                      ? formatWhen(r.at)
                      : cap(formatWhen(r.at))
                    : '—'}
                </span>
                <span className="sr-only">
                  {r.status === 'SUCCEEDED' ? 'réussie' : r.status === 'FAILED' ? 'en échec' : ''}
                </span>
              </div>
            ))}
            <Link
              href="/admin/recuperation?onglet=journal"
              className="mt-1 text-[13px] font-semibold"
            >
              Tout le journal de collecte →
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
