'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { setFollow } from '@/app/(public)/parcours/actions';

function Heart() {
  return (
    <svg
      className="nm-heart"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}

/** Ring and eight confetti, drawn only for the celebration. */
function Burst() {
  return (
    <>
      <span className="nm-ring" />
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <span key={n} className={`nm-p nm-p${n}`} />
      ))}
    </>
  );
}

/**
 * « Suivre » / « Suivi » (.save): circular reveal of the fill,
 * heart that pops with a ring and confetti, label rolling from « Suivre » to « Suivi », glow.
 * `hero`: 132px pill on the violet hero of a fiche; `icon`: 44px square on cards, top right of
 * the card (the parent is `relative`), with the lime « Suivi » tag across the card's top edge
 * (.savedtag). The card's border and background follow through CSS (:has).
 *
 * The server is the source of truth (Favorite, read when rendering): the click shows the new
 * state at once, the Server Action stores it, and an error puts the old state back with a message.
 */
export function FollowButton({
  programId,
  title,
  initial,
  loggedIn,
  variant = 'hero',
  onChange,
  demo,
}: {
  programId: string;
  title: string;
  initial: boolean;
  loggedIn: boolean;
  variant?: 'hero' | 'icon';
  onChange?: (saved: boolean, celebrate: boolean) => void;
  /** /design-system only: toggles without calling the server. */
  demo?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  // A new server render (navigation, refresh) brings the stored state: it wins.
  const [server, setServer] = useState(initial);
  if (server !== initial) {
    setServer(initial);
    setSaved(initial);
  }
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const hero = variant === 'hero';
  /** Login by code, then back here with the master followed. */
  const loginHref = (back: string) =>
    `/connexion?suite=${encodeURIComponent(back)}&suivre=${encodeURIComponent(programId)}`;
  const cls = cn(
    'nm-save inline-flex cursor-pointer items-center justify-center gap-2 font-sans font-bold no-underline',
    hero
      ? 'min-h-13 w-[132px] rounded-pill border-2 border-on-violet bg-transparent px-4 text-[15px]'
      : 'nm-save--card size-11 rounded-[14px] border-2 bg-surface-0 p-0',
    !hero && (saved ? 'border-violet-500 text-on-violet' : 'border-border text-ink'),
  );
  const fill = (
    <span
      aria-hidden="true"
      className={cn('nm-save-fill', hero ? 'bg-on-violet' : 'bg-violet-500')}
    />
  );
  const label = hero ? (
    <span className="nm-lbl" aria-hidden="true">
      <span className="nm-la text-on-violet">Suivre</span>
      <span className="nm-lb text-violet-500">Suivi</span>
    </span>
  ) : null;

  if (!loggedIn) {
    const link = (
      <Link
        href={loginHref(pathname)}
        // Keeps the filters of Explorer (query string) in the way back.
        onClick={(e) => {
          e.preventDefault();
          router.push(loginHref(window.location.pathname + window.location.search));
        }}
        aria-label={`Suivre : ${title} (connexion requise)`}
        className={cn(cls, hero ? 'text-on-violet' : '')}
      >
        <span className="nm-save-hw" aria-hidden="true">
          <Heart />
        </span>
        {label}
      </Link>
    );
    return hero ? (
      link
    ) : (
      <span className="nm-followslot absolute top-3.5 right-3.5 z-[1]">{link}</span>
    );
  }

  const apply = (next: boolean, fromServer = false) => {
    setSaved(next);
    setCelebrate(next && !fromServer);
    onChange?.(next, next && !fromServer);
  };

  const button = (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={hero ? 'Suivre ce master' : `${saved ? 'Ne plus suivre' : 'Suivre'} : ${title}`}
      title={saved ? 'Ne plus suivre ce master' : 'Suivre ce master'}
      data-celebrate={celebrate ? '' : undefined}
      disabled={pending}
      onClick={() => {
        const next = !saved;
        setError(null);
        apply(next);
        if (demo) return;
        start(async () => {
          let r: Awaited<ReturnType<typeof setFollow>>;
          try {
            r = await setFollow(programId, next);
          } catch {
            r = { error: 'Connexion perdue : rien n’a été enregistré. Réessaie.' };
          }
          if ('error' in r) {
            apply(!next, true);
            setError(r.error);
          } else if (r.followed !== next) apply(r.followed, true);
        });
      }}
      className={cn(cls, hero && (saved ? 'text-violet-500' : 'text-on-violet'))}
    >
      {fill}
      <span className="nm-save-hw" aria-hidden="true">
        <Heart />
        {celebrate && saved && <Burst />}
      </span>
      {label}
    </button>
  );

  return (
    <>
      {hero ? (
        button
      ) : (
        <span className="nm-followslot absolute top-3.5 right-3.5 z-[1]">{button}</span>
      )}
      {!hero && saved && (
        <span aria-hidden="true" className="nm-savedtag">
          Suivi
        </span>
      )}
      {error && <Toast tone="danger" message={error} onDone={() => setError(null)} />}
    </>
  );
}
