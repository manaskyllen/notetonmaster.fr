'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BrandName } from '@/components/ui/BrandName';
import { formatGrade } from '@/components/ui/Grade';
import { cn } from '@/lib/cn';
import { gradeColor } from '@/lib/domain/rating';
import type { HomeZone } from '@/lib/home/data';
import {
  citiesTyped,
  explorerHref,
  explorerParams,
  highlight,
  plural,
  type Quick,
} from '@/lib/home/labels';

/** Phones: the list stays above the virtual keyboard (height of the visible viewport). */
function useFitAboveKeyboard(root: React.RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv || !window.matchMedia('(max-width: 760px)').matches) return;
    const fit = () => {
      const box = root.current?.parentElement;
      const top = Math.max(0, box?.getBoundingClientRect().bottom ?? 0);
      box?.style.setProperty('--nm-ac-max', `${Math.max(320, vv.height - top - 16)}px`);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit, { passive: true });
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      window.removeEventListener('scroll', fit);
    };
  }, [root, on]);
}
import type { SuggestAnswer } from '@/lib/home/suggest';

/**
 * Suggestions of « Quoi ? » (MainV2 mockup), loaded by the home search at the first interaction
 * with the form (import()), never with the page. Asks GET /api/suggest 150 ms after the last
 * keystroke, aborts a stale request, keeps the latest answers in memory; the previous list stays
 * until the new one arrives. ARIA listbox with one group per kind, in the order of the arrows.
 */

export interface PanelKeys {
  /** Arrows and Enter from the field: true when handled. */
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
}

export interface SuggestPanelProps {
  id: string;
  q: string;
  city: string | null;
  quick: Quick;
  open: boolean;
  zones: HomeZone[];
  frequent: { name: string; parcours: number }[];
  tries: string[];
  domains: { slug: string; name: string; tone: string }[];
  /** Gives the field its key handler (arrows, Enter), null when unmounted. */
  registerKeys: (k: PanelKeys | null) => void;
  onActive: (id: string | undefined) => void;
  onLive: (text: string) => void;
  /** Number of masters of the current search (the button), when known. */
  onCount: (n: number) => void;
  onFill: (text: string) => void;
  onCity: (slug: string) => void;
  onGo: (href: string) => void;
}

type Kind = 'pop' | 'search' | 'city' | 'mention' | 'parcours' | 'uni';
interface Item {
  key: string;
  kind: Kind;
  label: string;
  /** false: the label is ours (« Voir les 12 masters… »), nothing to highlight in it. */
  marks: boolean;
  sub?: string;
  code?: string | null;
  right?: string;
  note?: number | null;
  tone?: string;
  act: () => void;
}

/** Latest answers of the visit: going back to a query shows it at once. */
const memory = new Map<string, SuggestAnswer | { q: string; count: number }>();
function remember(key: string, a: SuggestAnswer | { q: string; count: number }) {
  memory.delete(key);
  memory.set(key, a);
  if (memory.size > 40) memory.delete(memory.keys().next().value!);
}
const DELAY = 150;

const TONE_BG: Record<string, [string, string]> = {
  violet: ['var(--violet-500)', '#ffffff'],
  lime: ['var(--lime-400)', 'var(--on-lime)'],
  coral: ['var(--coral-300)', 'var(--on-lime)'],
  night: ['var(--night)', '#ffffff'],
};
const ICON_CLASS: Record<Exclude<Kind, 'mention'>, string> = {
  search: 'bg-ink text-surface-0',
  pop: 'bg-surface-100 text-ink',
  city: 'bg-lime-400 text-on-lime',
  parcours: 'bg-violet-100 text-violet-700',
  uni: 'bg-coral-100 text-coral-800',
};
const ICON_PATHS: Record<Kind, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  pop: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  mention: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  parcours: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.5" />
    </>
  ),
  city: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  uni: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 20h18" />
    </>
  ),
};

function Marked({ text, q, on }: { text: string; q: string; on: boolean }) {
  if (!on) return <>{text}</>;
  return <>{highlight(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}

export function SuggestPanel(p: SuggestPanelProps) {
  const { q, city, quick, open } = p;
  const query = q.trim();
  const params = useMemo(
    () => explorerParams({ q: query, city, quick }).toString(),
    [query, city, quick],
  );
  // The count alone while the list is closed (a quick filter changed): lighter.
  const key = query ? `${params}${open ? '' : '&mode=count'}` : '';
  const [answer, setAnswer] = useState<SuggestAnswer | null>(null);
  const [, start] = useTransition();
  const [hi, setHi] = useState(0);
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });

  useEffect(() => {
    if (!key) return;
    const known = memory.get(key) ?? (open ? undefined : memory.get(params));
    const apply = (a: SuggestAnswer | { q: string; count: number }) => {
      props.current.onCount(a.count);
      if ('programs' in a) start(() => setAnswer(a));
    };
    if (known) {
      const t = window.setTimeout(() => apply(known), 0);
      return () => window.clearTimeout(t);
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?${key}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const a = (await res.json()) as SuggestAnswer | { q: string; count: number };
        remember(key, a);
        apply(a);
      } catch {
        // aborted (a newer keystroke) or offline: the previous list stays
      }
    }, DELAY);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [key, params, open]);

  const zone = p.zones.find((z) => z.slug === city) ?? null;
  const tones = useMemo(() => new Map(p.domains.map((d) => [d.slug, d])), [p.domains]);
  const typed = useMemo(() => (query ? citiesTyped(p.zones, query) : []), [p.zones, query]);
  const fresh = !!answer && answer.q === query;
  const a = query ? answer : null;

  // Groups, in the order of the arrows.
  const groups: { title: string; items: Item[] }[] = [];
  if (!query) {
    groups.push({
      title: 'Recherches fréquentes',
      items: p.frequent.map((f) => ({
        key: `pop:${f.name}`,
        kind: 'pop',
        label: f.name,
        marks: false,
        right: plural(f.parcours, 'parcours', 'parcours'),
        act: () => p.onFill(f.name),
      })),
    });
  } else {
    if (typed.length)
      groups.push({
        title: 'Villes',
        items: typed.slice(0, 2).map((z) => ({
          key: `city:${z.slug}`,
          kind: 'city',
          label: `Masters à ${z.name}`,
          marks: true,
          sub: [z.region, 'choisir cette ville'].filter(Boolean).join(' · '),
          right: plural(z.masters, 'master', 'masters'),
          act: () => p.onCity(z.slug),
        })),
      });
    else if (a && a.count > 0)
      groups.push({
        title: 'Recherche',
        items: [
          {
            key: 'search',
            kind: 'search',
            label: `${a.count > 1 ? `Voir les ${plural(a.count, 'master', 'masters')}` : 'Voir le master'} pour « ${query} »`,
            marks: false,
            sub: zone ? `à ${zone.name}` : 'dans toutes les villes ouvertes',
            act: () => p.onGo(explorerHref({ q: query, city, quick })),
          },
        ],
      });
    if (a?.mentions.length)
      groups.push({
        title: 'Disciplines',
        items: a.mentions.map((m) => ({
          key: `m:${m.slug}`,
          kind: 'mention',
          label: m.name,
          marks: true,
          sub: (m.domain && tones.get(m.domain)?.name) || 'Mention nationale',
          right: plural(m.n, 'parcours', 'parcours'),
          tone: (m.domain && tones.get(m.domain)?.tone) || 'violet',
          act: () => p.onGo(`/mentions/${m.slug}`),
        })),
      });
    if (a?.programs.length)
      groups.push({
        title: 'Masters',
        items: a.programs.map((x) => ({
          key: `p:${x.slug}`,
          kind: 'parcours',
          label: x.title,
          marks: true,
          sub: x.where,
          code: x.code,
          note: x.reviews >= 3 ? x.avg : null,
          right: x.reviews ? plural(x.reviews, 'avis', 'avis') : 'Pas encore d’avis',
          act: () => p.onGo(`/parcours/${x.slug}`),
        })),
      });
    if (a?.universities.length)
      groups.push({
        title: 'Universités et écoles',
        items: a.universities.map((u) => ({
          key: `u:${u.slug}`,
          kind: 'uni',
          label: u.name,
          marks: true,
          sub: zone ? `à ${zone.name}` : 'Établissement public',
          right: plural(u.n, 'master', 'masters'),
          act: () => p.onGo(`/universites/${u.slug}`),
        })),
      });
  }
  const flat = groups.flatMap((g) => g.items);
  const nothing =
    !!query && fresh && !typed.length && !flat.length && !answer!.notYet ? true : false;
  const notYet = query && fresh && !typed.length && !flat.length ? answer!.notYet : null;
  const active = flat.length ? Math.min(hi, flat.length - 1) : -1;
  // What the key handler reads, always the latest render's.
  const current = useRef({ flat, active });
  useEffect(() => {
    current.current = { flat, active };
  });
  const optionId = (i: number) => `${p.id}-o${i}`;
  const flatKeys = flat.map((i) => i.key).join('|');

  // A new list starts on its first row.
  useEffect(() => {
    const t = window.setTimeout(() => setHi(0), 0);
    return () => window.clearTimeout(t);
  }, [flatKeys]);

  // The field points at the highlighted row; the live region says what is there.
  const activeId = open && active >= 0 ? optionId(active) : undefined;
  const live = !open
    ? ''
    : notYet
      ? `${notYet.place} n’est pas encore ouverte.`
      : flat.length
        ? `${flat.length} suggestion${flat.length > 1 ? 's' : ''}. Flèches haut et bas pour choisir.`
        : nothing
          ? 'Aucune suggestion.'
          : '';
  useEffect(() => {
    props.current.onActive(activeId);
  }, [activeId]);
  useEffect(() => {
    props.current.onLive(live);
  }, [live]);

  // Arrows (they loop) and Enter, from the field.
  const { registerKeys } = p;
  useEffect(() => {
    registerKeys({
      onKey: (e) => {
        const rows = current.current.flat;
        if (!rows.length) return false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.key === 'ArrowDown' ? 1 : rows.length - 1;
          // from the latest index, not the one of the last render: keys can come faster
          setHi((h) => (Math.min(Math.max(0, h), rows.length - 1) + step) % rows.length);
          return true;
        }
        const row = rows[current.current.active];
        if (e.key === 'Enter' && row) {
          e.preventDefault();
          row.act();
          return true;
        }
        return false;
      },
    });
    return () => registerKeys(null);
  }, [registerKeys]);

  // The highlighted row stays in view.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (activeId)
      list.current
        ?.querySelector<HTMLElement>(`#${CSS.escape(activeId)}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const root = useRef<HTMLDivElement>(null);
  const shown = open && (flat.length > 0 || !!notYet || nothing);
  useFitAboveKeyboard(root, shown);

  if (!shown) return null;
  let n = 0;
  return (
    <div
      ref={root}
      className="ac-pop absolute top-[calc(100%+10px)] right-0 left-0 z-[21] overflow-hidden rounded-[22px] border-[1.5px] border-[#e4e2ea] bg-surface-0 text-left shadow-[0_28px_70px_rgba(22,19,31,.18)] dark:border-border-control"
    >
      {flat.length > 0 && (
        <ul
          ref={list}
          id={`${p.id}-list`}
          role="listbox"
          aria-label="Suggestions"
          className="m-0 max-h-[min(560px,75vh)] max-sm:max-h-[var(--nm-ac-max,60vh)] list-none overflow-y-auto p-2"
        >
          {groups.map((g) => (
            <li key={g.title} role="presentation" className="py-1">
              <div
                aria-hidden="true"
                className="px-3 pt-2 pb-1 text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase"
              >
                {g.title}
              </div>
              <ul role="group" aria-label={g.title} className="m-0 list-none p-0">
                {g.items.map((it) => {
                  const i = n++;
                  const on = i === active;
                  const [bg, fg] = it.kind === 'mention' ? TONE_BG[it.tone!]! : ['', ''];
                  return (
                    <li
                      key={it.key}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      onClick={it.act}
                      onPointerMove={() => i !== active && setHi(i)}
                      className={cn(
                        'ac-opt flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] px-3 py-1.5',
                        on && 'bg-violet-100 dark:bg-surface-100',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-9 flex-none items-center justify-center rounded-[11px]',
                          it.kind !== 'mention' && ICON_CLASS[it.kind],
                        )}
                        style={it.kind === 'mention' ? { background: bg, color: fg } : undefined}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {ICON_PATHS[it.kind]}
                        </svg>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[16px] font-semibold text-ink">
                          <Marked text={it.label} q={query} on={it.marks} />
                        </span>
                        {(it.sub || it.code) && (
                          <span className="truncate text-[13px] text-ink-muted">
                            {it.sub}
                            {it.code && (
                              <>
                                {it.sub ? ' · ' : ''}
                                <span className="nm-codehit">Trouvé par {it.code}</span>
                              </>
                            )}
                          </span>
                        )}
                      </span>
                      {it.note != null && (
                        <span
                          role="img"
                          aria-label={`Note moyenne : ${formatGrade(it.note)} sur 5`}
                          style={{ backgroundColor: gradeColor(it.note, 5) }}
                          className="inline-flex flex-none -rotate-3 items-baseline rounded-[8px] px-[7px] pt-0.5 pb-[3px] font-display text-[15px] leading-tight font-extrabold text-on-lime tabular-nums"
                        >
                          <span aria-hidden="true">{formatGrade(it.note)}</span>
                          <span aria-hidden="true" className="text-[10px] opacity-80">
                            /5
                          </span>
                        </span>
                      )}
                      {it.right && (
                        <span className="flex-none text-[13px] font-semibold text-ink-soft max-sm:hidden">
                          {it.right}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {notYet && (
        <div className="flex flex-col gap-2.5 px-5.5 pt-5.5 pb-4.5">
          <span className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {notYet.place} n’est pas encore sur <BrandName size="sm" />
          </span>
          <span className="text-[15px] leading-normal text-ink-soft">
            On préfère ouvrir moins de villes, mais avec des fiches justes. La tienne est sur la
            liste. En attendant :
          </span>
          <span className="flex flex-wrap gap-2">
            {p.zones.slice(0, 4).map((z) => (
              <button
                key={z.slug}
                type="button"
                onClick={() => p.onCity(z.slug)}
                className="min-h-11 cursor-pointer rounded-pill border-[1.5px] border-ink bg-surface-0 px-3.5 text-[14px] font-semibold text-ink"
              >
                Masters à {z.name}
              </button>
            ))}
          </span>
        </div>
      )}
      {nothing && (
        <div className="flex flex-col gap-2.5 p-5.5">
          <span className="font-display text-[20px] font-bold">
            Rien pour « {query} »… pour l’instant
          </span>
          <span className="text-[15px] leading-normal text-ink-soft">
            Essaie un mot plus court ou une discipline :
          </span>
          <span className="flex flex-wrap gap-2">
            {p.tries.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => p.onFill(t)}
                className="min-h-11 cursor-pointer rounded-pill border border-dashed border-[#85809a] bg-transparent px-3.5 text-[14px] font-medium text-ink-soft"
              >
                {t}
              </button>
            ))}
          </span>
        </div>
      )}
      <p
        aria-hidden="true"
        className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-t border-surface-100 bg-surface-50 px-4.5 py-2.5 text-[12px] text-ink-muted max-sm:hidden"
      >
        <span>↑ ↓ pour choisir</span>
        <span>Entrée pour ouvrir</span>
        <span>Échap pour fermer</span>
      </p>
    </div>
  );
}
