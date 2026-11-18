'use client';

import { useRef, useState, useTransition } from 'react';
import {
  Button,
  ChoiceGroup,
  Field,
  FileInput,
  Input,
  Notice,
  TurnstileNotice,
  useTurnstile,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MasterVerificationState } from '@/lib/domain/verification';
import { DOCUMENT_MAX_BYTES } from '@/lib/domain/verification';
import {
  confirmUniversityCode,
  reuseUniversityEmail,
  sendUniversityCode,
} from '@/app/(public)/espace/actions';

export interface MasterToVerify {
  programId: string;
  slug: string;
  title: string;
  university: string;
  domains: string[];
  review: string;
  state: MasterVerificationState;
  /** « avec ton mail universitaire le 3 oct. 2026 » */
  approvedHow: string | null;
  refusal: string | null;
  /** An address of this university is already verified: one click, no new code. */
  canReuseEmail: boolean;
}

const LOOK: Record<MasterVerificationState, { pill: string; pillCls: string; card: string }> = {
  none: {
    pill: 'Non vérifié',
    pillCls: 'bg-surface-100 text-ink',
    card: 'border-border bg-surface-0',
  },
  refused: {
    pill: 'Non vérifié',
    pillCls: 'bg-surface-100 text-ink',
    card: 'border-border bg-surface-0',
  },
  'code-sent': {
    pill: 'Code envoyé',
    pillCls: 'bg-violet-100 text-violet-700',
    card: 'border-violet-500 bg-surface-0',
  },
  pending: {
    pill: 'En attente',
    pillCls: 'bg-violet-100 text-violet-700',
    card: 'border-violet-500 bg-surface-0',
  },
  approved: {
    pill: 'Parcours vérifié',
    pillCls: 'bg-success-bg text-success',
    card: 'border-lime-400 bg-lime-100',
  },
};

function domainOk(email: string, domains: string[]) {
  const d = email.trim().toLowerCase().split('@')[1];
  return !!d && domains.some((x) => d === x || d.endsWith(`.${x}`));
}

function MasterCard({ m, initiallyOpen }: { m: MasterToVerify; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen && (m.state === 'none' || m.state === 'refused'));
  const [method, setMethod] = useState<'' | 'mail' | 'doc'>(m.state === 'code-sent' ? 'mail' : '');
  const [mail, setMail] = useState('');
  const [codeSent, setCodeSent] = useState(m.state === 'code-sent');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const turnstile = useTurnstile('university-code');
  const docForm = useRef<HTMLFormElement>(null);
  const look = LOOK[m.state];
  const typed = mail.trim().length > 3 && mail.includes('@');
  const okDomain = domainOk(mail, m.domains);
  const run = (
    fn: () => Promise<{ ok: boolean; message?: string; error?: string }>,
    then?: () => void,
  ) =>
    start(async () => {
      const r = await fn();
      setMsg(
        r.ok
          ? { tone: 'success', text: r.message ?? 'C’est fait.' }
          : { tone: 'danger', text: r.error ?? 'Erreur.' },
      );
      if (r.ok) then?.();
    });

  return (
    <section
      id={`verif-${m.slug}`}
      aria-labelledby={`verif-${m.slug}-title`}
      className={cn(
        'flex scroll-mt-24 flex-col gap-3 rounded-[24px] border-[1.5px] p-5.5',
        open ? 'border-violet-500 bg-surface-0' : look.card,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={`verif-${m.slug}-title`} className="font-display text-[19px] font-bold">
            {m.title}
          </span>
          <span className="text-[13px] text-ink-muted">
            {m.university} · ton avis « {m.review} »
          </span>
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill py-1.25 pr-3 pl-2.5 text-[13px] font-bold',
            look.pillCls,
          )}
        >
          <span aria-hidden="true" className="size-2 rounded-pill bg-current" />
          {look.pill}
        </span>
      </div>
      <span className="text-[14px] leading-[1.5]">
        {m.state === 'approved'
          ? `Vérifié ${m.approvedHow ?? ''}. Le badge s’affiche sur tes avis pour ce master.`
          : m.state === 'pending'
            ? 'Justificatif reçu : on le vérifie sous 72 h, puis il est supprimé. Tu recevras un mail.'
            : m.state === 'code-sent'
              ? 'Un code t’a été envoyé : saisis-le ci-dessous (valable 15 minutes).'
              : 'Ton avis sur ce master est publié sans badge.'}
      </span>
      {m.state === 'refused' && m.refusal && (
        <Notice tone="warning" title="Dernière demande refusée">
          {m.refusal}
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {(m.state === 'none' || m.state === 'refused') && !open && (
        <span className="flex flex-wrap gap-2">
          <Button variant="night" size="m" aria-expanded={false} onClick={() => setOpen(true)}>
            Vérifier ce master
          </Button>
          {m.canReuseEmail && (
            <Button
              variant="outline"
              size="m"
              disabled={pending}
              onClick={() => run(() => reuseUniversityEmail(m.programId))}
            >
              Utiliser mon adresse de {m.university}, déjà vérifiée
            </Button>
          )}
        </span>
      )}
      {(open || m.state === 'code-sent') && (
        <div className="nm-unfold">
          <div className="flex flex-col gap-3.5">
            {m.state !== 'code-sent' && (
              <ChoiceGroup
                ariaLabel="Méthode de vérification"
                variant="request"
                value={method}
                onChange={setMethod}
                options={[
                  {
                    value: 'mail',
                    label: 'Avec mon mail universitaire',
                    description: `Une adresse de ${m.university}. Instantané.`,
                  },
                  {
                    value: 'doc',
                    label: 'Avec un justificatif',
                    description:
                      'Il doit mentionner ce master : diplôme, relevé de notes, certificat de scolarité.',
                  },
                ]}
              />
            )}
            {method === 'mail' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-end gap-2.5">
                  <Field
                    label="Mail universitaire"
                    className="min-w-0 flex-[1_1_260px]"
                    hintTone={typed && okDomain ? 'ok' : 'muted'}
                    hint={
                      typed && okDomain
                        ? `C’est bien une adresse de ${m.university} ✓`
                        : `Ton adresse de ${m.university} (ex. prenom.nom@etu.${m.domains[0] ?? 'univ.fr'}).`
                    }
                    error={
                      typed && !okDomain
                        ? `Cette adresse n’est pas une adresse de ${m.university} : utilise ton mail de ${m.university}, ou un justificatif.`
                        : undefined
                    }
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="email"
                        value={mail}
                        onChange={(e) => setMail(e.target.value)}
                        placeholder={`prenom.nom@etu.${m.domains[0] ?? 'univ.fr'}`}
                      />
                    )}
                  </Field>
                  <Button
                    variant="night"
                    size="form"
                    disabled={pending || !okDomain}
                    onClick={() =>
                      run(
                        async () => {
                          const r = await sendUniversityCode(
                            m.programId,
                            mail,
                            await turnstile.getToken(),
                          );
                          turnstile.reset();
                          return r;
                        },
                        () => setCodeSent(true),
                      )
                    }
                  >
                    {codeSent ? 'Renvoyer un code' : 'Recevoir un code'}
                  </Button>
                </div>
                {turnstile.field}
                <TurnstileNotice />
              </div>
            )}
            {(codeSent || m.state === 'code-sent') && (
              <div className="flex flex-wrap items-end gap-2.5">
                <Field label="Code reçu" className="max-w-[200px]">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6 chiffres"
                    />
                  )}
                </Field>
                <Button
                  variant="primary"
                  size="form"
                  disabled={pending || code.length !== 6}
                  onClick={() => run(() => confirmUniversityCode(m.programId, code))}
                >
                  Valider
                </Button>
              </div>
            )}
            {method === 'doc' && (
              <form
                ref={docForm}
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  fd.set('programId', m.programId);
                  run(async () => {
                    // Its own route: Server Actions are limited to 1 MB (next.config.ts).
                    const res = await fetch('/api/espace/justificatif', {
                      method: 'POST',
                      body: fd,
                    });
                    return res
                      .json()
                      .catch(() => ({ ok: false, error: 'Envoi impossible : réessaie.' }));
                  });
                }}
              >
                <FileInput
                  name="document"
                  label="Ton justificatif (PDF ou photo)"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  maxBytes={DOCUMENT_MAX_BYTES}
                  required
                  hint="Le document doit montrer ton nom, l’université et l’intitulé de ce master. Une personne de l’équipe le vérifie sous 72 h, puis il est supprimé : on garde seulement « vérifié le … »."
                />
                <Button
                  type="submit"
                  variant="night"
                  size="form"
                  disabled={pending}
                  className="self-start"
                >
                  Envoyer le justificatif
                </Button>
              </form>
            )}
            {m.state !== 'code-sent' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setMethod('');
                }}
                className="min-h-tap cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-ink underline"
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** « Vérification » tab: one card per master the student reviewed. */
export function VerificationMasters({
  masters,
  openSlug,
}: {
  masters: MasterToVerify[];
  openSlug?: string;
}) {
  return (
    <>
      {masters.map((m) => (
        <MasterCard key={m.programId} m={m} initiallyOpen={m.slug === openSlug} />
      ))}
      {masters.length === 0 && (
        <p className="m-0 text-[15px] text-ink-muted">
          Donne un avis sur ton master : tu pourras ensuite le faire vérifier ici.
        </p>
      )}
    </>
  );
}
