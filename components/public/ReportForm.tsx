'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  Button,
  TurnstileNotice,
  useTurnstile,
  buttonClasses,
  CheckboxCard,
  ChoiceGroup,
  FieldError,
  formCardClass,
  FormNav,
  Notice,
  RadioCard,
  Select,
  TextField,
} from '@/components/ui';
import { NOTICE_QUALITIES, REPORT_REASONS } from '@/lib/validation';
import { submitNotice, submitReport, type ReportResult } from '@/app/(public)/signaler/actions';

type Mode = 'simple' | 'formal';

export function ReportForm({
  initialTarget,
  initialMode = 'simple',
  backHref,
}: {
  initialTarget?: string;
  initialMode?: Mode;
  backHref?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  // One widget; its action follows the mode (report or formal notice).
  const turnstile = useTurnstile(mode === 'simple' ? 'report' : 'notice');
  const [f, setF] = useState({
    target: initialTarget ?? '',
    reason: '',
    details: '',
    email: '',
    name: '',
    quality: '',
    url: initialTarget ?? '',
    grounds: '',
    law: '',
    goodFaith: false,
  });
  const [res, setRes] = useState<ReportResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const errors = res && !res.ok ? (res.fieldErrors ?? {}) : {};

  if (res?.ok)
    return (
      <section role="status" className="flex flex-col gap-3 rounded-[28px] bg-lime-100 p-7">
        <span className="font-display text-[26px] font-extrabold">
          {res.formal ? 'Notification reçue' : 'Merci, c’est noté.'}
        </span>
        <span className="text-[16px] leading-[1.55]">
          Référence <strong>{res.reference}</strong>.{' '}
          {res.formal
            ? 'Un accusé de réception part à ton adresse. La décision motivée te sera envoyée, ainsi qu’à l’auteur du contenu.'
            : 'Si l’avis enfreint la charte, il sera retiré. Tu seras informé·e si tu as laissé ton mail.'}
        </span>
        <Link
          href={res.programSlug ? `/parcours/${res.programSlug}` : (backHref ?? '/')}
          className={buttonClasses('night', 'form', 'self-start')}
        >
          Retour à la fiche
        </Link>
      </section>
    );

  const err = (k: string) => errors[k];
  const groundsLen = f.grounds.trim().length;
  return (
    <div className="flex flex-col gap-5">
      <ChoiceGroup
        ariaLabel="Type de demande"
        variant="request"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setRes(null);
        }}
        options={[
          {
            value: 'simple',
            label: 'Signaler un avis',
            description: 'Il nomme quelqu’un, il est injurieux, hors sujet ou te semble faux.',
          },
          {
            value: 'formal',
            label: 'Demander un retrait (contenu illicite)',
            description:
              'Notification formelle, pour une personne concernée, un établissement ou son représentant.',
          },
        ]}
      />

      <form
        noValidate
        className={formCardClass}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const turnstileToken = await turnstile.getToken();
            setRes(
              mode === 'simple'
                ? await submitReport({
                    target: f.target,
                    reason: f.reason,
                    details: f.details,
                    email: f.email,
                    turnstileToken,
                  })
                : await submitNotice({
                    name: f.name,
                    quality: f.quality,
                    email: f.email,
                    url: f.url,
                    grounds: f.grounds,
                    law: f.law,
                    goodFaith: f.goodFaith,
                    turnstileToken,
                  }),
            );
            turnstile.reset();
          });
        }}
      >
        {res && !res.ok && res.message && <Notice tone="danger">{res.message}</Notice>}
        {mode === 'simple' ? (
          <>
            {!initialTarget && (
              <TextField
                label="Avis concerné *"
                required
                value={f.target}
                onChange={(e) => set('target', e.target.value)}
                placeholder="Lien de l’avis ou identifiant (avis-…)"
                error={err('target')}
              />
            )}
            {initialTarget && err('target') && <Notice tone="danger">{err('target')}</Notice>}
            <fieldset
              className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
              aria-invalid={!!err('reason')}
              aria-describedby={err('reason') ? 'reason-err' : undefined}
            >
              <legend className="nm-label mb-2">Pourquoi signales-tu cet avis ? *</legend>
              {Object.entries(REPORT_REASONS).map(([k, l]) => (
                <RadioCard
                  key={k}
                  name="reason"
                  value={k}
                  checked={f.reason === k}
                  onChange={() => set('reason', k)}
                >
                  {l}
                </RadioCard>
              ))}
              <FieldError id="reason-err">{err('reason')}</FieldError>
            </fieldset>
            <TextField
              label="Précisions (facultatif)"
              multiline
              value={f.details}
              onChange={(e) => set('details', e.target.value)}
              placeholder="Ce qui pose problème dans l’avis…"
            />
            <TextField
              label="Ton mail (facultatif)"
              type="email"
              autoComplete="email"
              value={f.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="Pour recevoir notre décision"
              error={err('email')}
            />
          </>
        ) : (
          <>
            <Notice tone="info">
              Les champs demandés sont ceux prévus par le règlement européen sur les services
              numériques (DSA) pour une notification de contenu illicite.
            </Notice>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5">
              <TextField
                label="Nom ou raison sociale *"
                required
                value={f.name}
                onChange={(e) => set('name', e.target.value)}
                error={err('name')}
              />
              <Select
                label="Tu agis en tant que *"
                required
                value={f.quality}
                onChange={(e) => set('quality', e.target.value)}
                error={err('quality')}
                placeholder="Choisir…"
                options={Object.entries(NOTICE_QUALITIES).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <TextField
              label="Adresse mail *"
              type="email"
              required
              autoComplete="email"
              value={f.email}
              onChange={(e) => set('email', e.target.value)}
              error={err('email')}
            />
            <TextField
              label="Adresse exacte du contenu *"
              required
              value={f.url}
              onChange={(e) => set('url', e.target.value)}
              hint="Lien de l’avis ou son identifiant."
              error={err('url')}
            />
            <TextField
              label="Pourquoi ce contenu est-il illicite ? *"
              id="fw"
              multiline
              required
              value={f.grounds}
              onChange={(e) => set('grounds', e.target.value)}
              placeholder="Explique précisément ce qui pose problème et pourquoi."
              error={err('grounds')}
              hint={groundsLen >= 30 ? 'C’est bon ✓' : `30 caractères minimum (${groundsLen})`}
              hintTone={groundsLen >= 30 ? 'ok' : 'muted'}
            />
            <TextField
              label="Texte de loi invoqué (facultatif)"
              value={f.law}
              onChange={(e) => set('law', e.target.value)}
              placeholder="Ex. loi du 29 juillet 1881 (diffamation)"
            />
            <div className="flex flex-col gap-2">
              <CheckboxCard
                variant="plain"
                checked={f.goodFaith}
                onChange={(e) => set('goodFaith', e.target.checked)}
                aria-invalid={err('goodFaith') ? true : undefined}
                aria-describedby={err('goodFaith') ? 'gf-err' : undefined}
              >
                Je déclare de bonne foi que les informations de cette notification sont exactes et
                complètes. *
              </CheckboxCard>
              <FieldError id="gf-err">{err('goodFaith')}</FieldError>
            </div>
          </>
        )}
        {turnstile.field}
        <FormNav className="items-center">
          <span className="flex flex-col gap-1.5">
            <span className="nm-hint">* champ obligatoire</span>
            <TurnstileNotice />
          </span>
          <Button type="submit" variant="primary" size="form" disabled={pending}>
            {pending
              ? 'Envoi…'
              : mode === 'simple'
                ? 'Envoyer le signalement'
                : 'Envoyer la notification'}
          </Button>
        </FormNav>
      </form>
    </div>
  );
}
