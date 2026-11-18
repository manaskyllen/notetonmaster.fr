'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, controlClass, Switch, Toast } from '@/components/ui';
import { BannerStar } from '@/components/site/SiteBanner';
import { cn } from '@/lib/cn';
import {
  BANNER_MAX,
  BANNER_TONES,
  bannerSchema,
  bannerStatus,
  parisDay,
  type BannerForm as Values,
  type BannerTone,
} from '@/lib/domain/banner';
import { saveBanner } from '@/app/admin/(panel)/parametres/actions';

const STATUS_STYLE = {
  'En ligne': 'bg-success-bg text-success',
  Programmé: 'bg-violet-100 text-violet-700',
  Terminé: 'bg-surface-100 text-ink-soft',
  Masqué: 'bg-surface-100 text-ink-soft',
} as const;

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span id={id} className="text-[12px] font-semibold text-danger">
      {msg}
    </span>
  ) : null;
}

/**
 * Paramètres › Bandeau d'information: live preview on a fake navigation
 * bar with its status, then the form. Validated here and again by the server action.
 */
export function BannerForm({ initial, version }: { initial: Values; version: string }) {
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A new version of the banner (saved here or by someone else): the form follows it. Reset here
  // rather than by remounting the form (a `key`), which would also drop the confirmation.
  const [synced, setSynced] = useState(version);
  if (synced !== version) {
    setSynced(version);
    setV(initial);
    setErrors({});
  }
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrors((e) => {
      const { [k as string]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
  };
  const t = BANNER_TONES[v.tone];
  const status = bannerStatus({
    active: v.active,
    startsAt: (v.startsAt ? parisDay(v.startsAt) : new Date()).toISOString(),
    endsAt: v.endsAt ? parisDay(v.endsAt, true).toISOString() : null,
  });
  const count = v.message.length;
  const err = (k: string) => errors[k];
  const described = (k: string) =>
    errors[k] ? { 'aria-describedby': `ban-${k}-err`, 'aria-invalid': true } : {};

  const submit = () => {
    const parsed = bannerSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    start(async () => {
      const r = await saveBanner(parsed.data);
      if ('ok' in r && r.ok) {
        setToast(r.message);
        router.refresh();
      } else if ('fields' in r && r.fields) setErrors(r.fields as Record<string, string>);
      else setErrors({ form: 'error' in r ? r.error : 'Erreur.' });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Aperçu"
        className="overflow-hidden rounded-[20px] border border-border bg-surface-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase">
            Aperçu
          </span>
          <span
            role="status"
            className={cn('rounded-pill px-2.5 py-0.5 text-[12px] font-bold', STATUS_STYLE[status])}
          >
            {status}
          </span>
        </div>
        <div className="bg-surface-50" aria-hidden="true">
          {v.active && (
            <div
              key={v.tone}
              className="ann-prev box-border flex min-h-12 items-center gap-3 px-4 py-2.5"
              style={{ background: t.bg, color: t.fg }}
            >
              <span
                className="flex size-7 flex-none items-center justify-center rounded-[9px]"
                style={{ background: t.icoBg, color: t.icoFg }}
              >
                <BannerStar />
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-[1.4] font-semibold">
                {v.message || 'Votre message…'}{' '}
                {v.linkLabel.trim() && (
                  <span className="font-bold whitespace-nowrap underline underline-offset-3">
                    {v.linkLabel} →
                  </span>
                )}
              </span>
              {v.dismissible && (
                <span className="w-7 flex-none text-center text-[18px] font-bold">×</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3.5 border-b border-border bg-surface-50/90 px-4 py-3.5">
            <span className="font-display text-[18px] font-extrabold tracking-[-0.045em]">
              note<span className="ml-[.14em]">ton</span>
              <span className="ml-0.5 inline-block -rotate-3 rounded-[7px] bg-lime-400 px-1.5 pb-0.5 text-on-lime">
                master
              </span>
            </span>
            <span className="h-8.5 max-w-[300px] flex-1 rounded-pill border border-border bg-surface-0" />
            <span className="ml-auto text-[13px] text-ink-muted max-sm:hidden">
              Explorer · Se connecter
            </span>
          </div>
          <div className="h-14" />
        </div>
      </section>

      <section className="flex flex-col gap-4.5 rounded-[20px] border border-border bg-surface-0 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span id="ban-on-label" className="text-[15px] font-bold">
              Afficher le bandeau
            </span>
            <span className="text-[13px] text-ink-muted">
              En haut des pages publiques, au-dessus de la barre de navigation.
            </span>
          </span>
          <Switch
            checked={v.active}
            labelledBy="ban-on-label"
            onChange={(on) => set('active', on)}
          />
        </div>

        <div role="radiogroup" aria-labelledby="ban-tone" className="flex flex-col gap-2">
          <span id="ban-tone" className="nm-label">
            Ton
          </span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BANNER_TONES) as BannerTone[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={v.tone === k}
                onClick={() => set('tone', k)}
                className={cn(
                  'tone inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-[12px] border-2 bg-surface-0 px-3.5 font-sans text-[14px] font-semibold text-ink',
                  v.tone === k ? 'border-ink' : 'border-border',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-4.5 rounded-[6px]"
                  style={{ background: BANNER_TONES[k].bg }}
                />
                {BANNER_TONES[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ban-message" className="nm-label">
            Message
          </label>
          <textarea
            id="ban-message"
            rows={2}
            maxLength={BANNER_MAX}
            className={controlClass}
            value={v.message}
            onChange={(e) => set('message', e.target.value.slice(0, BANNER_MAX))}
            {...described('message')}
          />
          <span className="flex justify-between gap-2">
            <FieldError id="ban-message-err" msg={err('message')} />
            <span
              aria-live="polite"
              className={cn(
                'ml-auto text-[12px]',
                count > 140 ? 'font-bold text-danger' : 'text-ink-muted',
              )}
            >
              {count} / {BANNER_MAX}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ban-ll" className="nm-label">
              Texte du lien (facultatif)
            </label>
            <input
              id="ban-ll"
              className={controlClass}
              value={v.linkLabel}
              onChange={(e) => set('linkLabel', e.target.value)}
              {...described('linkLabel')}
            />
            <FieldError id="ban-linkLabel-err" msg={err('linkLabel')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ban-lu" className="nm-label">
              Adresse du lien
            </label>
            <input
              id="ban-lu"
              placeholder="/a-propos"
              className={controlClass}
              value={v.linkUrl}
              onChange={(e) => set('linkUrl', e.target.value)}
              {...described('linkUrl')}
            />
            <FieldError id="ban-linkUrl-err" msg={err('linkUrl')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ban-from" className="nm-label">
              Du
            </label>
            <input
              id="ban-from"
              type="date"
              className={controlClass}
              value={v.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
              {...described('startsAt')}
            />
            <FieldError id="ban-startsAt-err" msg={err('startsAt')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ban-to" className="nm-label">
              Au (facultatif)
            </label>
            <input
              id="ban-to"
              type="date"
              className={controlClass}
              value={v.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
              {...described('endsAt')}
            />
            <FieldError id="ban-endsAt-err" msg={err('endsAt')} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2 text-[14px] font-semibold">
            Afficher sur
            <select
              className={cn(controlClass, 'w-auto')}
              value={v.scope}
              onChange={(e) => set('scope', e.target.value as Values['scope'])}
            >
              <option value="ALL">Tout le site public</option>
              <option value="HOME">L’accueil seulement</option>
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={v.dismissible}
              onChange={() => set('dismissible', !v.dismissible)}
              className="size-5 accent-violet-500"
            />
            Les visiteurs peuvent le fermer
          </label>
        </div>
        <span className="text-[13px] text-ink-muted">
          Un bandeau fermé ne revient pas pour ce visiteur, sauf si le message change. Jamais sur le
          formulaire d’avis, la connexion ni l’admin. Chaque modification est inscrite au journal
          d’audit.
        </span>
        {errors.form && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {errors.form}
          </p>
        )}
        <Button variant="primary" className="self-start" disabled={pending} onClick={submit}>
          {pending ? 'Enregistrement…' : 'Enregistrer le bandeau'}
        </Button>
      </section>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
