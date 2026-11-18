'use client';

import { useState, useTransition } from 'react';
import { Button, controlClass, Notice } from '@/components/ui';
import { containsContacts } from '@/lib/domain/masking';
import { replyWithToken } from '@/app/(public)/messages/actions';

export function TokenReply({ token }: { token: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done)
    return (
      <Notice tone="success" title="Réponse envoyée">
        La personne est prévenue par mail. Tu recevras un nouveau lien si elle te répond.
      </Notice>
    );
  return (
    <form
      className="nm-field"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyWithToken(token, text);
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <label htmlFor="reply" className="nm-label">
        Ta réponse
      </label>
      <textarea
        id="reply"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={controlClass}
        placeholder="Ta réponse…"
      />
      {containsContacts(text) && (
        <span className="nm-hint font-semibold text-warning">
          Les mails et numéros seront masqués automatiquement.
        </span>
      )}
      <Button
        type="submit"
        disabled={pending || text.trim().length < 2}
        size="form"
        className="mt-2 self-start"
        icon="send"
      >
        {pending ? 'Envoi…' : 'Répondre anonymement'}
      </Button>
    </form>
  );
}
