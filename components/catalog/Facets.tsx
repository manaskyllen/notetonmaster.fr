'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import type { FacetOption, Facets } from '@/lib/catalog/browse';
import {
  ACCESS,
  activeCount,
  ENTRIES,
  filtersToParams,
  MODALITIES,
  PLACES,
  RADII,
  REVIEWS,
  type Filters,
} from '@/lib/catalog/filters';
import { gradeColor } from '@/lib/domain/rating';
import { normalize } from '@/lib/domain/search';
import { DEFAULT_KINDS, ESTABLISHMENT_KINDS, type EstablishmentKind } from '@/lib/domain/sector';
import { ListSearch } from './ListSearch';
import { cancelUrlUpdate, liveParams } from '@/lib/url-update';

/**
 * Faceted filters of a program list. Every option shows the number of programs
 * the visitor would get by ticking it, with all the other filters but those of its group. Every
 * change goes to the URL (shareable, back button), page 1, the Compare selection kept.
 */
export type FacetGroup =
  | 'q'
  | 'domaine'
  | 'mention'
  | 'lieu'
  | 'etab'
  | 'type'
  | 'composante'
  | 'modalite'
  | 'entree'
  | 'acces'
  | 'places'
  | 'avis';

export interface FacetsProps {
  facets: Facets;
  filters: Filters;
  domains: { slug: string; name: string }[];
  /** Groups shown, in order (a mention page has no « Mention » facet…). */
  groups: FacetGroup[];
  searchPlaceholder: string;
  /** « Chercher dans les 40 parcours de Droit… »: noun of the total. */
  noun?: string;
}

const nf = new Intl.NumberFormat('fr-FR');
const STORE = 'nm-facets-collapsed';

function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const apply = (f: Filters) => {
    // From the address as it is now, and a search still waiting is dropped (lib/url-update.ts).
    cancelUrlUpdate();
    const p = liveParams();
    for (const [k, v] of Object.entries(filtersToParams(f))) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('page');
    const qs = p.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { apply, pending };
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Collapsed groups, remembered for the visitor. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once after mount
      if (Array.isArray(v)) setCollapsed(v);
    } catch {
      /* no storage */
    }
  }, []);
  const flip = (g: string) =>
    setCollapsed((xs) => {
      const n = toggle(xs, g);
      try {
        localStorage.setItem(STORE, JSON.stringify(n));
      } catch {
        /* no storage */
      }
      return n;
    });
  return { collapsed, flip };
}

function Group({
  id,
  title,
  active,
  collapsed,
  onFlip,
  children,
}: {
  id: string;
  title: string;
  active: number;
  collapsed: boolean;
  onFlip: () => void;
  children: React.ReactNode;
}) {
  const panel = `facet-${id}`;
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3.5 first:border-t-0 first:pt-0">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={panel}
          onClick={onFlip}
          className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left text-[13px] font-bold tracking-[0.05em] text-ink uppercase"
        >
          <span className="flex items-center gap-2">
            {title}
            {active > 0 && (
              <span className="rounded-pill bg-violet-500 px-2 py-0.5 text-[11px] text-white">
                {active}
                <span className="sr-only"> actif{active > 1 ? 's' : ''}</span>
              </span>
            )}
          </span>
          <Icon
            name="arrow"
            size={16}
            className={cn('transition-transform', collapsed ? 'rotate-90' : '-rotate-90')}
          />
        </button>
      </h3>
      <div id={panel} hidden={collapsed} className="flex flex-col gap-1">
        {children}
      </div>
    </section>
  );
}

function Check({
  label,
  count,
  checked,
  onChange,
  swatch,
  hint,
}: {
  label: string;
  count: number | null;
  checked: boolean;
  onChange: () => void;
  swatch?: string;
  hint?: string | null;
}) {
  // Optimistic: the box follows the click at once, the server answer confirms it.
  const [state, setState] = useState({ on: checked, from: checked });
  // A new value from the server wins over the optimistic one.
  const on = state.from === checked ? state.on : checked;
  const setOn = (f: (v: boolean) => boolean) => setState({ on: f(on), from: checked });
  const empty = count === 0 && !on;
  return (
    <label
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-1 text-[14px] hover:bg-surface-50',
        empty && 'text-ink-muted',
      )}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={() => {
          setOn((v) => !v);
          onChange();
        }}
        className="size-4.5 flex-none accent-violet-500"
      />
      {swatch && (
        <span
          aria-hidden="true"
          className="size-3 flex-none rounded-[4px]"
          style={{ background: swatch }}
        />
      )}
      <span className="min-w-0 flex-1">
        {label}
        {hint && <span className="text-[12px] text-ink-muted"> · {hint}</span>}
      </span>
      {count != null && (
        <span className="text-[12px] font-semibold text-ink-muted tabular-nums">
          {nf.format(count)}
        </span>
      )}
    </label>
  );
}

/** Fixed options (modalities, entry, access…): zero options greyed, at the bottom, behind a link. */
function OptionList({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string; count: number; hint?: string | null; swatch?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const full = options.filter((o) => o.count > 0 || selected.includes(o.id));
  const empty = options.filter((o) => o.count === 0 && !selected.includes(o.id));
  return (
    <>
      {[...full, ...(showEmpty ? empty : [])].map((o) => (
        <Check
          key={o.id}
          label={o.label}
          hint={o.hint}
          swatch={o.swatch}
          count={o.count}
          checked={selected.includes(o.id)}
          onChange={() => onToggle(o.id)}
        />
      ))}
      {empty.length > 0 && (
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="cursor-pointer self-start border-0 bg-transparent p-1 text-[13px] font-semibold text-violet-500 underline"
        >
          {showEmpty ? 'Masquer les options vides' : `Afficher les options vides (${empty.length})`}
        </button>
      )}
    </>
  );
}

/** Text field with a list of matching options (mentions, places): ARIA combobox. */
function FacetAutocomplete({
  label,
  placeholder,
  options,
  selected,
  onToggle,
}: {
  label: string;
  placeholder: string;
  options: (FacetOption & { kind?: string })[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const words = normalize(text).split(/\s+/).filter(Boolean);
    return options
      .filter((o) => words.every((w) => normalize(`${o.label} ${o.extra}`).includes(w)))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [options, text]);
  const pick = (o: FacetOption) => {
    onToggle(o.key);
    setText('');
    setOpen(false);
  };
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={`${id}-in`} className="sr-only">
        {label}
      </label>
      <input
        id={`${id}-in`}
        role="combobox"
        aria-expanded={open && text.trim() !== '' && matches.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-o${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        className="nm-control min-h-11 w-full text-[14px]"
      />
      {open && text.trim() !== '' && matches.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="nm-acpanel absolute top-full z-30 mt-1 flex max-h-72 w-full list-none flex-col overflow-auto rounded-md border border-border bg-surface-0 p-1 shadow-[0_12px_30px_rgba(22,19,31,.15)]"
        >
          {matches.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseMove={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-[14px]',
                i === active && 'bg-surface-100',
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">
                  {selected.includes(o.key) && <span className="sr-only">Sélectionné : </span>}
                  {o.label}
                </span>
                {(o.kind || o.extra) && (
                  <span className="truncate text-[12px] text-ink-muted">
                    {[o.kind, o.extra].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="text-[12px] font-semibold text-ink-muted tabular-nums">
                {nf.format(o.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {selected.map((k) => {
            const o = options.find((x) => x.key === k);
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onToggle(k)}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-pill border-0 bg-night px-3 text-[13px] font-semibold text-on-night"
                >
                  {o?.label ?? k}
                  {o && <span className="text-on-night-muted"> · {nf.format(o.count)}</span>}
                  <Icon name="close" size={12} />
                  <span className="sr-only">(retirer)</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sortKey = (s: string) =>
  normalize(s)
    .replace(/^(universite|institut|ecole)( (de|d|du|des|de la))? /, '')
    .toUpperCase();

/** « Voir les 112 établissements »: a dialog with a search, letters A–Z and counts. */
function EstablishmentDialog({
  options,
  selected,
  onToggle,
}: {
  options: FacetOption[];
  selected: string[];
  onToggle: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const sorted = useMemo(
    () => [...options].sort((a, b) => sortKey(a.label).localeCompare(sortKey(b.label), 'fr')),
    [options],
  );
  const shown = sorted.filter((o) =>
    normalize(text)
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => normalize(`${o.label} ${o.extra}`).includes(w)),
  );
  const firstOf = new Map<string, string>();
  for (const o of shown) {
    const l = sortKey(o.label)[0] ?? '';
    if (!firstOf.has(l)) firstOf.set(l, o.key);
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer self-start border-0 bg-transparent p-1 text-[13px] font-semibold text-violet-500 underline"
      >
        Voir les {options.length} établissements
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId} size="l">
        <div className="flex max-h-[80vh] flex-col gap-3">
          <h2 id={titleId} className="m-0 font-display text-[24px] font-extrabold">
            Établissements
          </h2>
          <label className="flex flex-col gap-1 text-[14px] font-semibold">
            Chercher un établissement
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="nm-control min-h-11 text-[14px] font-normal"
              placeholder="Nantes, Sorbonne, INSA…"
            />
          </label>
          <nav aria-label="Lettres" className="flex flex-wrap gap-1">
            {LETTERS.map((l) =>
              firstOf.has(l) ? (
                <button
                  key={l}
                  type="button"
                  onClick={() =>
                    list.current
                      ?.querySelector(`[data-key="${CSS.escape(firstOf.get(l)!)}"]`)
                      ?.scrollIntoView({ block: 'start' })
                  }
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface-0 text-[13px] font-bold"
                >
                  {l}
                </button>
              ) : (
                <span
                  key={l}
                  aria-hidden="true"
                  className="inline-flex size-8 items-center justify-center text-[13px] text-ink-muted opacity-40"
                >
                  {l}
                </span>
              ),
            )}
          </nav>
          <ul ref={list} className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-auto p-0">
            {shown.map((o) => (
              <li key={o.key} data-key={o.key} title={o.extra || undefined}>
                <Check
                  label={o.label}
                  hint={o.extra && o.extra !== o.label ? o.extra : null}
                  count={o.count}
                  checked={selected.includes(o.key)}
                  onChange={() => onToggle(o.key)}
                />
              </li>
            ))}
          </ul>
          <Button variant="night" onClick={() => setOpen(false)} className="self-end">
            Fermer
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** Every option of a group, with its count (0 when the facet query did not return it). */
const countsOf = (facets: Facets, g: string) =>
  new Map((facets[g] ?? []).map((o) => [o.key, o.count] as const));

export function FacetPanel({
  facets,
  filters: f,
  domains,
  groups,
  searchPlaceholder,
}: FacetsProps) {
  const { apply } = useFilterNav();
  const { collapsed, flip } = useCollapsed();
  const set = (patch: Partial<Filters>) => apply({ ...f, ...patch });

  const kinds = f.types.length ? f.types : DEFAULT_KINDS;
  const disciplines = facets.discipline ?? [];
  const places = [
    // open cities first: the city and its intercommunality (home pills link here)
    ...[...(facets.zone ?? [])]
      .sort((a, b) => Number(a.extra) - Number(b.extra))
      .map((o) => ({
        ...o,
        key: `zone:${o.key}`,
        kind: 'Ville ouverte',
        label: `${o.label} et agglomération`,
        extra: '',
      })),
    ...(facets.region ?? []).map((o) => ({ ...o, key: `reg:${o.key}`, kind: 'Région', extra: '' })),
    ...(facets.departement ?? []).map((o) => ({
      ...o,
      key: `dep:${o.key}`,
      kind: 'Département',
      label: `${o.label} (${o.key})`,
    })),
    ...(facets.ville ?? []).map((o) => ({ ...o, kind: 'Ville' })),
    ...(facets.etranger ?? [])
      .filter((o) => o.count > 0)
      .map((o) => ({ ...o, kind: 'Hors de France' })),
  ];
  const etabs = [...(facets.etab ?? [])].sort((a, b) => b.count - a.count);
  const topEtabs = etabs.slice(0, 8);
  const extraSelected = f.etabs.filter((k) => !topEtabs.some((o) => o.key === k));
  const radiusCity = f.lieux.find((l) => l.startsWith('insee:'));

  const block = (id: FacetGroup, title: string, active: number, body: React.ReactNode) => (
    <Group
      key={id}
      id={id}
      title={title}
      active={active}
      collapsed={collapsed.includes(id)}
      onFlip={() => flip(id)}
    >
      {body}
    </Group>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((id) => {
        switch (id) {
          case 'q':
            return (
              <div key="q">
                <ListSearch placeholder={searchPlaceholder} />
              </div>
            );
          case 'domaine': {
            const dCounts = countsOf(facets, 'domaine');
            return block(
              'domaine',
              'Domaine et discipline',
              f.domaines.length + f.disciplines.length,
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {domains.map((d) => {
                  const subs = disciplines
                    .filter((x) => x.extra === d.slug)
                    .sort((a, b) => b.count - a.count);
                  const on = f.domaines.includes(d.slug);
                  return (
                    <li key={d.slug}>
                      <Check
                        label={d.name}
                        count={dCounts.get(d.slug) ?? 0}
                        checked={on}
                        onChange={() =>
                          set({
                            domaines: toggle(f.domaines, d.slug),
                            // A ticked domain covers its disciplines.
                            disciplines: f.disciplines.filter(
                              (s) => !subs.some((x) => x.key === s),
                            ),
                          })
                        }
                      />
                      {subs.length > 0 && (
                        <ul className="m-0 flex list-none flex-col gap-0.5 border-l border-border py-0 pl-3.5 ml-3">
                          {subs.map((s) => (
                            <li key={s.key}>
                              <Check
                                label={s.label}
                                count={s.count}
                                checked={on || f.disciplines.includes(s.key)}
                                onChange={() =>
                                  on
                                    ? set({
                                        domaines: f.domaines.filter((x) => x !== d.slug),
                                        disciplines: [
                                          ...f.disciplines,
                                          ...subs.filter((x) => x.key !== s.key).map((x) => x.key),
                                        ],
                                      })
                                    : set({ disciplines: toggle(f.disciplines, s.key) })
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>,
            );
          }
          case 'mention':
            return block(
              'mention',
              'Mention',
              f.mentions.length,
              <FacetAutocomplete
                label="Mention"
                placeholder="Droit, informatique…"
                options={facets.mention ?? []}
                selected={f.mentions}
                onToggle={(k) => set({ mentions: toggle(f.mentions, k) })}
              />,
            );
          case 'lieu':
            return block(
              'lieu',
              'Lieu',
              f.lieux.length,
              <>
                <FacetAutocomplete
                  label="Ville, département ou région"
                  placeholder="Ville, département ou région"
                  options={places}
                  selected={f.lieux}
                  onToggle={(k) => set({ lieux: toggle(f.lieux, k), rayon: null })}
                />
                {(facets.etranger?.[0]?.count ?? 0) > 0 && !f.lieux.includes('etranger') && (
                  <Check
                    label="À l’étranger"
                    count={facets.etranger![0]!.count}
                    checked={false}
                    onChange={() => set({ lieux: [...f.lieux, 'etranger'] })}
                  />
                )}
                {radiusCity && (
                  <label className="flex items-center gap-2 text-[14px]">
                    Dans un rayon de
                    <select
                      value={f.rayon ?? ''}
                      onChange={(e) =>
                        set({ rayon: e.target.value ? Number(e.target.value) : null })
                      }
                      className="nm-control w-auto min-h-10 text-[14px]"
                    >
                      <option value="">la ville seule</option>
                      {RADII.map((r) => (
                        <option key={r} value={r}>
                          {r} km
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>,
            );
          case 'etab':
            return block(
              'etab',
              'Établissement',
              f.etabs.length,
              <>
                {[...topEtabs, ...etabs.filter((o) => extraSelected.includes(o.key))].map((o) => (
                  <span key={o.key} title={o.extra}>
                    <Check
                      label={o.label}
                      count={o.count}
                      checked={f.etabs.includes(o.key)}
                      onChange={() => set({ etabs: toggle(f.etabs, o.key) })}
                    />
                  </span>
                ))}
                {etabs.length > 8 && (
                  <EstablishmentDialog
                    options={etabs}
                    selected={f.etabs}
                    onToggle={(k) => set({ etabs: toggle(f.etabs, k) })}
                  />
                )}
              </>,
            );
          case 'type': {
            const c = countsOf(facets, 'type');
            return block(
              'type',
              'Type d’établissement',
              f.types.length,
              ESTABLISHMENT_KINDS.map((k) => (
                <Check
                  key={k.id}
                  label={k.label}
                  count={c.get(k.id) ?? 0}
                  checked={kinds.includes(k.id)}
                  onChange={() => {
                    const next = toggle(kinds, k.id) as EstablishmentKind[];
                    // Back to the default (public ones) = no parameter.
                    const isDefault =
                      next.length === DEFAULT_KINDS.length &&
                      DEFAULT_KINDS.every((x) => next.includes(x));
                    set({ types: isDefault ? [] : next.length ? next : DEFAULT_KINDS });
                  }}
                />
              )),
            );
          }
          case 'composante': {
            const opts = [...(facets.composante ?? [])].sort((a, b) => b.count - a.count);
            return block(
              'composante',
              'Composante',
              f.composantes.length,
              opts.length > 10 ? (
                <FacetAutocomplete
                  label="Composante"
                  placeholder="UFR, institut…"
                  options={opts}
                  selected={f.composantes}
                  onToggle={(k) => set({ composantes: toggle(f.composantes, k) })}
                />
              ) : (
                opts.map((o) => (
                  <Check
                    key={o.key}
                    label={o.label}
                    count={o.count}
                    checked={f.composantes.includes(o.key)}
                    onChange={() => set({ composantes: toggle(f.composantes, o.key) })}
                  />
                ))
              ),
            );
          }
          case 'modalite': {
            const c = countsOf(facets, 'modalite');
            return block(
              'modalite',
              'Modalité',
              f.modalites.length,
              <OptionList
                options={MODALITIES.map((m) => ({
                  id: m.id,
                  label: m.label,
                  count: c.get(m.id) ?? 0,
                }))}
                selected={f.modalites}
                onToggle={(k) => set({ modalites: toggle(f.modalites, k) })}
              />,
            );
          }
          case 'entree': {
            const c = countsOf(facets, 'entree');
            return block(
              'entree',
              'Entrée',
              f.entrees.length,
              <OptionList
                options={ENTRIES.map((m) => ({
                  id: m.id,
                  label: m.label,
                  count: c.get(m.id) ?? 0,
                }))}
                selected={f.entrees}
                onToggle={(k) => set({ entrees: toggle(f.entrees, k) })}
              />,
            );
          }
          case 'acces': {
            const c = countsOf(facets, 'acces');
            return block(
              'acces',
              'Accessibilité',
              f.acces.length,
              <OptionList
                options={ACCESS.map((m) => ({
                  id: m.id,
                  label: m.label,
                  hint: m.hint,
                  count: c.get(m.id) ?? 0,
                }))}
                selected={f.acces}
                onToggle={(k) => set({ acces: toggle(f.acces, k) })}
              />,
            );
          }
          case 'places': {
            const c = countsOf(facets, 'places');
            return block(
              'places',
              'Places',
              f.places.length,
              <OptionList
                options={PLACES.map((m) => ({ id: m.id, label: m.label, count: c.get(m.id) ?? 0 }))}
                selected={f.places}
                onToggle={(k) => set({ places: toggle(f.places, k) })}
              />,
            );
          }
          case 'avis': {
            const c = countsOf(facets, 'avis');
            return block(
              'avis',
              'Avis',
              f.avis.length,
              <OptionList
                options={REVIEWS.map((m) => ({
                  id: m.id,
                  label: m.label,
                  count: c.get(m.id) ?? 0,
                  swatch: 'grade' in m ? gradeColor(m.grade) : undefined,
                }))}
                selected={f.avis}
                onToggle={(k) => set({ avis: toggle(f.avis, k) })}
              />,
            );
          }
        }
      })}
    </div>
  );
}

/**
 * Desktop: the panel in a sticky 300px column. Mobile: « Filtres (3) » opens it full screen, with
 * « Voir 312 parcours » at the bottom, kept up to date.
 */
export function FacetsShell(props: FacetsProps & { noun?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const n = activeCount(props.filters);
  const total = props.facets.total;
  const noun = props.noun ?? 'parcours';
  return (
    <>
      <aside
        aria-label="Filtres"
        className="sticky top-20 flex max-h-[calc(100vh-6rem)] w-[300px] flex-none flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface-0 p-5 max-lg:hidden"
      >
        <span className="font-display text-[20px] font-extrabold">Filtres</span>
        <FacetPanel {...props} />
      </aside>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-tap cursor-pointer items-center gap-2 self-start rounded-pill border-[1.5px] border-ink bg-surface-0 px-4 text-[15px] font-semibold text-ink lg:hidden"
      >
        <Icon name="filter" size={18} />
        Filtres{n ? ` (${n})` : ''}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        className="nm-facets-sheet"
      >
        <div className="flex h-full flex-col gap-4">
          <h2 id={titleId} className="m-0 pr-14 font-display text-[24px] font-extrabold">
            Filtres
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Only while open: one keyword field (⌘K target, ids) on the page at a time. */}
            {open && <FacetPanel {...props} />}
          </div>
          <Button variant="primary" size="form" onClick={() => setOpen(false)}>
            Voir {nf.format(total)} {noun}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** Active filters as removable chips, above the results, with « Tout effacer ». */
export function ActiveFilters({
  facets,
  filters: f,
  domains,
}: Pick<FacetsProps, 'facets' | 'filters' | 'domains'>) {
  const { apply } = useFilterNav();
  const label = (g: string, k: string) => (facets[g] ?? []).find((o) => o.key === k)?.label ?? k;
  const chips: { key: string; text: string; patch: Partial<Filters> }[] = [];
  if (f.q.trim()) chips.push({ key: 'q', text: `« ${f.q.trim()} »`, patch: { q: '' } });
  for (const d of f.domaines)
    chips.push({
      key: `d:${d}`,
      text: domains.find((x) => x.slug === d)?.name ?? d,
      patch: { domaines: f.domaines.filter((x) => x !== d) },
    });
  for (const d of f.disciplines)
    chips.push({
      key: `s:${d}`,
      text: label('discipline', d),
      patch: { disciplines: f.disciplines.filter((x) => x !== d) },
    });
  for (const m of f.mentions)
    chips.push({
      key: `m:${m}`,
      text: label('mention', m),
      patch: { mentions: f.mentions.filter((x) => x !== m) },
    });
  for (const l of f.lieux) {
    const [k, v = ''] = l.split(/:(.*)/s);
    const text =
      k === 'zone'
        ? `${label('zone', v)} et agglomération`
        : k === 'reg'
          ? label('region', v)
          : k === 'dep'
            ? label('departement', v)
            : k === 'etranger'
              ? 'À l’étranger'
              : label('ville', l);
    chips.push({
      key: `l:${l}`,
      text: f.rayon && l.startsWith('insee:') ? `${text} (${f.rayon} km)` : text,
      patch: { lieux: f.lieux.filter((x) => x !== l), rayon: null },
    });
  }
  for (const e of f.etabs)
    chips.push({
      key: `e:${e}`,
      text: label('etab', e),
      patch: { etabs: f.etabs.filter((x) => x !== e) },
    });
  for (const t of f.types)
    chips.push({
      key: `t:${t}`,
      text: ESTABLISHMENT_KINDS.find((x) => x.id === t)?.label ?? t,
      patch: { types: f.types.filter((x) => x !== t) },
    });
  for (const c of f.composantes)
    chips.push({
      key: `c:${c}`,
      text: c,
      patch: { composantes: f.composantes.filter((x) => x !== c) },
    });
  const fixed: [keyof Filters, readonly { id: string; label: string }[]][] = [
    ['modalites', MODALITIES],
    ['entrees', ENTRIES.map((e) => ({ ...e, label: `Entrée en ${e.label}` }))],
    ['acces', ACCESS],
    ['places', PLACES.map((p) => ({ ...p, label: `${p.label} places` }))],
    ['avis', REVIEWS],
  ];
  for (const [key, opts] of fixed)
    for (const v of f[key] as string[])
      chips.push({
        key: `${key}:${v}`,
        text: opts.find((o) => o.id === v)?.label ?? v,
        patch: { [key]: (f[key] as string[]).filter((x) => x !== v) } as Partial<Filters>,
      });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtres actifs" role="group">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => apply({ ...f, ...c.patch })}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border-0 bg-night px-3.5 text-[13px] font-semibold text-on-night"
        >
          {c.text}
          <Icon name="close" size={12} />
          <span className="sr-only">(retirer ce filtre)</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          apply({
            ...f,
            q: '',
            domaines: [],
            disciplines: [],
            mentions: [],
            lieux: [],
            rayon: null,
            etabs: [],
            types: [],
            modalites: [],
            entrees: [],
            acces: [],
            places: [],
            avis: [],
            composantes: [],
          })
        }
        className="min-h-9 cursor-pointer border-0 bg-transparent px-1 text-[14px] font-semibold text-violet-500 underline"
      >
        Tout effacer
      </button>
    </div>
  );
}
