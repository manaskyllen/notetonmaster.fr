'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import {
  confirmNotRenewed,
  decideParent,
  decideProposals,
  decideFiltered,
  mergeAllRecommended,
  recomputeRun,
} from '@/app/admin/(panel)/recuperation/rapprochements/actions';
import type { ProposalFilters, ProposalItem } from '@/lib/admin/proposals';
import { Pill } from './ui';

const TYPE_LABEL = {
  succession: 'Succession',
  merge: 'Fusion',
  university: 'Université',
  mention: 'Mention ↔ RNCP',
  page: 'Page ↔ parcours',
} as const;

export function ProposalsBoard({
  items,
  filteredCount,
  pageSize,
  filters,
  counts,
  runs,
  canDecide,
  canRun,
  notRenewed,
  parents,
}: {
  items: ProposalItem[];
  filteredCount: number;
  pageSize: number;
  filters: ProposalFilters;
  counts: { recommended: number };
  runs: { id: string; sourceKey: string }[];
  canDecide: boolean;
  canRun: boolean;
  notRenewed: {
    latest: number | null;
    programs: { id: string; title: string; university: string; reviews: number }[];
  };
  parents: {
    childUai: string;
    childName: string;
    parentUai: string;
    parentName: string;
    strength: string;
    evidence: string;
    exists: boolean;
  }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  // Every proposal of the filter, not only the page (confirmed before running).
  const [allFiltered, setAllFiltered] = useState(false);
  const [confirmAll, setConfirmAll] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const id = (i: ProposalItem) => `${i.sourceKey}|${i.key}`;
  const allOnPage = items.length > 0 && items.every((i) => selected.has(id(i)));
  const pages = Math.max(1, Math.ceil(filteredCount / pageSize));

  const setParam = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch))
      if (v) q.set(k, v);
      else q.delete(k);
    if (!('page' in patch)) q.delete('page');
    router.push(`?${q.toString()}`);
  };

  const decide = (accept: boolean) => {
    if (allFiltered && confirmAll === null) {
      setConfirmAll(accept);
      return;
    }
    start(async () => {
      const r = allFiltered
        ? await decideFiltered(filters, accept)
        : await decideProposals([...selected], accept);
      setAllFiltered(false);
      setConfirmAll(null);
      if ('count' in r) {
        setMessage({
          tone: 'success',
          text: `${r.count} proposition(s) ${accept ? 'validée(s)' : 'rejetée(s)'}.${(r.recomputed ?? []).length ? ` Simulation recalculée automatiquement (${(r.recomputed ?? []).join(', ')}) : elle sera prête dans quelques instants.` : ' Elle s’appliquera à la prochaine synchro.'}`,
        });
        setSelected(new Set());
        router.refresh();
      } else setMessage({ tone: 'danger', text: r.error });
    });
  };

  return (
    <>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-0 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setParam({
            type: String(f.get('type') ?? ''),
            source: String(f.get('source') ?? ''),
            universite: String(f.get('universite') ?? ''),
            min: String(f.get('min') ?? ''),
            max: String(f.get('max') ?? ''),
            recommandees: f.get('recommandees') ? '1' : '',
          });
        }}
      >
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Type
          <select
            name="type"
            defaultValue={filters.type ?? ''}
            className="min-h-10 rounded-md border border-border-control bg-surface-0 px-2"
          >
            <option value="">Tous</option>
            <option value="succession">Succession (nouvelle accréditation)</option>
            <option value="merge">Fusion (plusieurs numéros)</option>
            <option value="university">Université</option>
            <option value="mention">Mention ↔ fiche RNCP</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Source
          <select
            name="source"
            defaultValue={filters.source ?? ''}
            className="min-h-10 rounded-md border border-border-control bg-surface-0 px-2"
          >
            <option value="">Toutes</option>
            <option value="monmaster-opendata">Mon Master</option>
            <option value="esr-etablissements">Établissements</option>
            <option value="rncp">RNCP</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Université
          <input
            name="universite"
            defaultValue={filters.university}
            className="min-h-10 rounded-md border border-border-control px-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Score min.
          <input
            name="min"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={filters.scoreMin ?? ''}
            className="min-h-10 w-24 rounded-md border border-border-control px-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Score max.
          <input
            name="max"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={filters.scoreMax ?? ''}
            className="min-h-10 w-24 rounded-md border border-border-control px-2"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold">
          <input name="recommandees" type="checkbox" defaultChecked={filters.recommended} /> Fusions
          recommandées
        </label>
        <Button type="submit" size="s" variant="outline">
          Filtrer
        </Button>
      </form>

      {(canDecide || canRun) && (
        <div className="flex flex-wrap items-center gap-2">
          {canDecide && (
            <>
              <Button
                size="s"
                variant="night"
                disabled={(!selected.size && !allFiltered) || pending}
                onClick={() => decide(true)}
              >
                Valider la sélection ({allFiltered ? filteredCount : selected.size})
              </Button>
              <Button
                size="s"
                variant="outline"
                disabled={(!selected.size && !allFiltered) || pending}
                onClick={() => decide(false)}
              >
                Rejeter la sélection
              </Button>
              <Button
                size="s"
                variant="outline"
                disabled={!counts.recommended || pending}
                onClick={() => setConfirmMerge(true)}
              >
                Fusionner toutes les recommandées ({counts.recommended})
              </Button>
            </>
          )}
          {canRun &&
            runs.map((r) => (
              <Button
                key={r.id}
                size="s"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await recomputeRun(r.id);
                    setMessage(
                      'error' in res && res.error
                        ? { tone: 'danger', text: res.error }
                        : {
                            tone: 'success',
                            text: `Simulation ${r.sourceKey} recalculée en file d’attente (sans retéléchargement).`,
                          },
                    );
                  })
                }
              >
                Recalculer la simulation · {r.sourceKey}
              </Button>
            ))}
        </div>
      )}

      <section aria-label="Propositions" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-[13px] text-ink-muted">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allOnPage}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  for (const i of items) {
                    if (allOnPage) n.delete(id(i));
                    else n.add(id(i));
                  }
                  return n;
                })
              }
            />
            Tout sélectionner sur la page
          </label>
          {allOnPage && filteredCount > items.length && (
            <button
              type="button"
              aria-pressed={allFiltered}
              onClick={() => setAllFiltered((v) => !v)}
              className="cursor-pointer border-0 bg-transparent font-semibold text-violet-500 underline"
            >
              {allFiltered
                ? 'Ne garder que la page'
                : `Sélectionner les ${filteredCount} éléments du filtre`}
            </button>
          )}
          <span>
            {filteredCount} résultat(s) · page {filters.page} / {pages}
          </span>
        </div>
        {confirmAll !== null && (
          <div
            role="alertdialog"
            aria-label="Confirmer"
            className="flex flex-wrap items-center gap-2 rounded-md bg-night px-4 py-3 text-on-night"
          >
            <span className="font-semibold">
              {confirmAll ? 'Valider' : 'Rejeter'} les {filteredCount} propositions du filtre ?
            </span>
            <Button size="s" variant="lime" disabled={pending} onClick={() => decide(confirmAll)}>
              Confirmer
            </Button>
            <Button
              size="s"
              variant="ghost"
              className="text-on-night"
              onClick={() => setConfirmAll(null)}
            >
              Annuler
            </Button>
          </div>
        )}
        {items.length === 0 && <p className="m-0 text-ink-muted">Aucune proposition en attente.</p>}
        {items.map((i) => (
          <article
            key={id(i)}
            className="grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-border bg-surface-0 p-4"
          >
            <input
              type="checkbox"
              aria-label={`Sélectionner : ${i.left.title}`}
              checked={selected.has(id(i))}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(id(i))) n.delete(id(i));
                  else n.add(id(i));
                  return n;
                })
              }
              className="mt-1 h-5 w-5"
            />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={i.type === 'merge' ? 'warning' : 'running'}>{TYPE_LABEL[i.type]}</Pill>
                {i.recommended && <Pill tone="ok">Fusion recommandée</Pill>}
                {i.type === 'merge' && i.groupSize && i.groupSize > 2 && (
                  <span className="text-[13px]">groupe de {i.groupSize} numéros</span>
                )}
                <span className="font-mono text-[13px] font-bold">score {i.score.toFixed(2)}</span>
                <span className="text-[13px] text-ink-muted">{i.reason}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
                <div className="flex flex-col gap-0.5 rounded-md bg-surface-50 p-3 text-[13px]">
                  <span className="text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
                    Enregistrement source
                  </span>
                  <span className="font-bold">{i.left.title}</span>
                  <span>{i.left.university}</span>
                  <span>{i.left.place}</span>
                  {i.left.mention && (
                    <span className="text-ink-muted">Mention : {i.left.mention}</span>
                  )}
                  <span className="font-mono text-[12px] text-ink-muted">
                    {i.left.codes}
                    {i.left.sessions ? ` · sessions ${i.left.sessions}` : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-md bg-surface-50 p-3 text-[13px]">
                  <span className="text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
                    Fiche candidate
                  </span>
                  {i.right ? (
                    <>
                      <span className="font-bold">{i.right.title}</span>
                      <span>{i.right.university}</span>
                      <span>{i.right.city}</span>
                      {i.right.mention && (
                        <span className="text-ink-muted">Mention : {i.right.mention}</span>
                      )}
                      <span className="font-mono text-[12px] text-ink-muted">{i.right.codes}</span>
                    </>
                  ) : (
                    <span className="text-ink-muted">Fiche introuvable</span>
                  )}
                </div>
              </div>
              {i.diffs.length > 0 && (
                <span className="text-[13px]">Diffère : {i.diffs.join(', ')}</span>
              )}
            </div>
          </article>
        ))}
        {pages > 1 && (
          <nav aria-label="Pages" className="flex flex-wrap gap-2">
            {Array.from({ length: pages }, (_, k) => k + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - (filters.page ?? 1)) <= 2)
              .map((p) => (
                <Button
                  key={p}
                  size="s"
                  variant={p === filters.page ? 'night' : 'outline'}
                  onClick={() => setParam({ page: String(p) })}
                >
                  {p}
                </Button>
              ))}
          </nav>
        )}
      </section>

      {notRenewed.programs.length > 0 && (
        <section
          id="non-reconduits"
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4"
        >
          <h2 className="m-0 font-display text-[20px] font-extrabold">
            {notRenewed.programs.length} parcours absents de la session {notRenewed.latest}
          </h2>
          <p className="m-0 text-[13px] text-ink-muted">
            Confirmer les marque « Plus proposé sur Mon Master en {notRenewed.latest} ». Rien n’est
            supprimé : les avis restent visibles.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
            {notRenewed.programs.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={gone.has(p.id)}
                    onChange={() =>
                      setGone((s) => {
                        const n = new Set(s);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      })
                    }
                  />
                  {p.title} · {p.university} · {p.reviews} avis
                </label>
              </li>
            ))}
          </ul>
          {canDecide && (
            <Button
              size="s"
              variant="night"
              disabled={!gone.size || pending}
              onClick={() =>
                start(async () => {
                  const r = await confirmNotRenewed([...gone]);
                  if ('count' in r) {
                    setMessage({
                      tone: 'success',
                      text: `${r.count} parcours marqué(s) non reconduit(s).`,
                    });
                    setGone(new Set());
                    router.refresh();
                  } else setMessage({ tone: 'danger', text: r.error });
                })
              }
            >
              Confirmer la sélection
            </Button>
          )}
        </section>
      )}

      {parents.length > 0 && (
        <section
          id="etablissements-composantes"
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-4"
        >
          <h2 className="m-0 font-display text-[20px] font-extrabold">
            Établissements-composantes suggérés ({parents.length})
          </h2>
          <p className="m-0 text-[13px] text-ink-muted">
            Déduits des données ouvertes (SISE, partenaires RNCP), les plus fiables d’abord. Rien
            n’est rattaché sans décision ; un rattachement validé s’applique dès que les deux fiches
            existent.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            {parents.map((p) => (
              <li
                key={p.childUai}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-50 p-2.5"
              >
                <span>
                  <span className="font-bold">{p.childName}</span> → {p.parentName}{' '}
                  <span className="text-[12px] text-ink-muted">
                    (indice {p.strength} · {p.evidence}
                    {p.exists ? '' : ' · fiches pas encore créées'})
                  </span>
                </span>
                {canDecide && (
                  <span className="flex gap-2">
                    <Button
                      size="s"
                      variant="night"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await decideParent(p.childUai, p.parentUai, true);
                          setMessage(
                            'linked' in r
                              ? {
                                  tone: 'success',
                                  text: r.linked
                                    ? `${p.childName} rattachée.`
                                    : 'Rattachement mémorisé : appliqué quand les deux fiches existeront.',
                                }
                              : { tone: 'danger', text: r.error },
                          );
                          router.refresh();
                        })
                      }
                    >
                      Rattacher
                    </Button>
                    <Button
                      size="s"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await decideParent(p.childUai, p.parentUai, false);
                          setMessage(
                            'linked' in r
                              ? { tone: 'success', text: 'Suggestion rejetée.' }
                              : { tone: 'danger', text: r.error },
                          );
                          router.refresh();
                        })
                      }
                    >
                      Rejeter
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={confirmMerge}
        onClose={() => setConfirmMerge(false)}
        labelledBy="merge-all-title"
      >
        <div className="flex flex-col gap-3 p-5">
          <h2 id="merge-all-title" className="m-0 font-display text-[22px] font-extrabold">
            Fusionner toutes les recommandées ?
          </h2>
          <p className="m-0">
            {counts.recommended} numéros Mon Master seront rattachés à la fiche de leur parcours
            (groupes de 2 numéros aux titres normalisés identiques, hors MEEF). La décision est
            mémorisée, inscrite au journal d’audit, et la simulation est recalculée automatiquement.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="night"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await mergeAllRecommended();
                  setConfirmMerge(false);
                  if ('count' in r) {
                    setMessage({
                      tone: 'success',
                      text: `${r.count} fusion(s) décidée(s).${(r.recomputed ?? []).length ? ' Simulation recalculée automatiquement.' : ''}`,
                    });
                    router.refresh();
                  } else setMessage({ tone: 'danger', text: r.error });
                })
              }
            >
              Fusionner
            </Button>
            <Button variant="outline" onClick={() => setConfirmMerge(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
