'use client';

import { useReauth } from '@/components/admin/Reauth';
import { useState, useTransition } from 'react';
import { Button, controlClass, Notice, TextField } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ROLE_HELP, ROLE_LABEL, ROLES } from '@/lib/domain/permissions';
import { changeRole, inviteMember, removeMember } from '@/app/admin/(panel)/equipe/actions';
import { Pill } from './ui';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL';
  twofa: 'on' | 'off' | 'pending';
  last: string;
  me: boolean;
}

const AV = [
  'bg-lime-400 text-on-lime',
  'bg-coral-300 text-on-lime',
  'bg-violet-100 text-violet-700',
  'bg-lime-100 text-lime-800',
];

export function TeamManager({ members, canManage }: { members: Member[]; canManage: boolean }) {
  const reauth = useReauth();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Member['role']>('MODERATOR');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const done = (r: { ok: boolean; message?: string; error?: string }) =>
    setMsg(
      r.ok
        ? { tone: 'success', text: r.message ?? 'Fait.' }
        : { tone: 'danger', text: r.error ?? 'Erreur.' },
    );

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section
        aria-labelledby="members-title"
        className="flex min-w-0 flex-[3_1_560px] flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5"
      >
        <h2 id="members-title" className="m-0 font-display text-[22px] font-extrabold">
          Membres
        </h2>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <ul className="flex flex-col">
          {members.map((m, i) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-10 flex-none items-center justify-center rounded-[12px] font-display text-[16px] font-extrabold',
                  AV[i % AV.length],
                )}
              >
                {m.name.charAt(0)}
              </span>
              <span className="flex min-w-0 flex-[1_1_200px] flex-col">
                <span className="font-bold">
                  {m.name}
                  {m.me ? ' (toi)' : ''}
                </span>
                <span className="truncate text-[13px] text-ink-muted">{m.email}</span>
              </span>
              <label className="sr-only" htmlFor={`role-${m.id}`}>
                Rôle de {m.name}
              </label>
              <select
                id={`role-${m.id}`}
                value={m.role}
                disabled={!canManage || pending || m.me}
                onChange={(e) =>
                  start(async () =>
                    done((await reauth(() => changeRole(m.id, e.target.value))) as never),
                  )
                }
                className={cn(controlClass, 'w-auto')}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <Pill tone={m.twofa === 'on' ? 'ok' : m.twofa === 'off' ? 'error' : 'info'}>
                {m.twofa === 'on'
                  ? '2FA activée'
                  : m.twofa === 'off'
                    ? '2FA à activer'
                    : 'Invitation'}
              </Pill>
              <span className="w-32 text-[12px] text-ink-muted">{m.last}</span>
              {canManage && !m.me && (
                <Button
                  variant={confirm === m.id ? 'danger' : 'ghost'}
                  size="s"
                  disabled={pending}
                  onClick={() => {
                    if (confirm !== m.id) return setConfirm(m.id);
                    start(async () => {
                      done((await reauth(() => removeMember(m.id))) as never);
                      setConfirm(null);
                    });
                  }}
                >
                  {confirm === m.id
                    ? 'Confirmer le retrait'
                    : m.twofa === 'pending'
                      ? 'Annuler l’invitation'
                      : 'Retirer'}
                  <span className="sr-only"> : {m.email}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {canManage && (
        <section
          aria-labelledby="invite-title"
          className="flex min-w-0 flex-[2_1_300px] flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5"
        >
          <h2 id="invite-title" className="m-0 font-display text-[22px] font-extrabold">
            Inviter
          </h2>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = (await reauth(() => inviteMember({ email, role }))) as {
                  ok: boolean;
                  message?: string;
                  error?: string;
                };
                done(r);
                if (r.ok) setEmail('');
              });
            }}
          >
            <TextField
              label="Adresse mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="nm-field nm-label">
              Rôle
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Member['role'])}
                className={controlClass}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[13px] text-ink-muted">{ROLE_HELP[role]}</p>
            <Button
              type="submit"
              variant="night"
              disabled={pending || !email.includes('@')}
              className="self-start"
            >
              Envoyer l’invitation
            </Button>
          </form>
          <p className="m-0 text-[12px] text-ink-muted">
            La personne choisit son mot de passe et active la double authentification à sa première
            connexion. Le lien est valable 7 jours.
          </p>
        </section>
      )}
    </div>
  );
}
