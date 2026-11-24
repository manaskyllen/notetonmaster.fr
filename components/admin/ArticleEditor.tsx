'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  createArticle,
  markReviewed,
  previewArticle,
  publishArticle,
  saveArticle,
  unpublishArticle,
} from '@/app/admin/(panel)/articles/actions';
import { ArticleHtml } from '@/components/public/ArticleHtml';
import { Icon } from '@/components/ui/Icon';
import { buttonClasses } from '@/components/ui/button-classes';
import { blockLine, RANKINGS } from '@/lib/articles/blocks';
import type { CheckItem } from '@/lib/articles/checks';
import { DOMAIN_CODES } from '@/lib/articles/figures';
import {
  AUTOSAVE_MS,
  META_MAX,
  STATUS_LABEL,
  THEMES,
  TITLE_MAX,
  slugify,
} from '@/lib/articles/model';
import { cn } from '@/lib/cn';
import type { ArticleStatus, ArticleTheme } from '@/lib/db/generated/enums';

/** « Nouvel article »: a draft, then its editor. */
export function NewArticleButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="flex items-center gap-3">
      {error && <span className="text-[13px] text-danger">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createArticle();
            if (r.ok) router.push(`/admin/articles/${r.id}`);
            else setError(r.error);
          })
        }
        className={buttonClasses('night', 's')}
      >
        <Icon name="plus" size={16} />
        Nouvel article
      </button>
    </span>
  );
}

export interface EditorArticle {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  theme: ArticleTheme;
  lede: string;
  body: string;
  metaDescription: string;
  keyword: string;
  secondaryKeywords: string[];
  searchKeywords: string[];
  relatedSlugs: string[];
  signature: string;
  status: ArticleStatus;
  online: boolean;
  publishedAt: string | null;
  updatedAt: string;
  reviewedAt: string | null;
}

interface Preview {
  editHtml: string;
  previewHtml: string;
  toc: { id: string; text: string }[];
  checklist: CheckItem[];
  score: number;
  words: number;
  blockers: string[];
  menu: { code: string; label: string; value: string | null }[];
  session: number | null;
  dataUpdatedAt: string | null;
  cityName: string | null;
}

type Mode = 'texte' | 'relecture' | 'apercu';

const CARD = 'flex min-w-0 flex-col gap-3 rounded-[18px] border border-border bg-surface-0 p-5';
const LABEL = 'text-[13px] font-bold text-ink';
const INPUT =
  'box-border min-h-11 w-full rounded-[12px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3 text-[15px] text-ink dark:border-border-control';
const TOOL =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-bold text-ink hover:bg-surface-100';
const MENU =
  'absolute top-[calc(100%+6px)] left-0 z-30 w-[min(360px,86vw)] overflow-hidden rounded-[16px] border border-border bg-surface-0 p-1.5 shadow-[0_24px_60px_rgba(22,19,31,.18)]';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

function ago(iso: string | null, now: number | null): string {
  if (!iso || now === null) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `il y a ${h} h` : `le ${dateFmt.format(new Date(iso))}`;
}

const sentences = (s: string) =>
  s.trim()
    ? s
        .trim()
        .split(/[.!?…]+(?:\s|$)/)
        .filter((x) => x.trim()).length
    : 0;
const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Local date-time for <input type="datetime-local"> (Paris time on the team's machines). */
function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BLOCKS = [
  {
    id: 'classement',
    label: 'Classement',
    hint: 'Les plus sélectifs, accessibles, demandés ou grands. Filtre par domaine.',
  },
  {
    id: 'liste',
    label: 'Liste de parcours',
    hint: 'Par mention, par mot du titre ou en alternance.',
  },
  {
    id: 'chiffres-ville',
    label: 'Chiffres de la ville',
    hint: 'Encadré : parcours, établissements, sélectivité, alternance.',
  },
  { id: 'domaines', label: 'Domaines', hint: 'Répartition des parcours par domaine.' },
  {
    id: 'appel-avis',
    label: 'Appel à avis',
    hint: 'Encadré « Donne ton avis » vers le formulaire.',
  },
  { id: 'villes', label: 'Villes ouvertes', hint: 'Liens vers les pages des villes.' },
] as const;

/**
 * Editor of a guide (A11 mockup). The text is Markdown; « Relecture » shows it with the tokens as
 * violet pills (their value, the code on hover) and the blocks as cards with their first lines;
 * « Aperçu » shows the public page with the real figures. A draft is saved automatically, at most
 * every 10 s; a published guide is updated with « Mettre à jour ».
 */
export function ArticleEditor({
  initial,
  cities,
  closedCity,
  others,
  host,
  preview: firstPreview,
  changed,
}: {
  initial: EditorArticle;
  cities: { slug: string; name: string }[];
  closedCity: { slug: string; name: string } | null;
  others: { slug: string; title: string }[];
  host: string;
  preview: Preview;
  changed: { code: string; before: string; after: string }[];
}) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [secondary, setSecondary] = useState(initial.secondaryKeywords.join(', '));
  const [searchWords, setSearchWords] = useState(initial.searchKeywords.join(', '));
  const [when, setWhen] = useState(
    localInput(initial.status === 'SCHEDULED' ? initial.publishedAt : null),
  );
  const [mode, setMode] = useState<Mode>('texte');
  const [preview, setPreview] = useState<Preview>(firstPreview);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error';
    text: string;
    list?: string[];
  } | null>(null);
  // Null until mounted: the server and the first client render say the same thing.
  const [now, setNow] = useState<number | null>(null);
  const [editSlug, setEditSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(initial.slug);
  const [menu, setMenu] = useState<'block' | 'token' | null>(null);
  const [blockForm, setBlockForm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastSave = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const whenRef = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);

  const set = <K extends keyof EditorArticle>(k: K, v: EditorArticle[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  const payload = useCallback(
    () => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      city: a.city,
      theme: a.theme,
      lede: a.lede,
      body: a.body,
      metaDescription: a.metaDescription,
      keyword: a.keyword,
      secondaryKeywords: list(secondary),
      searchKeywords: list(searchWords),
      relatedSlugs: a.relatedSlugs,
      signature: a.signature,
    }),
    [a, secondary, searchWords],
  );

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    lastSave.current = Date.now();
    const r = await saveArticle(payload());
    setSaving(false);
    if (!r.ok) {
      setMessage({ tone: 'error', text: r.error });
      return false;
    }
    setDirty(false);
    setSavedAt(r.savedAt);
    if (r.slug !== a.slug) {
      setA((x) => ({ ...x, slug: r.slug }));
      setSlugDraft(r.slug);
    }
    return true;
  }, [payload, a.slug]);

  // Clock of « enregistré il y a … » and autosave of a draft (at most every 10 s).
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (dirty && !a.online && !saving && n - lastSave.current >= AUTOSAVE_MS) void save();
    }, 1000);
    return () => clearInterval(t);
  }, [dirty, a.online, saving, save]);

  // Unsaved changes: the browser asks before leaving.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Annotated text, preview and checklist with the real figures, 600 ms after the last change.
  useEffect(() => {
    const t = setTimeout(() => {
      void previewArticle({
        title: a.title,
        lede: a.lede,
        body: a.body,
        metaDescription: a.metaDescription,
        keyword: a.keyword,
        city: a.city,
      }).then((r) => {
        if (r.ok) setPreview(r);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [a.title, a.lede, a.body, a.metaDescription, a.keyword, a.city]);

  // A click outside the toolbar closes its menus.
  useEffect(() => {
    if (!menu) return;
    const out = (e: PointerEvent) => {
      if (!toolbar.current?.contains(e.target as Node)) {
        setMenu(null);
        setBlockForm(null);
      }
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [menu]);

  /** Replaces the selection of the text (or inserts at the caret). */
  const edit = (
    fn: (sel: string) => { text: string; select?: [number, number] },
    block = false,
  ) => {
    const el = area.current;
    const body = a.body;
    const start0 = el?.selectionStart ?? body.length;
    const end0 = el?.selectionEnd ?? body.length;
    const sel = body.slice(start0, end0);
    let { text } = fn(sel);
    if (block) {
      const before = body.slice(0, start0);
      const after = body.slice(end0);
      text = `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${text}${after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'}`;
    }
    const next = body.slice(0, start0) + text + body.slice(end0);
    set('body', next);
    setMode('texte');
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start0 + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const linePrefix = (prefix: string) =>
    edit((sel) => ({
      text: (sel || 'Intertitre')
        .split('\n')
        .map((l) => `${prefix}${l.replace(/^#{1,6}\s+|^-\s+/, '')}`)
        .join('\n'),
    }));

  const publish = (at?: string) =>
    start(async () => {
      setMessage(null);
      if (dirty || !a.online) {
        if (!(await save())) return;
      }
      const r = await publishArticle(a.id, at ? new Date(at).toISOString() : undefined);
      if (!r.ok) {
        setMessage({
          tone: 'error',
          text: r.error,
          list: 'blockers' in r ? r.blockers : undefined,
        });
        return;
      }
      setMessage({ tone: 'ok', text: r.message });
      const scheduled = !!at && new Date(at) > new Date();
      setA((x) => ({ ...x, online: true, status: scheduled ? 'SCHEDULED' : 'PUBLISHED' }));
      router.refresh();
    });

  const status =
    a.status === 'SCHEDULED' && a.publishedAt && new Date(a.publishedAt) <= new Date()
      ? 'PUBLISHED'
      : a.status;
  const cityName = a.city
    ? (cities.find((c) => c.slug === a.city)?.name ?? closedCity?.name ?? a.city)
    : 'Toutes les villes';
  const checks = preview.checklist;
  const metaLen = a.metaDescription.trim().length;
  const relatedTitles = a.relatedSlugs.map(
    (s) => others.find((o) => o.slug === s) ?? { slug: s, title: s },
  );

  return (
    <div className="flex flex-col gap-4.5">
      {/* Header: breadcrumb, title, state, actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-ink-muted">
            <Link href="/admin/articles" className="font-semibold text-ink-muted underline">
              Articles
            </Link>{' '}
            / {cityName}
          </span>
          <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em] max-sm:text-[30px]">
            Modifier l’article
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'rounded-pill px-3 py-1.5 text-[12px] font-bold',
              status === 'TO_REVIEW'
                ? 'bg-danger-bg text-danger'
                : status === 'PUBLISHED'
                  ? 'bg-success-bg text-success'
                  : status === 'SCHEDULED'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-warning-bg text-warning',
            )}
          >
            {STATUS_LABEL[status]}
            {status === 'TO_REVIEW' && a.online ? ' · en ligne' : ''}
            {' · '}
            {saving
              ? 'enregistrement…'
              : dirty
                ? a.online
                  ? 'modifications non publiées'
                  : 'modifications non enregistrées'
                : `enregistré ${ago(savedAt, now)}`.trim()}
          </span>
          {a.online ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await unpublishArticle(a.id);
                    if (r.ok) {
                      setA((x) => ({ ...x, online: false, status: 'DRAFT' }));
                      setMessage({ tone: 'ok', text: r.message });
                      router.refresh();
                    } else setMessage({ tone: 'error', text: r.error });
                  })
                }
                className={buttonClasses('outline', 's')}
              >
                Dépublier
              </button>
              <button
                type="button"
                disabled={pending || !dirty}
                onClick={() =>
                  start(async () => {
                    if (await save())
                      setMessage({ tone: 'ok', text: 'Version en ligne mise à jour.' });
                  })
                }
                className={buttonClasses('night', 's')}
              >
                Mettre à jour
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!when) {
                    setMessage({
                      tone: 'error',
                      text: 'Choisis la date de publication dans « Publication ».',
                    });
                    whenRef.current?.focus();
                    return;
                  }
                  publish(when);
                }}
                className={buttonClasses('outline', 's')}
              >
                Programmer
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => publish()}
                className={buttonClasses('night', 's')}
              >
                Publier
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-[14px] px-4 py-3 text-[14px]',
            message.tone === 'error' ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success',
          )}
        >
          <strong>{message.text}</strong>
          {message.list && (
            <ul className="m-0 mt-1.5 pl-5">
              {message.list.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4.5">
          {/* Ville */}
          <section className={CARD} aria-labelledby="ed-ville">
            <span id="ed-ville" className={LABEL}>
              Ville
            </span>
            <div role="radiogroup" aria-labelledby="ed-ville" className="flex flex-wrap gap-2">
              {[
                { slug: null as string | null, name: 'Toutes les villes' },
                ...cities,
                ...(closedCity
                  ? [{ slug: closedCity.slug, name: `${closedCity.name} (fermée)` }]
                  : []),
              ].map((c) => {
                const on = a.city === c.slug;
                return (
                  <button
                    key={c.slug ?? '*'}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('city', c.slug)}
                    className={cn(
                      'min-h-10 rounded-pill border-[1.5px] px-3.5 text-[14px] font-semibold',
                      on
                        ? 'border-ink bg-lime-100 text-ink'
                        : 'border-[#d7d3e0] bg-surface-0 text-ink dark:border-border-control',
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p className="m-0 text-[13px] text-ink-muted">
              Seules les villes ouvertes sont proposées. L’article s’affiche aussi en bas de la page
              de la ville.
            </p>
          </section>

          {/* Titre, adresse, thème, chapô */}
          <section className={CARD}>
            <span className="flex justify-between">
              <label htmlFor="ed-title" className={LABEL}>
                Titre (H1 et balise title)
              </label>
              <span
                className={cn(
                  'text-[13px] tabular-nums',
                  a.title.length > TITLE_MAX ? 'font-bold text-danger' : 'text-ink-muted',
                )}
              >
                {a.title.length} / {TITLE_MAX}
              </span>
            </span>
            <input
              id="ed-title"
              value={a.title}
              maxLength={200}
              onChange={(e) => set('title', e.target.value)}
              className={cn(
                INPUT,
                'min-h-12 font-display text-[22px] font-extrabold tracking-[-0.02em]',
              )}
            />
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span>Adresse :</span>
              <code className="text-[13px]">{host}/guides/</code>
              {editSlug ? (
                <>
                  <label htmlFor="ed-slug" className="sr-only">
                    Adresse du guide
                  </label>
                  <input
                    id="ed-slug"
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value)}
                    className={cn(INPUT, 'min-h-9 w-auto min-w-[260px] font-mono text-[13px]')}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      set('slug', slugify(slugDraft) || a.slug);
                      setSlugDraft(slugify(slugDraft) || a.slug);
                      setEditSlug(false);
                    }}
                    className="font-semibold text-violet-700 underline"
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      set('slug', slugify(a.title));
                      setSlugDraft(slugify(a.title));
                      setEditSlug(false);
                    }}
                    className="font-semibold text-ink-muted underline"
                  >
                    Depuis le titre
                  </button>
                </>
              ) : (
                <>
                  <code
                    data-testid="article-slug"
                    className="rounded bg-surface-100 px-1.5 py-0.5 font-bold text-ink"
                  >
                    {a.slug}
                  </code>
                  <button
                    type="button"
                    onClick={() => setEditSlug(true)}
                    className="font-semibold text-violet-700 underline"
                  >
                    Modifier
                  </button>
                </>
              )}
              {a.slug !== initial.slug && (
                <span className="text-warning">L’ancienne adresse redirigera ici (301).</span>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Thème</span>
              <select
                value={a.theme}
                onChange={(e) => set('theme', e.target.value as ArticleTheme)}
                className={cn(INPUT, 'w-auto')}
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex justify-between">
              <label htmlFor="ed-lede" className={LABEL}>
                Chapô
              </label>
              <span
                className={cn(
                  'text-[13px]',
                  sentences(a.lede) > 2 ? 'font-bold text-warning' : 'text-ink-muted',
                )}
              >
                {sentences(a.lede)} phrase{sentences(a.lede) > 1 ? 's' : ''}
              </span>
            </span>
            <textarea
              id="ed-lede"
              value={a.lede}
              rows={3}
              maxLength={400}
              onChange={(e) => set('lede', e.target.value)}
              className={cn(INPUT, 'py-2.5 leading-normal')}
            />
          </section>

          {/* Corps */}
          <section className={cn(CARD, 'gap-0 p-0')}>
            <div
              ref={toolbar}
              role="toolbar"
              aria-label="Mise en forme"
              className="relative flex flex-wrap items-center gap-1 border-b border-border px-3 py-2"
            >
              <button type="button" className={TOOL} onClick={() => linePrefix('## ')}>
                H2
              </button>
              <button type="button" className={TOOL} onClick={() => linePrefix('### ')}>
                H3
              </button>
              <button
                type="button"
                className={TOOL}
                aria-label="Gras"
                onClick={() => edit((s) => ({ text: `**${s || 'texte'}**` }))}
              >
                G
              </button>
              <button
                type="button"
                className={TOOL}
                onClick={() => edit((s) => ({ text: `[${s || 'texte du lien'}](/guides/)` }))}
              >
                Lien
              </button>
              <button type="button" className={TOOL} onClick={() => linePrefix('- ')}>
                Liste
              </button>
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
              <span className="relative">
                <button
                  type="button"
                  aria-expanded={menu === 'block'}
                  aria-haspopup="menu"
                  onClick={() => {
                    setMenu(menu === 'block' ? null : 'block');
                    setBlockForm(null);
                  }}
                  className={cn(TOOL, 'bg-violet-100 text-violet-700')}
                >
                  <Icon name="columns" size={15} /> Bloc de données ▾
                </button>
                {menu === 'block' && (
                  <div className={MENU}>
                    {blockForm ? (
                      <BlockForm
                        kind={blockForm}
                        onCancel={() => setBlockForm(null)}
                        onInsert={(line) => {
                          setMenu(null);
                          setBlockForm(null);
                          edit(() => ({ text: line }), true);
                        }}
                      />
                    ) : (
                      <ul role="menu" className="m-0 list-none p-0">
                        {BLOCKS.filter((b) => b.id !== 'chiffres-ville' || a.city).map((b) => (
                          <li key={b.id} role="none">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                if (b.id === 'classement' || b.id === 'liste') setBlockForm(b.id);
                                else {
                                  setMenu(null);
                                  edit(() => ({ text: blockLine(b.id, {}) }), true);
                                }
                              }}
                              className="flex w-full flex-col gap-0.5 rounded-[12px] px-3 py-2.5 text-left hover:bg-surface-100"
                            >
                              <span className="text-[14px] font-bold text-ink">{b.label}</span>
                              <span className="text-[12px] text-ink-muted">{b.hint}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </span>
              <span className="relative">
                <button
                  type="button"
                  aria-expanded={menu === 'token'}
                  aria-haspopup="menu"
                  onClick={() => setMenu(menu === 'token' ? null : 'token')}
                  className={cn(TOOL, 'bg-violet-100 text-violet-700')}
                >
                  # Chiffre ▾
                </button>
                {menu === 'token' && (
                  <ul
                    role="menu"
                    className={cn(MENU, 'm-0 max-h-[360px] list-none overflow-y-auto')}
                  >
                    {preview.menu.map((t) => (
                      <li key={t.code} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          title={`{{${t.code}}}`}
                          onClick={() => {
                            setMenu(null);
                            edit(() => ({ text: `{{${t.code}}}` }));
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-surface-100"
                        >
                          <span className="text-ink">{t.label}</span>
                          <span className="g-tok">{t.value ?? '—'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span
                role="tablist"
                aria-label="Affichage"
                className="ml-auto flex gap-1 rounded-[12px] bg-surface-100 p-1"
              >
                {(
                  [
                    ['texte', 'Texte'],
                    ['relecture', 'Relecture'],
                    ['apercu', 'Aperçu'],
                  ] as [Mode, string][]
                ).map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'min-h-8 rounded-[9px] px-3 text-[13px] font-bold',
                      mode === m ? 'bg-surface-0 text-ink shadow-sm' : 'text-ink-muted',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </span>
            </div>
            <div className="p-5">
              {mode === 'texte' && (
                <>
                  <label htmlFor="ed-body" className="sr-only">
                    Texte de l’article (Markdown)
                  </label>
                  <textarea
                    id="ed-body"
                    ref={area}
                    value={a.body}
                    onChange={(e) => set('body', e.target.value)}
                    rows={28}
                    spellCheck
                    className={cn(INPUT, 'min-h-[520px] py-3 font-mono text-[14px] leading-[1.6]')}
                  />
                </>
              )}
              {mode === 'relecture' && (
                <ArticleHtml
                  data-testid="article-annotated"
                  className="g-prose g-edit"
                  html={preview.editHtml}
                />
              )}
              {mode === 'apercu' && (
                <div data-testid="article-preview" className="flex flex-col gap-4">
                  <h2 className="m-0 font-display text-[36px] leading-none font-extrabold tracking-[-0.03em]">
                    {a.title}
                  </h2>
                  <p className="m-0 text-[18px] leading-normal text-ink-muted">{a.lede}</p>
                  <ArticleHtml className="g-prose" html={preview.previewHtml} />
                </div>
              )}
            </div>
          </section>
          <p className="m-0 text-[12px] text-ink-muted">
            Les chiffres violets sont des jetons : ils affichent la valeur actuelle de la base et se
            mettent à jour à chaque session Mon Master. Survole un jeton pour voir son code. En
            rouge : un jeton ou un bloc inconnu, qui bloque la publication.
          </p>
        </div>

        {/* Colonne latérale */}
        <aside className="flex min-w-0 flex-col gap-4.5">
          <section className={CARD} aria-labelledby="ed-google">
            <span id="ed-google" className={LABEL}>
              Aperçu dans Google
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ink">{host} › guides</span>
              <span className="text-[19px] leading-[1.3] text-[#1a0dab] dark:text-violet-700">
                {a.title || 'Titre'}
              </span>
              <span className="text-[13px] leading-normal text-ink-muted">
                {a.metaDescription || 'La meta description s’affiche ici.'}
              </span>
            </div>
            <span className="flex justify-between">
              <label htmlFor="ed-meta" className={LABEL}>
                Meta description
              </label>
              <span
                className={cn(
                  'text-[13px] font-bold tabular-nums',
                  metaLen >= 120 && metaLen <= META_MAX ? 'text-success' : 'text-warning',
                )}
              >
                {metaLen} / {META_MAX}
              </span>
            </span>
            <textarea
              id="ed-meta"
              rows={4}
              value={a.metaDescription}
              maxLength={300}
              onChange={(e) => set('metaDescription', e.target.value)}
              className={cn(INPUT, 'py-2.5 leading-normal')}
            />
          </section>

          <section className={CARD}>
            <label htmlFor="ed-kw" className={LABEL}>
              Mot-clé principal
            </label>
            <input
              id="ed-kw"
              value={a.keyword}
              onChange={(e) => set('keyword', e.target.value)}
              className={INPUT}
            />
            <ul data-testid="seo-checklist" className="m-0 flex list-none flex-col gap-2 p-0">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[14px]">
                  <span aria-hidden="true" className={c.ok ? 'text-success' : 'text-danger'}>
                    {c.ok ? '✓' : '✕'}
                  </span>
                  <span>
                    {c.label}
                    <span className="sr-only">{c.ok ? ' : fait' : ' : à faire'}</span>
                  </span>
                </li>
              ))}
            </ul>
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-100"
              >
                <span
                  className="block h-full bg-success"
                  style={{ width: `${(preview.score / 7) * 100}%` }}
                />
              </span>
              <strong className="text-[13px] tabular-nums">{preview.score} / 7</strong>
            </span>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Mots-clés secondaires</span>
              <input
                value={secondary}
                onChange={(e) => {
                  setSecondary(e.target.value);
                  setDirty(true);
                }}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Mots-clés de recherche (/guides, jamais affichés)</span>
              <input
                value={searchWords}
                onChange={(e) => {
                  setSearchWords(e.target.value);
                  setDirty(true);
                }}
                className={INPUT}
              />
            </label>
          </section>

          <section className={CARD}>
            <span className={LABEL}>Chiffres</span>
            <p className="m-0 text-[14px]">
              Données Mon Master, <strong>session {preview.session ?? '—'}</strong>
              <br />
              <span className="text-ink-muted">
                Base mise à jour{' '}
                {preview.dataUpdatedAt
                  ? `le ${dateFmt.format(new Date(preview.dataUpdatedAt))}`
                  : '—'}
              </span>
            </p>
            {a.status === 'TO_REVIEW' ? (
              <div className="flex flex-col gap-2 rounded-[14px] bg-danger-bg px-3.5 py-3 text-[13px] text-danger">
                <strong>
                  À relire : des chiffres cités ont changé depuis la dernière relecture.
                </strong>
                {changed.length > 0 && (
                  <ul className="m-0 pl-4">
                    {changed.map((c) => (
                      <li key={c.code}>
                        <code>{`{{${c.code}}}`}</code> : {c.before} → {c.after}
                      </li>
                    ))}
                  </ul>
                )}
                {!a.online && <span>La ville du guide a pu être fermée : il est hors ligne.</span>}
              </div>
            ) : a.reviewedAt ? (
              <div className="rounded-[14px] bg-success-bg px-3.5 py-3 text-[13px] font-semibold text-success">
                ✓ Aucun chiffre n’a changé depuis la dernière relecture (
                {dateFmt.format(new Date(a.reviewedAt))}).
              </div>
            ) : (
              <div className="rounded-[14px] bg-surface-100 px-3.5 py-3 text-[13px] text-ink-muted">
                Pas encore relu : la publication enregistre les chiffres de référence.
              </div>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await markReviewed(a.id);
                  if (r.ok) {
                    setMessage({ tone: 'ok', text: r.message });
                    router.refresh();
                  } else setMessage({ tone: 'error', text: r.error });
                })
              }
              className={buttonClasses('outline', 's', 'self-start')}
            >
              Marquer comme relu
            </button>
            <p className="m-0 text-[12px] text-ink-muted">
              Après une nouvelle session, l’article passe en « À relire » si un chiffre cité dans le
              texte a changé.
            </p>
          </section>

          <section className={CARD}>
            <span className={LABEL}>Publication</span>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <label className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
                Date
                <input
                  ref={whenRef}
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
                Signature
                <input
                  value={a.signature}
                  placeholder="L’équipe note ton master"
                  onChange={(e) => set('signature', e.target.value)}
                  className={INPUT}
                />
              </label>
            </div>
            {a.online && a.publishedAt && (
              <p className="m-0 text-[13px] text-ink-muted">
                {a.status === 'SCHEDULED' && new Date(a.publishedAt) > new Date()
                  ? 'Programmé pour'
                  : 'En ligne depuis'}{' '}
                le {dateFmt.format(new Date(a.publishedAt))}.{' '}
                <a
                  href={`/guides/${a.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold"
                >
                  Voir sur le site
                </a>
              </p>
            )}
            <span className={LABEL}>À lire aussi</span>
            <div className="flex flex-wrap gap-2">
              {relatedTitles.map((r) => (
                <span
                  key={r.slug}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-[#d7d3e0] px-3 text-[13px] font-semibold dark:border-border-control"
                >
                  {r.title}
                  <button
                    type="button"
                    aria-label={`Retirer ${r.title}`}
                    onClick={() =>
                      set(
                        'relatedSlugs',
                        a.relatedSlugs.filter((s) => s !== r.slug),
                      )
                    }
                    className="font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              {a.relatedSlugs.length < 6 && (
                <label className="inline-flex max-w-full min-w-0">
                  <span className="sr-only">Ajouter un article lié</span>
                  <select
                    value=""
                    onChange={(e) =>
                      e.target.value && set('relatedSlugs', [...a.relatedSlugs, e.target.value])
                    }
                    className="min-h-9 w-[8.5rem] max-w-full rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3 text-[13px] font-bold dark:border-border-control"
                  >
                    <option value="">+ Ajouter</option>
                    {others
                      .filter((o) => !a.relatedSlugs.includes(o.slug))
                      .map((o) => (
                        <option key={o.slug} value={o.slug}>
                          {o.title}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Settings of a « Classement » or « Liste » block, then its line in the text. */
function BlockForm({
  kind,
  onInsert,
  onCancel,
}: {
  kind: string;
  onInsert: (line: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<keyof typeof RANKINGS>('plus-selectifs');
  const [limit, setLimit] = useState('10');
  const [domain, setDomain] = useState('');
  const [min, setMin] = useState('100');
  const [by, setBy] = useState<'mention' | 'recherche' | 'modalite'>('mention');
  const [text, setText] = useState('');
  const field = 'flex flex-col gap-1 text-[12px] font-bold text-ink-muted';
  const input =
    'min-h-9 rounded-[10px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-2 text-[14px] font-medium text-ink dark:border-border-control';
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === 'classement')
          onInsert(
            blockLine('classement', {
              type,
              domaine: domain || null,
              limite: Number(limit) || 10,
              min_candidatures: Number(min) >= 0 ? Number(min) : 100,
            }),
          );
        else
          onInsert(
            blockLine(
              'liste',
              by === 'modalite' ? { modalite: text || 'alternance' } : { [by]: text.trim() },
            ),
          );
      }}
    >
      <strong className="text-[14px]">
        {kind === 'classement' ? 'Classement' : 'Liste de parcours'}
      </strong>
      {kind === 'classement' ? (
        <>
          <label className={field}>
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as keyof typeof RANKINGS)}
              className={input}
            >
              {Object.entries(RANKINGS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              Limite
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className={input}
              />
            </label>
            <label className={field}>
              Min. de candidatures
              <input
                type="number"
                min={0}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className={input}
              />
            </label>
          </div>
          <label className={field}>
            Domaine
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className={input}>
              <option value="">Tous les domaines</option>
              {Object.entries(DOMAIN_CODES).map(([k, d]) => (
                <option key={k} value={k}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className={field}>
            Parcours
            <select
              value={by}
              onChange={(e) => {
                setBy(e.target.value as typeof by);
                setText(e.target.value === 'modalite' ? 'alternance' : '');
              }}
              className={input}
            >
              <option value="mention">D’une mention</option>
              <option value="recherche">Dont le titre contient</option>
              <option value="modalite">D’une modalité</option>
            </select>
          </label>
          {by === 'modalite' ? (
            <label className={field}>
              Modalité
              <select value={text} onChange={(e) => setText(e.target.value)} className={input}>
                <option value="alternance">En alternance</option>
                <option value="distance">Hybrides ou à distance</option>
              </select>
            </label>
          ) : (
            <label className={field}>
              {by === 'mention' ? 'Mention' : 'Texte'}
              <input
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={input}
              />
            </label>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClasses('ghost', 's')}>
          Retour
        </button>
        <button type="submit" className={buttonClasses('night', 's')}>
          Insérer
        </button>
      </div>
    </form>
  );
}
