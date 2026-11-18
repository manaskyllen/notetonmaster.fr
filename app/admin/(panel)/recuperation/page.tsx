import type { Metadata } from 'next';
import Link from 'next/link';
import { ClearFilters, ListFooter, SearchBox, Sel } from '@/components/admin/list';
import {
  AlertRow,
  CollectErrorCard,
  ConflictGroupCard,
  NoProfileRow,
  RunList,
  UrlTabs,
  ZoneSwitch,
} from '@/components/admin/RecuperationView';
import { Card, MiniBar, Tag, TD, TH } from '@/components/admin/ui';
import { conflictGroups } from '@/lib/admin/conflict-groups';
import {
  collectErrors,
  ETAB_STATE,
  etablissementsPage,
  noProfileUniversities,
  openAlerts,
  PROFILE_FILTER,
  runsPage,
  type EtabState,
} from '@/lib/admin/recuperation';
import { getSourcesWithHealth } from '@/lib/admin/sources';
import { formatWhen } from '@/lib/admin/when';
import { requireAdmin } from '@/lib/auth/admin';
import { cn } from '@/lib/cn';
import { TEMPLATE_LABEL, TEMPLATES } from '@/lib/connectors/univ-sites/profiles';
import { can } from '@/lib/domain/permissions';
import { readPage, type Params } from '@/lib/pagination';
import { RunSourceButton } from '@/components/admin/RunSourceButton';

export const metadata: Metadata = { title: 'Récupération' };

const TABS = ['a-traiter', 'sources', 'etablissements', 'journal'] as const;
type Tab = (typeof TABS)[number];
const nf = new Intl.NumberFormat('fr-FR');
const H2 = 'm-0 flex items-center gap-2.5 font-display text-[19px] font-extrabold';
const SOURCE_STATE = {
  ok: { label: 'OK', cls: 'bg-success-bg text-success' },
  running: { label: 'En cours', cls: 'bg-violet-100 text-violet-700' },
  warning: { label: 'Dégradée', cls: 'bg-warning-bg text-warning' },
  error: { label: 'En erreur', cls: 'bg-danger-bg text-danger' },
  off: { label: 'Désactivée', cls: 'bg-surface-100 text-ink-muted' },
} as const;
const ETAB_TONE: Record<EtabState, string> = {
  ok: 'bg-success-bg text-success',
  err: 'bg-danger-bg text-danger',
  robots: 'bg-warning-bg text-warning',
  none: 'bg-surface-100 text-ink-muted',
};

export default async function RecuperationPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';
  const tab: Tab = (TABS as readonly string[]).includes(one('onglet'))
    ? (one('onglet') as Tab)
    : 'a-traiter';
  const canRun = can(admin.role, 'sync.run');
  const canEdit = can(admin.role, 'data.edit');

  // The « À traiter » counter is shown on every tab: errors + groups + establishments without profile.
  const [errors, groups, noProfile] = await Promise.all([
    collectErrors(),
    conflictGroups(),
    noProfileUniversities(),
  ]);
  const todoCount = errors.length + groups.groups.length + noProfile.length;

  let panel: React.ReactNode = null;
  if (tab === 'a-traiter') {
    const alerts = await openAlerts();
    const conflictFiches = groups.groups.reduce((a, g) => a + g.count, 0);
    panel = (
      <div className="flex flex-col gap-4">
        <Card aria-labelledby="h-err" className="flex flex-col gap-2.5 px-4.5 py-4">
          <h2 id="h-err" className={H2}>
            Erreurs de collecte<Tag className="bg-danger-bg text-danger">{errors.length}</Tag>
          </h2>
          {errors.map((e) => (
            <CollectErrorCard key={e.issueId} e={e} canRun={canRun} />
          ))}
          {!errors.length && (
            <p className="m-0 text-[13px] text-success">Aucune collecte en erreur.</p>
          )}
        </Card>

        <Card aria-labelledby="h-conf" className="flex flex-col gap-2.5 px-4.5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="h-conf" className={H2}>
              Conflits, regroupés par règle
              <Tag className="bg-warning-bg text-warning">
                {nf.format(conflictFiches)} fiche{conflictFiches > 1 ? 's' : ''}
              </Tag>
            </h2>
            <span className="text-[12px] text-ink-muted">
              Un choix s’applique à toutes les fiches du groupe. Les cas isolés se règlent dans la
              fiche.
            </span>
          </div>
          {groups.groups.map((g) => (
            <ConflictGroupCard key={g.key} g={g} canEdit={canEdit} />
          ))}
          {!groups.groups.length && (
            <p className="m-0 text-[13px] text-success">Aucun groupe de conflits.</p>
          )}
          {groups.isolated > 0 && (
            <p className="m-0 text-[13px] text-ink-muted">
              {groups.isolated} conflit{groups.isolated > 1 ? 's' : ''} isolé
              {groups.isolated > 1 ? 's' : ''}, à régler dans{' '}
              <Link href="/admin/fiches?vue=toutes&probleme=conflit">
                {groups.isolated > 1 ? 'leurs fiches' : 'sa fiche'}
              </Link>
              .
            </p>
          )}
        </Card>

        <Card
          id="sans-profil"
          aria-labelledby="h-prof"
          className="flex scroll-mt-4 flex-col gap-2 px-4.5 py-4"
        >
          <h2 id="h-prof" className={H2}>
            Établissements sans profil de collecte
            <Tag className="bg-surface-100 text-[#3b3648] dark:text-ink-muted">
              {noProfile.length}
            </Tag>
          </h2>
          {noProfile.map((p) => (
            <NoProfileRow
              key={p.id}
              p={p}
              canEdit={canEdit}
              templates={TEMPLATES.map((t) => ({ id: t, label: TEMPLATE_LABEL[t] }))}
            />
          ))}
          {!noProfile.length && (
            <p className="m-0 text-[13px] text-success">
              Tous les établissements des villes ouvertes ont un profil.
            </p>
          )}
        </Card>

        {alerts.length > 0 && (
          <Card aria-labelledby="h-alerts" className="flex flex-col gap-1 px-4.5 py-4">
            <h2 id="h-alerts" className={H2}>
              Alertes à vérifier
              <Tag className="bg-surface-100 text-[#3b3648] dark:text-ink-muted">
                {alerts.length}
              </Tag>
            </h2>
            {alerts.map((a) => (
              <AlertRow key={a.id} a={a} canResolve={canEdit} />
            ))}
          </Card>
        )}
      </div>
    );
  } else if (tab === 'sources') {
    const sources = await getSourcesWithHealth();
    panel = (
      <Card className="overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <caption className="sr-only">Sources de données</caption>
          <thead>
            <tr>
              {['Source', 'Méthode', 'Fréquence', 'Dernier passage', 'Résultat', 'État'].map(
                (h) => (
                  <th key={h} scope="col" className={TH}>
                    {h}
                  </th>
                ),
              )}
              <th scope="col" className={TH}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const locked = !s.enabled && !!s.blockedReason;
              const paused = s.pausedUntil && s.pausedUntil > new Date();
              const state = locked || !s.enabled ? SOURCE_STATE.off : SOURCE_STATE[s.health];
              const report = s.last?.diff ? `/admin/recuperation/rapports/${s.last.id}` : null;
              return (
                <tr key={s.key} className="trow hover:bg-[#f8f7fb] dark:hover:bg-surface-50">
                  <th scope="row" className={cn(TD, 'text-left font-normal')}>
                    <span className="flex flex-col">
                      <strong>{s.name}</strong>
                      <span className="font-mono text-[12px] text-ink-muted">{s.host}</span>
                    </span>
                  </th>
                  <td className={TD}>{s.method}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{s.scheduleLabel ?? '—'}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-ink-muted')}>
                    {locked
                      ? 'Refusé (robots.txt)'
                      : s.last?.status === 'FAILED'
                        ? `Échec · ${formatWhen(s.last.finishedAt ?? s.last.queuedAt)}`
                        : s.lastRunAt
                          ? formatWhen(s.lastRunAt)
                          : 'Jamais'}
                  </td>
                  <td className={cn(TD, 'text-[#3b3648] dark:text-ink-muted')}>
                    {paused
                      ? `En pause jusqu’au ${s.pausedUntil!.toLocaleDateString('fr-FR')}`
                      : s.last?.status === 'AWAITING_VALIDATION'
                        ? 'Simulation à valider'
                        : s.last?.error
                          ? s.last.error.slice(0, 80)
                          : s.last
                            ? (s.last.step ?? 'Terminé')
                            : '—'}
                    {report && (
                      <>
                        {' · '}
                        <Link href={report}>rapport</Link>
                      </>
                    )}
                  </td>
                  <td className={TD}>
                    <Tag className={state.cls}>{state.label}</Tag>
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    {canRun && (
                      <RunSourceButton
                        sourceKey={s.key}
                        locked={locked}
                        running={s.health === 'running'}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    );
  } else if (tab === 'etablissements') {
    const zoneOnly = one('toutes') !== '1';
    const { page, perPage, offset } = readPage(sp, { perPage: 50, choices: [50, 100, 200] });
    const stateParam = one('etat');
    const res = await etablissementsPage({
      q: one('q'),
      profile: PROFILE_FILTER[one('profil')] ?? null,
      state: stateParam in ETAB_STATE ? (stateParam as EtabState) : null,
      zoneOnly,
      offset,
      limit: perPage,
    });
    panel = (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            key={one('q')}
            label="Chercher un établissement"
            placeholder="Chercher un établissement ou un domaine…"
            value={one('q')}
          />
          <Sel
            param="profil"
            label="Profil de collecte"
            value={one('profil')}
            options={[
              { value: '', label: 'Tous les profils' },
              { value: 'ametys', label: 'Ametys ODF' },
              { value: 'ksup', label: 'K-Sup' },
              { value: 'drupal', label: 'Drupal' },
              { value: 'generique', label: 'Générique' },
              { value: 'aucun', label: 'Sans profil' },
            ]}
          />
          <Sel
            param="etat"
            label="État"
            value={stateParam}
            options={[
              { value: '', label: 'Tous les états' },
              ...Object.entries(ETAB_STATE).map(([value, label]) => ({ value, label })),
            ]}
          />
          <ClearFilters params={['q', 'profil', 'etat']} />
          <ZoneSwitch on={zoneOnly} />
        </div>
        <Card className="overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <caption className="sr-only">Établissements et collecte de leur site</caption>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Établissement
                  </th>
                  <th scope="col" className={TH}>
                    Profil
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    Parcours
                  </th>
                  <th scope="col" className={TH}>
                    Programmes trouvés
                  </th>
                  <th scope="col" className={TH}>
                    Dernier passage
                  </th>
                  <th scope="col" className={TH}>
                    État
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((e) => (
                  <tr key={e.id} className="trow hover:bg-[#f8f7fb] dark:hover:bg-surface-50">
                    <th scope="row" className={cn(TD, 'text-left font-normal')}>
                      <span className="flex flex-col">
                        <Link
                          href={`/admin/fiches?vue=toutes&etablissement=${e.id}`}
                          className="font-bold text-ink no-underline hover:underline"
                        >
                          {e.name}
                        </Link>
                        <span className="text-[12px] text-ink-muted">
                          {[e.city, e.host].filter(Boolean).map((x, i) => (
                            <span key={i} className={i ? 'font-mono' : undefined}>
                              {i ? ' · ' : ''}
                              {x}
                            </span>
                          ))}
                        </span>
                      </span>
                    </th>
                    <td className={cn(TD, 'whitespace-nowrap')}>{e.profile}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{nf.format(e.programs)}</td>
                    <td className={cn(TD, 'min-w-37.5')}>
                      <MiniBar pct={e.pct} />
                    </td>
                    <td className={cn(TD, 'whitespace-nowrap text-ink-muted')}>{e.last}</td>
                    <td className={TD}>
                      <Tag className={ETAB_TONE[e.state]}>{ETAB_STATE[e.state]}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!res.rows.length && (
            <p className="m-0 p-6 text-center text-ink-muted">
              Aucun établissement avec ces filtres.
            </p>
          )}
          <ListFooter
            page={page}
            perPage={perPage}
            total={res.total}
            suffix={` · ${nf.format(res.zoneTotal)} établissement${res.zoneTotal > 1 ? 's' : ''} dans les villes ouvertes · ${nf.format(res.allTotal)} au total`}
          />
        </Card>
      </div>
    );
  } else {
    const level =
      one('resultat') === 'erreurs' ? 'err' : one('resultat') === 'avertissements' ? 'warn' : null;
    const days = one('periode') === 'tout' ? null : one('periode') === '30' ? 30 : 7;
    const source = one('source') || null;
    const [runs, sources] = await Promise.all([
      runsPage({ source, level, days }),
      getSourcesWithHealth(),
    ]);
    panel = (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Sel
            param="source"
            label="Source"
            value={source ?? ''}
            options={[
              { value: '', label: 'Toutes les sources' },
              ...sources.map((s) => ({ value: s.key, label: s.name })),
            ]}
          />
          <Sel
            param="resultat"
            label="Résultat"
            value={one('resultat')}
            options={[
              { value: '', label: 'Tous les passages' },
              { value: 'erreurs', label: 'Avec erreurs' },
              { value: 'avertissements', label: 'Avec avertissements' },
            ]}
          />
          <Sel
            param="periode"
            label="Période"
            value={one('periode') || '7'}
            defaultValue="7"
            options={[
              { value: '7', label: '7 derniers jours' },
              { value: '30', label: '30 derniers jours' },
              { value: 'tout', label: 'Tout' },
            ]}
          />
          <ClearFilters params={['source', 'resultat', 'periode']} />
        </div>
        <RunList
          key={`${source}|${level}|${days}`}
          initial={runs.rows}
          next={runs.next}
          filters={{ source, level, days }}
        />
        <p className="m-0 text-[12px] text-ink-muted">
          Les passages sont gardés 90 jours, le détail ligne par ligne 30 jours.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Données</span>
          <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Récupération
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <Link href="/admin/recuperation/rapprochements" className="font-semibold">
            Rapprochements
          </Link>
          <Link href="/admin/recuperation/programmes" className="font-semibold">
            Programmes
          </Link>
          <Link
            href="/admin/parametres?onglet=collecte"
            className="inline-flex min-h-10 items-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-4 font-bold text-ink no-underline hover:border-ink dark:border-border-control"
          >
            Règles de collecte
          </Link>
        </div>
      </div>
      <UrlTabs
        current={tab}
        tabs={[
          { key: 'a-traiter', label: 'À traiter', count: todoCount },
          { key: 'sources', label: 'Sources' },
          { key: 'etablissements', label: 'Établissements' },
          { key: 'journal', label: 'Journal' },
        ]}
      />
      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {panel}
      </div>
    </>
  );
}
