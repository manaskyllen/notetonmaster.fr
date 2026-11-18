'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/form/Field';
import { Icon } from '@/components/ui/Icon';
import { Input, Textarea } from '@/components/ui/form/Controls';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import { TurnstileNotice, useTurnstile } from '@/components/ui/Turnstile';
import { containsContacts } from '@/lib/domain/masking';
import { askQuestion } from '@/app/(public)/messages/actions';

const MAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * "Poser une question": opens a modal (never an inline form in the card). After sending, the
 * modal shows a confirmation; once closed, the card keeps a "Question envoyée" reminder.
 */
export function AskQuestionToggle({
  review,
  loggedIn,
}: {
  review: { id: string; title: string | null };
  loggedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [round, setRound] = useState(0);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        className="nm-btn-press inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-pill border-0 bg-violet-500 px-4 font-sans text-[14px] font-bold text-on-violet hover:brightness-106"
      >
        <Icon name="message" size={16} />
        Poser une question
      </button>
      {sent && !open && (
        <div
          role="status"
          className="nm-toast-in inline-flex basis-full items-center gap-2 self-start rounded-[12px] bg-lime-100 px-3.5 py-2 text-[14px] font-semibold text-ink sm:basis-auto"
        >
          <Icon name="check" size={16} strokeWidth={2.6} />
          Question envoyée : la réponse t’arrivera par mail.
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <AskForm
          key={round}
          titleId={titleId}
          review={review}
          loggedIn={!!loggedIn}
          onSent={() => setSent(true)}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

function AskForm({
  titleId,
  review,
  loggedIn,
  onSent,
  onClose,
}: {
  titleId: string;
  review: { id: string; title: string | null };
  loggedIn: boolean;
  onSent: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [mail, setMail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const turnstile = useTurnstile('question');

  if (done)
    return (
      <div role="status" className="nm-modal-done flex flex-col gap-3">
        <span
          aria-hidden="true"
          className="flex size-13 items-center justify-center rounded-[16px] bg-lime-400 text-on-lime"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="nm-check-draw" pathLength={1} d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <h2 id={titleId} className="nm-modal__title">
          Question envoyée
        </h2>
        <p className="m-0 text-[15px] leading-[1.5]">
          L’auteur·rice est prévenu·e par mail. Sa réponse t’arrivera par mail
          {loggedIn ? (
            <>
              {' '}
              et dans <Link href="/espace/messages">ton espace</Link>.
            </>
          ) : (
            '.'
          )}
        </p>
        <Button variant="night" size="form" className="self-start" onClick={onClose}>
          Fermer
        </Button>
      </div>
    );

  const canSend = text.trim().length >= 10 && (loggedIn || MAIL.test(mail.trim()));

  return (
    <form
      className="flex flex-col gap-3.5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        start(async () => {
          const turnstileToken = await turnstile.getToken();
          const r = await askQuestion({
            reviewId: review.id,
            message: text,
            email: mail,
            turnstileToken,
          });
          turnstile.reset();
          if (r.ok) {
            setDone(true);
            onSent();
          } else {
            setError(r.error);
            setErrors(r.fieldErrors ?? {});
          }
        });
      }}
    >
      <span className="flex flex-col gap-1">
        <h2 id={titleId} className="nm-modal__title">
          Poser une question
        </h2>
        {review.title && (
          <span className="pr-12 text-[14px] text-ink-muted">
            À l’auteur·rice de l’avis « {review.title} »
          </span>
        )}
      </span>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Ta question" error={errors.message}>
        {(a) => (
          <Textarea
            {...a}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex. Le stage de M2 est-il facile à trouver quand on vient d’une autre région ?"
          />
        )}
      </Field>
      {containsContacts(text) && (
        <span
          role="status"
          className="rounded-[10px] bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning"
        >
          Ton message contient un mail ou un numéro : il sera masqué pour protéger ton anonymat.
        </span>
      )}
      {!loggedIn && (
        <Field label="Ton adresse mail, pour recevoir la réponse" error={errors.email}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="ton.adresse@mail.fr"
            />
          )}
        </Field>
      )}
      <span className="nm-hint">
        Vous restez anonymes tous les deux : ni ton adresse ni la sienne ne sont partagées. Les
        échanges suivent la <Link href="/legal/charte">charte</Link>.
      </span>
      {turnstile.field}
      <TurnstileNotice />
      <span className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="form" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="night" size="form" disabled={pending || !canSend}>
          {pending ? 'Envoi…' : 'Envoyer anonymement'}
        </Button>
      </span>
    </form>
  );
}
