'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/form/Controls';
import { Notice } from '@/components/ui/Notice';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { FREQUENCIES, type Frequency } from '@/lib/admin/frequency';
import { NOTIFICATION_EVENTS, type NotificationMatrix } from '@/lib/settings-defaults';
import { ROLE_LABEL, ROLES } from '@/lib/domain/permissions';
import { TURNSTILE_FORMS, type TurnstileForm } from '@/lib/turnstile-forms';
import { saveSettings } from '@/app/admin/(panel)/parametres/actions';

export type SettingsValues = {
  'collect.userAgent': string;
  'collect.minDelaySeconds': number;
  'moderation.autoPublish': boolean;
  'moderation.nameDetection': boolean;
  'moderation.anonymousReviews': boolean;
  'moderation.documents': boolean;
  'chat.enabled': boolean;
  'chat.limitEnabled': boolean;
  'chat.limitPerDay': number;
  'moderation.delayHours': number;
  'moderation.reportThreshold': number;
  'moderation.watchTerms': string[];
  'turnstile.forms': Record<TurnstileForm, boolean>;
  'notifications.matrix': NotificationMatrix;
  'legal.internalDelayDays': number;
  'legal.inactiveAccountYears': number;
};

export interface SourceSetting {
  key: string;
  name: string;
  note: string;
  freq: Frequency;
  locked: boolean;
}

const TABS = [
  ['collect', 'Collecte'],
  ['mod', 'Modération'],
  ['notif', 'Notifications'],
  ['zones', 'Villes ouvertes'],
  ['banner', 'Bandeau d’information'],
  ['legal', 'Légal & RGPD'],
] as const;

/** Tab of the URL parameter `onglet` (links from the overview and Récupération). */
const TAB_PARAM: Record<string, (typeof TABS)[number][0]> = {
  collecte: 'collect',
  moderation: 'mod',
  notifications: 'notif',
  villes: 'zones',
  bandeau: 'banner',
  legal: 'legal',
};

const MOD_TOGGLES: [keyof SettingsValues, string, string][] = [
  [
    'moderation.autoPublish',
    'Publier automatiquement les avis sans alerte',
    'Désactivé : tous les avis passent par une relecture humaine.',
  ],
  [
    'moderation.nameDetection',
    'Détecter les noms de personnes',
    'Repère les formules comme « M. Dupont » et bloque l’envoi tant que le nom n’est pas retiré.',
  ],
  [
    'moderation.anonymousReviews',
    'Accepter les avis sans compte',
    'Relus comme les autres, publiés sans badge « Parcours vérifié ».',
  ],
  [
    'moderation.documents',
    'Accepter les justificatifs pour le badge',
    'Diplôme, attestation ou certificat de scolarité, vérifiés à la main puis supprimés.',
  ],
  [
    'chat.enabled',
    'Messagerie anonyme entre étudiant·es',
    'Les auteurs qui l’acceptent reçoivent des questions sous leurs avis.',
  ],
  [
    'chat.limitEnabled',
    'Limiter les nouvelles conversations par jour et par expéditeur',
    'Freine le démarchage et le spam.',
  ],
];

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
      <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        {help && <span className="text-[13px] text-ink-muted">{help}</span>}
      </span>
      <span className="flex items-center gap-3">{children}</span>
    </div>
  );
}

export function SettingsForm({
  initial,
  sources,
  fixed,
  bannerTab,
  zonesTab,
  initialTab,
}: {
  /** Tab opened by the URL (`?onglet=villes`, `?onglet=collecte`…). */
  initialTab?: string;
  initial: SettingsValues;
  sources: SourceSetting[];
  fixed: { contactEmail: string; connectionLogs: string; documents: string; messages: string };
  /** « Bandeau d'information »: its own form and save (BannerForm). */
  bannerTab?: React.ReactNode;
  /** « Villes ouvertes »: its own form and save (ZonesForm). */
  zonesTab?: React.ReactNode;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(
    TAB_PARAM[initialTab ?? ''] ?? 'collect',
  );
  const [v, setV] = useState(initial);
  const [src, setSrc] = useState(
    Object.fromEntries(sources.map((s) => [s.key, s.freq])) as Record<string, Frequency>,
  );
  const [terms, setTerms] = useState(initial['moderation.watchTerms'].join('\n'));
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setDirty(true);
    setMsg(null);
  };
  const num = (k: keyof SettingsValues, label: string, hint?: string, min = 1) => (
    <TextField
      label={label}
      hint={hint}
      type="number"
      min={min}
      value={String(v[k])}
      onChange={(e) => set(k, Number(e.target.value) as never)}
      className="max-w-[260px]"
    />
  );

  return (
    <>
      <div
        role="tablist"
        aria-label="Sections des paramètres"
        className="inline-flex flex-wrap gap-1.5 self-start rounded-[28px] border border-border bg-surface-0 p-1.5"
      >
        {TABS.map(([id, l]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'min-h-tap cursor-pointer rounded-pill border-0 px-4 text-[14px] font-semibold',
              tab === id ? 'bg-night text-on-night' : 'bg-transparent text-ink',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'banner' && (
        <div role="tabpanel" aria-label="Bandeau d’information">
          {bannerTab}
        </div>
      )}
      {tab === 'zones' && (
        <div role="tabpanel" aria-label="Villes ouvertes">
          {zonesTab}
        </div>
      )}
      <section
        role="tabpanel"
        hidden={tab === 'banner' || tab === 'zones'}
        aria-label={TABS.find((t) => t[0] === tab)?.[1]}
        className="flex flex-col gap-1 rounded-lg border border-border bg-surface-0 p-5.5"
      >
        {tab === 'collect' && (
          <>
            {sources.map((s) => (
              <Row key={s.key} label={s.name} help={s.note}>
                <label className="sr-only" htmlFor={`freq-${s.key}`}>
                  Fréquence : {s.name}
                </label>
                <select
                  id={`freq-${s.key}`}
                  value={src[s.key]}
                  disabled={s.locked}
                  onChange={(e) => {
                    setSrc((x) => ({ ...x, [s.key]: e.target.value as Frequency }));
                    setDirty(true);
                  }}
                  className={cn(controlClass, 'w-auto min-w-44')}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <Switch
                  checked={src[s.key] !== 'off'}
                  disabled={s.locked}
                  label={`Activer ${s.name}`}
                  onChange={(on) => {
                    setSrc((x) => ({ ...x, [s.key]: on ? 'month' : 'off' }));
                    setDirty(true);
                  }}
                />
              </Row>
            ))}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <TextField
                label="User-Agent du robot"
                value={v['collect.userAgent']}
                onChange={(e) => set('collect.userAgent', e.target.value)}
                hint="Nom du robot et contact, envoyés à chaque requête."
              />
              {num(
                'collect.minDelaySeconds',
                'Délai minimum entre deux requêtes (s)',
                '5 secondes au minimum, par site.',
                5,
              )}
            </div>
          </>
        )}
        {tab === 'mod' && (
          <>
            {MOD_TOGGLES.map(([k, l, h]) => (
              <Row
                key={k}
                label={
                  k === 'chat.limitEnabled'
                    ? `Limiter à ${v['chat.limitPerDay']} nouvelles conversations par jour et par expéditeur`
                    : l
                }
                help={h}
              >
                <Switch checked={!!v[k]} label={l} onChange={(on) => set(k, on as never)} />
              </Row>
            ))}
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              {num('chat.limitPerDay', 'Conversations par jour et par expéditeur')}
              {num('moderation.delayHours', 'Délai de modération visé (h)')}
              {num(
                'moderation.reportThreshold',
                'Signalements avant masquage automatique',
                'Sur 24 heures.',
              )}
            </div>
            <TextField
              label="Termes à surveiller (un par ligne)"
              multiline
              value={terms}
              onChange={(e) => {
                setTerms(e.target.value);
                setDirty(true);
              }}
              hint="Signalés au modérateur, jamais bloqués automatiquement."
              className="mt-3"
            />
            <div className="mt-5 flex flex-col">
              <span className="font-display text-[18px] font-extrabold">
                Anti-robot (Cloudflare Turnstile)
              </span>
              <span className="text-[13px] text-ink-muted">
                Vérification invisible avant l’envoi. Couper un formulaire seulement en cas de panne
                de Cloudflare : la limitation de débit reste active.
              </span>
              {TURNSTILE_FORMS.map((f) => (
                <Row key={f.id} label={`Turnstile actif : ${f.label}`}>
                  <Switch
                    checked={v['turnstile.forms'][f.id] !== false}
                    label={`Turnstile actif : ${f.label}`}
                    onChange={(on) =>
                      set('turnstile.forms', { ...v['turnstile.forms'], [f.id]: on })
                    }
                  />
                </Row>
              ))}
            </div>
          </>
        )}
        {tab === 'notif' && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <caption className="sr-only">
                Notifications par mail, par événement et par rôle
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-border px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                  >
                    Événement
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r}
                      scope="col"
                      className="border-b border-border px-3 py-2.5 text-center text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                    >
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_EVENTS.map((e) => (
                  <tr key={e.id}>
                    <th
                      scope="row"
                      className="border-b border-border px-3 py-2.5 text-left font-medium"
                    >
                      {e.label}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className="border-b border-border px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="size-5 accent-violet-500"
                          aria-label={`${e.label} — ${ROLE_LABEL[r]}`}
                          checked={v['notifications.matrix'][e.id][r]}
                          onChange={(ev) =>
                            set('notifications.matrix', {
                              ...v['notifications.matrix'],
                              [e.id]: {
                                ...v['notifications.matrix'][e.id],
                                [r]: ev.target.checked,
                              },
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'legal' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* CONTACT_EMAIL, fixed at deployment (lib/contact.ts): Reply-To, legal pages. */}
            <TextField
              label="Adresse de contact (CONTACT_EMAIL, fixée au déploiement)"
              value={fixed.contactEmail}
              readOnly
              disabled
            />
            {num(
              'legal.internalDelayDays',
              'Délai interne de traitement (jours)',
              'Échéance affichée sur chaque demande.',
            )}
            {num(
              'legal.inactiveAccountYears',
              'Suppression des comptes inactifs (années)',
              'Un mail de rappel part 30 jours avant.',
            )}
            <TextField
              label="Conservation des données de connexion"
              value={fixed.connectionLogs}
              readOnly
              disabled
            />
            <TextField label="Justificatifs" value={fixed.documents} readOnly disabled />
            <TextField label="Messages" value={fixed.messages} readOnly disabled />
          </div>
        )}
      </section>

      <div
        hidden={tab === 'banner'}
        className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-night px-5 py-3.5 text-on-night shadow-[0_20px_50px_rgba(22,19,31,.3)]"
      >
        <span role="status" className="text-[14px] font-semibold">
          {msg ? msg.text : dirty ? 'Modifications non enregistrées' : 'À jour'}
        </span>
        <Button
          variant="lime"
          size="s"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveSettings({
                sources: src,
                settings: {
                  ...v,
                  'moderation.watchTerms': terms
                    .split('\n')
                    .map((t) => t.trim())
                    .filter(Boolean),
                },
              });
              if ('ok' in r && r.ok) {
                setMsg({ tone: 'success', text: r.message });
                setDirty(false);
              } else setMsg({ tone: 'danger', text: 'error' in r ? r.error : 'Erreur.' });
            })
          }
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
      {msg?.tone === 'danger' && <Notice tone="danger">{msg.text}</Notice>}
    </>
  );
}
