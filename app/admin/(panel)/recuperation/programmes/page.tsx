import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { StatusPill } from '@/components/ui/StatusPill';
import type { Status } from '@/components/ui/StatusPill';
import {
  COVERAGE_STATUS_LABEL,
  loadProgramCoverage,
  type CoverageStatus,
} from '@/lib/admin/program-coverage';
import { requireAdmin } from '@/lib/auth/admin';
import { formatRelative } from '@/lib/format';

export const metadata: Metadata = { title: 'Couverture des programmes' };

const PILL: Record<CoverageStatus, Status> = {
  active: 'ok',
  paused: 'warning',
  blocked: 'error',
  empty: 'stale',
  pending: 'draft',
  invalid: 'error',
};

const TARGET = 0.7;
const th =
  'border-b border-border px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase';
const td = 'border-b border-border px-3 py-2.5 align-top';
const pct = (r: number) => `${Math.round(r * 100)} %`;

export default async function ProgramCoveragePage() {
  await requireAdmin('dashboard.view');
  const { rows, templates, run } = await loadProgramCoverage();
  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Récupération', href: '/admin/recuperation' },
          { label: 'Couverture des programmes' },
        ]}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-muted">
          {run
            ? `${run.applied ? 'Passage appliqué' : 'Simulation'} ${run.finishedAt ? formatRelative(run.finishedAt) : 'en cours'} · `
            : 'Aucun passage des sites des universités · '}
          sites des universités (univ-sites)
        </span>
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Couverture des programmes
        </h1>
      </div>

      <section
        aria-labelledby="rate-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5"
      >
        <h2 id="rate-title" className="m-0 font-display text-[22px] font-extrabold">
          Taux d’extraction par gabarit
        </h2>
        <p className="m-0 text-[14px] text-ink-muted">
          Part des{' '}
          {templates[0]?.unit === 'parcours' ? 'parcours couverts' : 'pages de parcours lues'} avec
          au moins 3 rubriques. Objectif : {pct(TARGET)}.
        </p>
        {templates.length ? (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3 p-0">
            {templates.map((t) => (
              <li
                key={t.template}
                className="flex flex-col gap-1 rounded-md border border-border p-4"
              >
                <span className="text-[13px] font-semibold">{t.label}</span>
                <span className="font-display text-[28px] font-extrabold">{pct(t.rate)}</span>
                <span className="text-[13px] text-ink-muted">
                  {t.covered} / {t.total} {t.unit} ·{' '}
                  {t.rate >= TARGET ? 'objectif atteint' : 'sous l’objectif'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px]">
            Pas encore de mesure : lancer une simulation de la source « Sites des universités ».
          </p>
        )}
      </section>

      <section
        aria-labelledby="table-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5"
      >
        <h2 id="table-title" className="m-0 font-display text-[22px] font-extrabold">
          Par établissement
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <caption className="sr-only">Couverture des programmes par établissement</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Établissement
                </th>
                <th scope="col" className={th}>
                  Gabarit
                </th>
                <th scope="col" className={th}>
                  Statut
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Parcours
                </th>
                <th scope="col" className={`${th} text-right`}>
                  0 rubrique
                </th>
                <th scope="col" className={`${th} text-right`}>
                  1 à 2
                </th>
                <th scope="col" className={`${th} text-right`}>
                  3 ou plus
                </th>
                <th scope="col" className={th}>
                  Dernier passage
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.universityId}>
                  <th scope="row" className={`${td} text-left font-medium`}>
                    {r.name}
                  </th>
                  <td className={td}>{r.templateLabel}</td>
                  <td className={td}>
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={PILL[r.status]}>
                        {COVERAGE_STATUS_LABEL[r.status]}
                      </StatusPill>
                      {r.reason && <span className="text-[12px] text-ink-muted">{r.reason}</span>}
                      {(r.status === 'blocked' || r.status === 'paused') && (
                        <Link href="/reponse-formation" className="text-[12px] font-semibold">
                          Équipes : revendiquer la fiche
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.programs}</td>
                  {r.counts ? (
                    <>
                      <td className={`${td} text-right tabular-nums`}>{r.counts.zero}</td>
                      <td className={`${td} text-right tabular-nums`}>{r.counts.few}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {r.counts.threeOrMore}
                        {r.unit === 'pages' && <span className="sr-only"> pages</span>}
                      </td>
                    </>
                  ) : (
                    <td className={`${td} text-right text-ink-muted`} colSpan={3}>
                      —
                    </td>
                  )}
                  <td className={td}>{r.lastRun ? formatRelative(r.lastRun) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.some((r) => r.unit === 'pages' && r.counts) && (
          <p className="m-0 text-[13px] text-ink-muted">
            Tant que les pages ne sont pas rapprochées des parcours, les colonnes comptent des
            pages.
          </p>
        )}
      </section>
    </>
  );
}
