'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { TurnstileNotice, useTurnstile } from '@/components/ui';
import {
  answersLabel,
  ANSWER_MAX,
  BADGE,
  QUESTION_MAX,
  QUESTION_SORTS,
  type QuestionSort,
} from '@/lib/domain/questions';
import type { FormState } from '@/lib/form';
import {
  askPublicQuestion,
  postAnswer,
  voteAnswer,
  voteQuestion,
} from '@/app/(public)/parcours/questions-actions';

export interface QAnswer {
  id: string;
  kind: 'ALUMNI' | 'TEAM';
  who: string;
  body: string;
  voteCount: number;
  voted: boolean;
}
export interface QItem {
  id: string;
  body: string;
  voteCount: number;
  voted: boolean;
  publishedAt: string;
  answerCount: number;
  best: QAnswer | null;
  others: QAnswer[];
}

function QuestionVote({ q }: { q: QItem }) {
  const [s, setS] = useState({ voted: q.voted, count: q.voteCount });
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="qp-vote flex min-h-15 w-13.5 flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[16px] border-[1.5px] font-display text-[17px] font-extrabold"
      aria-pressed={s.voted}
      aria-label={`Moi aussi je me pose la question (${s.count})`}
      disabled={pending}
      style={{
        background: s.voted ? 'var(--violet-500)' : 'var(--surface-0)',
        color: s.voted ? 'var(--on-violet)' : 'var(--ink)',
        borderColor: s.voted ? 'var(--violet-500)' : '#d7d3e0',
      }}
      onClick={() => {
        const voted = !s.voted;
        setS({ voted, count: s.count + (voted ? 1 : -1) });
        start(async () => {
          const r = await voteQuestion(q.id);
          if ('count' in r) setS({ voted: r.voted, count: r.count });
        });
      }}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 15l6-6 6 6" />
      </svg>
      {s.count}
    </button>
  );
}

function AnswerVote({ a }: { a: QAnswer }) {
  const [s, setS] = useState({ voted: a.voted, count: a.voteCount });
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={s.voted}
      disabled={pending}
      onClick={() => {
        const voted = !s.voted;
        setS({ voted, count: s.count + (voted ? 1 : -1) });
        start(async () => {
          const r = await voteAnswer(a.id);
          if ('count' in r) setS({ voted: r.voted, count: r.count });
        });
      }}
      className="qp-vote inline-flex min-h-8 cursor-pointer items-center gap-1.5 self-start rounded-pill border border-current/30 bg-transparent px-2.5 text-[12px] font-bold"
    >
      Utile · {s.count}
      <span className="sr-only"> (réponse de {a.who})</span>
    </button>
  );
}

function AnswerForm({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok)
    return (
      <p
        role="status"
        className="qp-ans m-0 rounded-[14px] bg-lime-100 px-3.5 py-2.5 text-[14px] text-on-lime"
      >
        {msg.text}
      </p>
    );
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-violet-700"
      >
        Répondre
      </button>
    );
  const id = `qp-a-${questionId}`;
  return (
    <form
      className="qp-ans flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await postAnswer({ questionId, body });
          setMsg(
            r.ok
              ? { ok: true, text: 'Merci ! Ta réponse sera publiée après relecture.' }
              : { ok: false, text: r.error },
          );
        });
      }}
    >
      <label htmlFor={id} className="text-[14px] font-semibold">
        Ta réponse
      </label>
      <textarea
        id={id}
        className="nm-control"
        rows={4}
        maxLength={ANSWER_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <span className="text-[13px] text-ink-muted">
        {body.length} / 1 500 · publiée sous ton niveau et ta promo, sans ton nom, après relecture.
      </span>
      {msg && !msg.ok && (
        <span role="alert" className="text-[14px] font-semibold text-danger">
          {msg.text}
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 cursor-pointer self-start rounded-pill border-0 bg-violet-500 px-4.5 text-[14px] font-bold text-on-violet"
      >
        {pending ? 'Envoi…' : 'Envoyer'}
      </button>
    </form>
  );
}

function Best({ a }: { a: QAnswer }) {
  const team = a.kind === 'TEAM';
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[16px] px-3.5 py-3"
      style={{
        background: team ? 'var(--night)' : '#f6fce3',
        color: team ? 'var(--on-night)' : '#16131f',
      }}
    >
      <span className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
        {a.who}
        <span
          className="rounded-pill px-2 py-0.5 text-[12px]"
          style={{
            background: team ? 'var(--lime-400)' : '#ece8ff',
            color: team ? '#16131f' : '#3b23b8',
          }}
        >
          {BADGE[a.kind]}
        </span>
      </span>
      <span className="text-[14px] leading-[1.55] whitespace-pre-line">{a.body}</span>
      <AnswerVote a={a} />
    </div>
  );
}

/** Public dates are rounded to the month (lib/domain/public-date.ts): « Posée en novembre 2026 ». */
const POSTED_MONTH = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function QuestionCard({ q, i, canAnswer }: { q: QItem; i: number; canAnswer: boolean }) {
  const [open, setOpen] = useState(false);
  const k = q.others.length;
  return (
    <article
      className="qp-card flex gap-3.5 rounded-[22px] border border-border bg-surface-0 p-4.5"
      style={{ animationDelay: `${60 * i}ms` }}
    >
      <QuestionVote q={q} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="m-0 font-display text-[18px] leading-[1.3] font-bold">{q.body}</h3>
        <span className="text-[13px] text-ink-muted">
          Posée en {POSTED_MONTH.format(new Date(q.publishedAt))} · {answersLabel(q.answerCount)}
        </span>
        {q.best ? (
          <Best a={q.best} />
        ) : (
          <span className="self-start rounded-pill bg-[#fff6d6] px-3 py-1.5 text-[13px] font-bold text-[#4a3800]">
            Pas encore de réponse · les ancien·nes ont été prévenu·es
          </span>
        )}
        {k > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="min-h-10 cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-violet-700"
          >
            {open
              ? 'Masquer les autres réponses'
              : `Voir ${k} autre${k > 1 ? 's' : ''} réponse${k > 1 ? 's' : ''}`}
          </button>
        )}
        {open && (
          <div className="qp-ans flex flex-col gap-2 border-l-3 border-border pl-3.5">
            {q.others.map((o) => (
              <div key={o.id} className="flex flex-col gap-1">
                <span className="text-[13px] font-bold text-ink-soft">
                  {o.who} · {BADGE[o.kind]}
                </span>
                <span className="text-[14px] leading-[1.55] whitespace-pre-line">{o.body}</span>
                <AnswerVote a={o} />
              </div>
            ))}
          </div>
        )}
        {canAnswer && <AnswerForm questionId={q.id} />}
      </div>
    </article>
  );
}

function AskForm({ programId, onDone }: { programId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(askPublicQuestion, {
    status: 'idle',
  } as FormState);
  const turnstile = useTurnstile('public-question');
  const { reset } = turnstile;
  const [len, setLen] = useState(0);
  useEffect(() => {
    if (state.status !== 'idle') reset();
  }, [state, reset]);
  if (state.status === 'success')
    return (
      <div
        role="status"
        className="qp-ans flex flex-wrap items-center justify-between gap-2 rounded-[22px] bg-lime-100 p-4.5 text-on-lime"
      >
        <span className="text-[15px] font-semibold">{state.message}</span>
        <button
          type="button"
          onClick={onDone}
          className="min-h-10 cursor-pointer rounded-pill border-[1.5px] border-current bg-transparent px-3.5 font-semibold"
        >
          Fermer
        </button>
      </div>
    );
  const err = state.status === 'error' ? state : null;
  return (
    <form
      action={action}
      onSubmit={turnstile.onSubmit}
      className="qp-ans flex flex-col gap-2.5 rounded-[22px] border-2 border-ink bg-surface-0 p-4.5"
      noValidate
    >
      <input type="hidden" name="programId" value={programId} />
      <label htmlFor="qp-q" className="text-[14px] font-semibold">
        Ta question
      </label>
      <textarea
        id="qp-q"
        name="body"
        rows={3}
        className="nm-control"
        maxLength={QUESTION_MAX}
        defaultValue={err?.values?.body}
        onChange={(e) => setLen(e.target.value.length)}
        placeholder="Ex. : peut-on faire le stage de M2 à l’étranger ?"
        aria-invalid={err?.fieldErrors?.body ? true : undefined}
        aria-describedby="qp-q-hint"
      />
      <span
        id="qp-q-hint"
        className={`text-[13px] ${err?.fieldErrors?.body ? 'text-danger' : 'text-ink-muted'}`}
      >
        {err?.fieldErrors?.body ??
          `Publiée sous un pseudonyme après relecture. Pas de nom, pas de question sur une personne. ${len} / ${QUESTION_MAX}`}
      </span>
      {err?.message && (
        <span role="alert" className="text-[14px] font-semibold text-danger">
          {err.message}
        </span>
      )}
      {turnstile.field}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 cursor-pointer self-start rounded-pill border-0 bg-violet-500 px-4.5 text-[14px] font-bold text-on-violet"
      >
        {pending ? 'Envoi…' : 'Envoyer'}
      </button>
      <TurnstileNotice />
    </form>
  );
}

/**
 * « Questions » tab of a program page: sorts, « moi aussi » votes, the best
 * answer put forward (the team's official answer first, else the most voted), the others below.
 */
export function QuestionsPanel({
  programId,
  slug,
  items,
  sort,
  unanswered,
  loggedIn,
  canAnswer,
  pagination,
}: {
  programId: string;
  slug: string;
  items: QItem[];
  sort: QuestionSort;
  unanswered: number;
  loggedIn: boolean;
  canAnswer: boolean;
  pagination: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  // Back from the login asked by « Poser une question »: the form opens by itself.
  useEffect(() => {
    if (!loggedIn || !new URLSearchParams(window.location.search).has('question')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time action after login
    setAsking(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('question');
    window.history.replaceState(window.history.state, '', url);
    document.getElementById('questions-titre')?.scrollIntoView({ block: 'start' });
  }, [loggedIn]);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="questions-titre"
            className="m-0 font-display text-[30px] font-extrabold tracking-[-0.02em] max-sm:text-[26px]"
          >
            Questions sur ce master
          </h2>
          <span className="text-[14px] text-ink-soft">
            Les ancien·nes et l’équipe pédagogique vérifiés peuvent répondre.
          </span>
        </div>
        {loggedIn ? (
          <button
            type="button"
            aria-expanded={asking}
            onClick={() => setAsking((a) => !a)}
            className="min-h-11.5 cursor-pointer rounded-pill border-0 bg-lime-400 px-4.5 text-[15px] font-bold text-on-lime"
          >
            Poser une question
          </button>
        ) : (
          <Link
            href={`/connexion?suite=${encodeURIComponent(`/parcours/${slug}?question=1#questions`)}`}
            className="inline-flex min-h-11.5 items-center rounded-pill bg-lime-400 px-4.5 text-[15px] font-bold text-on-lime no-underline"
          >
            Poser une question
          </Link>
        )}
      </div>
      {asking && <AskForm programId={programId} onDone={() => setAsking(false)} />}
      <nav aria-label="Trier les questions" className="flex flex-wrap gap-1.5">
        {QUESTION_SORTS.map((t) => {
          const on = t.id === sort;
          return (
            <Link
              key={t.id}
              href={`/parcours/${slug}${t.id === 'populaires' ? '?qtri=populaires' : `?qtri=${t.id}`}#questions`}
              scroll={false}
              aria-current={on ? 'true' : undefined}
              className="inline-flex min-h-11 items-center rounded-pill border-[1.5px] px-4 text-[14px] font-semibold no-underline"
              style={{
                borderColor: on ? 'var(--ink)' : '#d7d3e0',
                background: on ? 'var(--ink)' : 'var(--surface-0)',
                color: on ? 'var(--surface-0)' : 'var(--ink)',
              }}
            >
              {t.label}
              {t.id === 'sans-reponse' ? ` (${unanswered})` : ''}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 && (
        <p className="m-0 rounded-[22px] border border-dashed border-border-control bg-surface-0 p-6 text-center text-[15px] text-ink-muted">
          {sort === 'sans-reponse'
            ? 'Toutes les questions ont une réponse.'
            : 'Pas encore de question. Pose la première !'}
        </p>
      )}
      <div key={`${sort}-${items.map((q) => q.id).join()}`} className="flex flex-col gap-3.5">
        {items.map((q, i) => (
          <QuestionCard key={q.id} q={q} i={i} canAnswer={canAnswer} />
        ))}
      </div>
      {pagination}
      <p className="m-0 text-caption leading-[1.5] text-ink-muted">
        En plus de la messagerie privée avec les auteur·rices d’avis. Questions et réponses sont
        relues avant publication ; les coordonnées sont masquées.
      </p>
    </div>
  );
}
