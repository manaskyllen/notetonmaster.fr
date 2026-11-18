'use client';

import { useReauth } from '@/components/admin/Reauth';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/form/Controls';
import { Switch } from '@/components/ui/Switch';
import { Toast } from '@/components/ui/Toast';
import { addLaunchZone, findEpcis, saveZones } from '@/app/admin/(panel)/parametres/villes-actions';
import type { ZoneRow } from '@/lib/launch/admin';
import { cn } from '@/lib/cn';

const nf = new Intl.NumberFormat('fr-FR');
const PIN = ['var(--lime-400)', 'var(--coral-300)', '#c9beff'];

function plural(n: number, one: string, many: string) {
  return `${nf.format(n)} ${n > 1 ? many : one}`;
}

/**
 * Paramètres › Villes ouvertes: a summary, one row per zone with its
 * figures, an « Ouverte / Fermée » pill and a switch; the effect of the change is announced under
 * the list and applied on « Enregistrer ». « Ajouter une ville » searches an intercommunality on
 * the API Découpage administratif; it is added closed.
 */
export function ZonesForm({
  zones,
  summary,
}: {
  zones: ZoneRow[];
  summary: { open: number; published: number; hidden: number };
}) {
  const reauth = useReauth();
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(zones.map((z) => [z.slug, z.open])),
  );
  const [last, setLast] = useState<string | null>(null);
  // After a save or an added city, the page sends the new zones: the switches follow them. Reset
  // here rather than by remounting the form (a `key`), which would also drop the confirmation.
  const saved = zones.map((z) => `${z.slug}:${z.open}`).join('|');
  const [synced, setSynced] = useState(saved);
  if (synced !== saved) {
    setSynced(saved);
    setOn(Object.fromEntries(zones.map((z) => [z.slug, z.open])));
    setLast(null);
  }
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<
    { code: string; name: string; communes: number; programs: number }[] | null
  >(null);
  const [pick, setPick] = useState('');
  const [cityName, setCityName] = useState('');
  const dirty = zones.some((z) => on[z.slug] !== z.open);
  const lastZone = zones.find((z) => z.slug === last);
  const hint = lastZone
    ? on[lastZone.slug]
      ? `${lastZone.name} ouverte : ${plural(lastZone.programs, 'parcours sera publié', 'parcours seront publiés')} à l’enregistrement.`
      : `${lastZone.name} fermée : ${plural(lastZone.programs, 'parcours sera masqué', 'parcours seront masqués')} à l’enregistrement. Les avis sont gardés.`
    : 'Les avis ne sont jamais supprimés quand on ferme une ville : ils réapparaissent à sa réouverture.';

  const save = () =>
    start(async () => {
      const r = await reauth(() =>
        saveZones(zones.map((z) => ({ slug: z.slug, open: !!on[z.slug] }))),
      );
      if ('ok' in r && r.ok) {
        setMsg({ tone: 'success', text: r.message });
        setLast(null);
        router.refresh();
      } else setMsg({ tone: 'danger', text: 'error' in r ? r.error : 'Erreur.' });
    });

  const search = () =>
    start(async () => {
      const r = await findEpcis(q);
      if ('items' in r && r.items) {
        const items = r.items;
        setFound(items);
        setPick(items[0]?.code ?? '');
        setCityName(q.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()));
      } else setMsg({ tone: 'danger', text: 'error' in r ? r.error : 'Erreur.' });
    });

  const add = () =>
    start(async () => {
      const r = await reauth(() => addLaunchZone({ code: pick, name: cityName }));
      if ('message' in r && r.ok) {
        setMsg({ tone: 'success', text: r.message });
        setFound(null);
        setQ('');
        router.refresh();
      } else setMsg({ tone: 'danger', text: 'error' in r ? r.error : 'Erreur.' });
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center gap-x-7 gap-y-3.5 rounded-[20px] bg-night px-5.5 py-5 text-on-night">
        <span className="min-w-0 flex-[1_1_320px] text-[14px] leading-[1.5] text-on-night-muted">
          Seuls les parcours dont un campus est dans une ville ouverte sont publiés. Les autres
          restent en base et continuent d’être synchronisés : ouvrir une ville les publie tout de
          suite.
        </span>
        <span className="flex flex-wrap gap-5.5">
          {(
            [
              [summary.open, 'villes ouvertes', 'text-lime-400'],
              [summary.published, 'parcours publiés', ''],
              [summary.hidden, 'parcours masqués', 'text-[#a9a3b8]'],
            ] as const
          ).map(([n, l, c]) => (
            <span key={l} className="flex flex-col">
              <strong className={cn('font-display text-[28px] font-extrabold', c)}>
                {nf.format(n)}
              </strong>
              <span className="text-[12px] text-on-night-muted">{l}</span>
            </span>
          ))}
        </span>
      </section>

      <section
        aria-label="Villes"
        className="flex flex-col rounded-[20px] border border-border bg-surface-0 px-5 py-2"
      >
        {zones.map((z, i) => {
          const open = !!on[z.slug];
          return (
            <div
              key={z.slug}
              className="flex flex-wrap items-center gap-x-4.5 gap-y-2.5 border-b border-surface-100 py-3.5"
            >
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center rounded-[12px] text-[#16131f]"
                style={{ background: open ? PIN[i % PIN.length] : 'var(--surface-100)' }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                <span className="text-[15px] font-bold">{z.name}</span>
                <span className="text-[13px] text-ink-muted">
                  {z.epciName} · {plural(z.communes, 'commune', 'communes')}
                </span>
                {z.open && open && z.listed === 0 && (
                  <span className="text-[13px] font-semibold text-warning">
                    Aucun master publié : la ville n’apparaît pas sur le site
                  </span>
                )}
              </span>
              <span className="flex-[1_1_260px] text-[13px] text-ink-soft">
                {plural(z.programs, 'parcours', 'parcours')} ·{' '}
                {plural(z.establishments, 'établissement', 'établissements')} ·{' '}
                {z.reviews ? plural(z.reviews, 'avis', 'avis') : 'aucun avis'}
              </span>
              <span
                className={cn(
                  'rounded-pill px-2.5 py-0.75 text-[12px] font-bold',
                  open ? 'bg-success-bg text-success' : 'bg-surface-100 text-ink-soft',
                )}
              >
                {open ? 'Ouverte' : 'Fermée'}
              </span>
              <Switch
                checked={open}
                label={`${open ? 'Fermer' : 'Ouvrir'} ${z.name}`}
                onChange={(v) => {
                  setOn((x) => ({ ...x, [z.slug]: v }));
                  setLast(z.slug);
                  setMsg(null);
                }}
              />
            </div>
          );
        })}
        <span
          role="status"
          className={cn('py-3 text-[13px]', lastZone ? 'font-semibold text-ink' : 'text-ink-muted')}
        >
          {hint}
        </span>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!dirty || pending} onClick={save}>
          Enregistrer
        </Button>
        {dirty && <span className="text-[14px] font-semibold">Modifications non enregistrées</span>}
      </div>

      <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface-0 p-5">
        <label htmlFor="z-q" className="font-semibold">
          Ajouter une ville
        </label>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            id="z-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom de la ville ou de l’intercommunalité : Lyon, Colmar…"
            className={cn(controlClass, 'w-auto flex-[1_1_320px]')}
          />
          <Button type="submit" variant="outline" disabled={pending || q.trim().length < 2}>
            Chercher
          </Button>
        </form>
        {found &&
          (found.length ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <label className="flex flex-[1_1_320px] flex-col gap-1 text-[14px] font-semibold">
                Intercommunalité
                <select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className={controlClass}
                >
                  {found.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.name} · {plural(f.communes, 'commune', 'communes')} ·{' '}
                      {plural(f.programs, 'parcours', 'parcours')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-[0_1_220px] flex-col gap-1 text-[14px] font-semibold">
                Nom affiché
                <input
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  className={controlClass}
                />
              </label>
              <Button
                type="submit"
                variant="night"
                disabled={pending || !pick || cityName.trim().length < 2}
              >
                Ajouter, fermée
              </Button>
            </form>
          ) : (
            <span className="text-[14px] text-ink-muted">
              Aucune intercommunalité de ce nom (ou déjà dans la liste).
            </span>
          ))}
        <span className="text-[13px] text-ink-muted">
          Une ville = une agglomération (intercommunalité INSEE). Elle est ajoutée fermée : vérifie
          ses parcours dans Fiches (filtre « Hors ville ouverte »), puis ouvre-la. Chaque changement
          est inscrit au journal d’audit.
        </span>
      </section>
      {msg && <Toast tone={msg.tone} message={msg.text} onDone={() => setMsg(null)} />}
    </div>
  );
}
