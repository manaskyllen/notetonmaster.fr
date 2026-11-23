'use client';

import { maskContacts } from '@/lib/domain/masking';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ChatBubble } from '@/components/ui/ChatBubble';
import { Field } from '@/components/ui/form/Field';
import { NativeSelect, Textarea } from '@/components/ui/form/Controls';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { containsContacts } from '@/lib/domain/masking';
import { formatRelative } from '@/lib/format';
import type { ConversationView } from '@/lib/messaging/queries';
import { MESSAGE_REPORT_REASONS } from '@/lib/validation';
import {
  markRead,
  olderMessages,
  replyInSpace,
  reportConversation,
  setBlocked,
} from '@/app/(public)/messages/actions';
import { PrefSwitch } from './PrefSwitch';

const time = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

function Thread({ c, hasMore: more }: { c: ConversationView; hasMore: boolean }) {
  const [hasMore, setHasMore] = useState(more);
  const [loadingOlder, startOlder] = useTransition();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(c.status);
  const [msgs, setMsgs] = useState(c.messages);
  // Messages present when the thread opened do not move; new ones slide in.
  const [initialIds] = useState(() => new Set(c.messages.map((m) => m.id)));
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (c.unread) void markRead(c.id);
  }, [c.id, c.unread]);

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/espace/messages"
        className="hidden min-h-tap items-center self-start text-[14px] font-semibold max-[1000px]:inline-flex"
      >
        ← Toutes les conversations
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-bold">{c.otherAlias}</span>
          <span className="text-[13px] text-ink-muted">
            à propos de {c.role === 'AUTHOR' ? 'ton avis' : 'l’avis'} sur {c.programTitle}
          </span>
        </span>
        <span className="flex gap-2">
          {c.role === 'AUTHOR' && (
            <Button
              variant="outline"
              size="s"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setBlocked(c.id, status !== 'BLOCKED');
                  if (r.ok) setStatus(status === 'BLOCKED' ? 'OPEN' : 'BLOCKED');
                })
              }
            >
              {status === 'BLOCKED' ? 'Débloquer' : 'Bloquer'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="s"
            onClick={() => setReporting((r) => !r)}
            aria-expanded={reporting}
          >
            Signaler
          </Button>
        </span>
      </div>
      {reporting && !reported && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-50 p-3">
          <Field label="Motif du signalement" className="flex-[1_1_220px]">
            {(a) => (
              <NativeSelect
                {...a}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Choisir…"
                options={Object.entries(MESSAGE_REPORT_REASONS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </Field>
          <Button
            variant="danger"
            size="form"
            disabled={!reason || pending}
            onClick={() =>
              start(async () => {
                const r = await reportConversation(c.id, reason);
                if (r.ok) setReported(r.reference ?? 'envoyé');
                else setError(r.error);
              })
            }
          >
            Envoyer le signalement
          </Button>
        </div>
      )}
      {reported && (
        <Notice tone="success">
          Signalement envoyé (référence {reported}). L’équipe de modération va l’examiner.
        </Notice>
      )}
      <div className="flex flex-col gap-3 rounded-[18px] bg-surface-100 p-4">
        {hasMore && (
          <Button
            variant="ghost"
            size="s"
            className="self-center"
            disabled={loadingOlder}
            onClick={() =>
              startOlder(async () => {
                const r = await olderMessages(c.id, msgs[0]!.id);
                setMsgs((xs) => [...r.messages, ...xs]);
                for (const m of r.messages) initialIds.add(m.id);
                setHasMore(r.hasMore);
              })
            }
          >
            {loadingOlder ? 'Chargement…' : 'Messages précédents'}
          </Button>
        )}
        {msgs.map((m) => (
          <ChatBubble
            key={m.id}
            mine={m.mine}
            time={time.format(new Date(m.createdAt))}
            from={m.mine ? 'Toi' : c.otherAlias}
            masked={m.masked}
            fresh={!initialIds.has(m.id)}
          >
            {m.body}
          </ChatBubble>
        ))}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {status === 'OPEN' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await replyInSpace(c.id, draft);
              if (r.ok) {
                setMsgs((x) => [
                  ...x,
                  {
                    id: `local-${Date.now()}`,
                    mine: true,
                    // The same masking as the server (lib/domain/masking.ts), shown at once.
                    body: maskContacts(draft.trim()).text,
                    createdAt: new Date().toISOString(),
                    masked: !!r.masked,
                  },
                ]);
                setDraft('');
                setError(null);
              } else setError(r.error);
            });
          }}
        >
          <Field
            label="Ta réponse"
            id={`rep-${c.id}`}
            hint={
              containsContacts(draft)
                ? 'Les mails et numéros seront masqués automatiquement.'
                : undefined
            }
          >
            {(a) => (
              <Textarea
                {...a}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ta réponse…"
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="night"
            size="form"
            disabled={pending || draft.trim().length < 2}
            className="self-start"
            icon="send"
          >
            Envoyer
          </Button>
        </form>
      ) : (
        <Notice tone="warning">
          {status === 'BLOCKED'
            ? c.role === 'AUTHOR'
              ? 'Conversation bloquée : cette personne ne peut plus t’écrire.'
              : 'Cette conversation a été fermée par l’auteur·rice de l’avis.'
            : 'Conversation fermée.'}
        </Notice>
      )}
      <span className="text-[13px] text-ink-muted">
        Vous êtes anonymes l’un pour l’autre. Ne partage pas de coordonnées personnelles.
      </span>
    </div>
  );
}

/** Messages of the student space: list, thread, reply, block, report. */
/**
 * « Messages » tab: the list of conversations (300px) next to the open thread; on small screens
 * the list, then the thread full width with a way back. The open conversation is in the URL
 * (/espace/messages/[id]), so mails can link to it.
 */
export function MessagesPanel({
  conversations,
  thread,
  acceptsQuestions,
  chatEnabled,
  openId,
  pagination,
}: {
  /** The conversations of the page (20). */
  conversations: ConversationView[];
  /** The open conversation, with its latest 30 messages. */
  thread: { conversation: ConversationView; hasMore: boolean } | null;
  acceptsQuestions: boolean;
  chatEnabled: boolean;
  openId?: string;
  pagination?: React.ReactNode;
}) {
  const [accepts, setAccepts] = useState(acceptsQuestions);
  const conv = thread?.conversation;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]">
          Messages
        </h1>
        <span className="flex items-center gap-2.5 text-[14px] font-semibold">
          Accepter les questions
          <PrefSwitch
            pref="acceptsQuestions"
            initial={acceptsQuestions}
            label="Accepter les questions sur mes avis"
            onChanged={setAccepts}
          />
        </span>
      </div>
      {!accepts && (
        <p className="m-0 text-[14px] text-ink-muted">
          Le bouton « Poser une question » est retiré de tes avis. Les conversations en cours
          restent ouvertes.
        </p>
      )}
      {!chatEnabled && (
        <p className="m-0 text-[14px] text-ink-muted">
          La messagerie est momentanément désactivée.
        </p>
      )}
      <div
        id="messages"
        className="grid grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-[24px] border border-border bg-surface-0 max-[1000px]:grid-cols-1"
      >
        <ul
          aria-label="Conversations"
          className={cn(
            'm-0 flex list-none flex-col gap-2 border-r border-border p-3 max-[1000px]:border-r-0',
            conv && 'max-[1000px]:hidden',
          )}
        >
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/espace/messages/${c.id}`}
                aria-current={c.id === openId ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-[16px] border-[1.5px] px-3.5 py-3 text-left text-ink no-underline',
                  c.unread ? 'border-violet-500 bg-violet-100' : 'border-border bg-surface-0',
                  c.id === openId && 'outline-2 outline-offset-[-2px] outline-ink',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-2 text-[14px]',
                      c.unread ? 'font-extrabold' : 'font-medium',
                    )}
                  >
                    {c.otherAlias}
                    {c.unread > 0 && (
                      <span className="sr-only">
                        , {c.unread} non lu{c.unread > 1 ? 's' : ''}
                      </span>
                    )}
                    {c.status === 'BLOCKED' && (
                      <span className="rounded-pill bg-surface-100 px-2 py-0.5 text-[12px] font-bold">
                        Bloquée
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] text-ink-muted">
                    {formatRelative(new Date(c.lastMessageAt))}
                  </span>
                </span>
                <span className="text-[13px] text-ink-muted">Sur {c.programTitle}</span>
                <span className="line-clamp-1 text-[14px]">{c.messages.at(-1)?.body}</span>
              </Link>
            </li>
          ))}
          {conversations.length === 0 && (
            <li className="p-2 text-[14px] text-ink-muted">Aucune conversation pour l’instant.</li>
          )}
          {pagination && <li className="pt-2">{pagination}</li>}
        </ul>
        <div className={cn('min-w-0 p-5 max-sm:p-4', !conv && 'max-[1000px]:hidden')}>
          {conv ? (
            <Thread key={conv.id} c={conv} hasMore={thread!.hasMore} />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 text-center">
              <span className="font-display text-[20px] font-bold">Choisis une conversation</span>
              <span className="text-[14px] text-ink-muted">
                Les questions des étudiant·es sur tes avis arrivent ici.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
