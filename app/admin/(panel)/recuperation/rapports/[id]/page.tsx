import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApplyRunButton } from '@/components/admin/ApplyRunButton';
import { Breadcrumb, Notice } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/admin';
import { decisionsStamp } from '@/lib/data/pipeline';
import { prisma } from '@/lib/db';
import { can } from '@/lib/domain/permissions';

export const metadata: Metadata = { title: 'Rapport de simulation' };

type Report = {
  nothingNew?: boolean;
  reason?: string;
  records?: number;
  byAction?: Record<string, number>;
  fields?: { changed: number; locked: number; conflicts: number };
  changeRatio?: number;
  checks?: Record<string, { executed: number; failed: number }>;
  alerts?: { code: string; title: string; count: number }[];
  samples?: { recordKey: string; action: string; target: string; changes: string[] }[];
  national?: Record<string, unknown>;
  sample?: {
    ifc: string;
    university: string;
    title: unknown;
    slug: string | null;
    fields: { field: string; source: unknown; planned: unknown; ok: boolean }[];
  }[];
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Créations',
  update: 'Modifications',
  unchanged: 'Inchangés',
  proposal: 'Propositions',
  'merge-proposal': 'Fusions proposées',
  ignored: 'Ignorés',
  rejected: 'Écartés',
};
const fmt = (v: unknown) =>
  v == null || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const dt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export default async function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('dashboard.view');
  const { id } = await params;
  const run = await prisma.syncRun.findUnique({ where: { id }, include: { source: true } });
  if (!run) notFound();
  const d = (run.diff ?? {}) as Report;
  const stats = (run.stats ?? {}) as {
    checks?: Report['checks'];
    publishSeconds?: number;
    publishTimings?: Record<string, number>;
  };
  const checks = d.checks ?? stats.checks ?? {};
  const stale =
    !!run.decisionsStamp && run.decisionsStamp !== (await decisionsStamp(run.source.key));
  const applicable =
    !run.appliedAt &&
    run.resumeFromStep === 'publish' &&
    ['SUCCEEDED', 'AWAITING_VALIDATION'].includes(run.status);
  const national = d.national as
    | {
        sessions: Record<string, number>;
        formationsLatest: number;
        universities: { existing: number; new: number };
        mentions: {
          existing: number;
          new: number;
          namedFromRncp?: number;
          namedFromMonMaster?: number;
        };
        accreditations: number;
        programs: { linked: number; new: number };
        proposals: {
          succession: number;
          merge: number;
          mergeRecommended?: number;
          mergeGroupsOf2?: number;
        };
        historyOnly: number;
        rejected: number;
        notRenewed: number;
      }
    | undefined;
  const rows: [string, string | number][] = national
    ? [
        [
          'Lignes par session',
          Object.entries(national.sessions)
            .map(([k, v]) => `${k} : ${v}`)
            .join(' · '),
        ],
        ['Formations de la dernière session', national.formationsLatest],
        [
          'Universités existantes / à créer',
          `${national.universities.existing} / ${national.universities.new}`,
        ],
        [
          'Mentions existantes / à créer',
          `${national.mentions.existing} / ${national.mentions.new}`,
        ],
        [
          'Mentions nommées d’après le RNCP / d’après Mon Master',
          `${national.mentions.namedFromRncp ?? '—'} / ${national.mentions.namedFromMonMaster ?? '—'}`,
        ],
        ['Accréditations (UAI × inm)', national.accreditations],
        [
          'Fiches parcours reliées / à créer',
          `${national.programs.linked} / ${national.programs.new}`,
        ],
        ['Successions à valider', national.proposals.succession],
        [
          'Fusions proposées (dont recommandées)',
          `${national.proposals.merge} (${national.proposals.mergeRecommended ?? 0})`,
        ],
        ['Historique sans fiche', national.historyOnly],
        ['Lignes écartées', national.rejected],
        ['Parcours non reconduits', national.notRenewed],
      ]
    : [];
  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Récupération', href: '/admin/recuperation' },
          { label: `Rapport · ${run.source.name}` },
        ]}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-muted">
          {run.mode === 'PREVIEW' && !run.appliedAt ? 'Simulation' : 'Passage'} du{' '}
          {dt.format(run.queuedAt)} · statut {run.status}
          {run.sourceVersion ? ` · version ${run.sourceVersion}` : ''}
          {run.appliedAt ? ` · appliqué le ${dt.format(run.appliedAt)}` : ''}
        </span>
        <h1 className="m-0 font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Rapport · {run.source.name}
        </h1>
      </div>
      {stale && (
        <Notice tone="warning">
          Des décisions de rapprochement ont été prises depuis cette simulation : elle doit être
          recalculée avant d’être appliquée.
        </Notice>
      )}
      {d.nothingNew && (
        <Notice tone="info">Rien de nouveau{d.reason ? ` (${d.reason})` : ''}.</Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {d.byAction && (
          <a className="font-semibold" href={`/api/sync-runs/${run.id}/diff`}>
            Télécharger le rapport complet (CSV)
          </a>
        )}
        <Link href="/admin/recuperation/rapprochements">Rapprochements à valider</Link>
      </div>
      {applicable && can(admin.role, 'sync.validate') && (
        <ApplyRunButton runId={run.id} stale={stale} canRecompute={can(admin.role, 'sync.run')} />
      )}

      {rows.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">Bilan</h2>
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-border">
                  <th className="py-1.5 pr-3 text-left font-semibold">{k}</th>
                  <td className="py-1.5 text-right font-mono">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.byAction && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">Différences</h2>
          <p className="m-0 text-[14px]">
            {Object.entries(d.byAction)
              .filter(([, v]) => v)
              .map(([k, v]) => `${ACTION_LABEL[k] ?? k} : ${v}`)
              .join(' · ')}
          </p>
          {d.fields && (
            <p className="m-0 text-[14px] text-ink-muted">
              {d.fields.changed} valeurs changées · {d.fields.locked} champs verrouillés conservés ·{' '}
              {d.fields.conflicts} conflits · {Math.round((d.changeRatio ?? 0) * 100)} % des
              enregistrements créés ou modifiés
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
        <h2 className="m-0 font-display text-[20px] font-extrabold">Contrôles exécutés</h2>
        {Object.keys(checks).length === 0 ? (
          <p className="m-0 text-ink-muted">Aucun contrôle enregistré pour ce passage.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1.5">Contrôle</th>
                <th className="py-1.5 text-right">Exécutés</th>
                <th className="py-1.5 text-right">En échec</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(checks).map(([k, v]) => (
                <tr key={k} className="border-b border-border">
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right font-mono">{v.executed}</td>
                  <td
                    className={`py-1.5 text-right font-mono ${v.failed ? 'font-bold text-danger' : ''}`}
                  >
                    {v.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {d.sample && d.sample.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">
            Échantillon : {d.sample.length} parcours tirés au hasard (hors pilotes)
          </h2>
          {d.sample.map((x) => (
            <details key={x.ifc} className="rounded-md bg-surface-50 p-3">
              <summary className="cursor-pointer font-semibold">
                {x.fields.every((f) => f.ok) ? '✓' : '✗'} {fmt(x.title)} · {x.university} · {x.ifc}
                {x.slug ? (
                  <span className="font-mono text-[12px] text-ink-muted">
                    {' '}
                    · /parcours/{x.slug}
                  </span>
                ) : null}
              </summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-1">Champ</th>
                      <th className="py-1">Ligne source</th>
                      <th className="py-1">Valeur prévue</th>
                      <th className="py-1">Conforme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {x.fields.map((f) => (
                      <tr key={f.field} className="border-b border-border align-top">
                        <td className="py-1 pr-2 font-semibold">{f.field}</td>
                        <td className="py-1 pr-2 font-mono">{fmt(f.source)}</td>
                        <td className="py-1 pr-2">{fmt(f.planned)}</td>
                        <td className={`py-1 ${f.ok ? 'text-success' : 'font-bold text-danger'}`}>
                          {f.ok ? 'oui' : 'non'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )}

      {(d.alerts?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">Alertes</h2>
          <ul className="m-0 pl-4.5">
            {d.alerts!.map((a) => (
              <li key={a.code + a.title}>
                {a.title} {a.count > 1 ? `(${a.count})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.publishSeconds != null && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">
            Publication : {stats.publishSeconds} s
          </h2>
          <p className="m-0 text-[14px] text-ink-muted">
            {Object.entries(stats.publishTimings ?? {})
              .map(([k, v]) => `${k} ${v} s`)
              .join(' · ')}
          </p>
        </section>
      )}

      {(d.samples?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4">
          <h2 className="m-0 font-display text-[20px] font-extrabold">
            Exemples de changements (50 premiers)
          </h2>
          <ul className="m-0 flex flex-col gap-1 pl-4.5 text-[13px]">
            {d.samples!.slice(0, 50).map((s) => (
              <li key={s.recordKey}>
                <span className="font-semibold">{ACTION_LABEL[s.action] ?? s.action}</span> ·{' '}
                {s.target}
                {s.changes.length ? ` — ${s.changes.slice(0, 4).join(' ; ')}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
