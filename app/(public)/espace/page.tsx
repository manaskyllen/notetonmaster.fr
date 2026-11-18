import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { Grade } from '@/components/ui/Grade';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { masterVerificationState } from '@/lib/domain/verification';
import { getEspace } from '@/lib/espace';
import { formatRelative } from '@/lib/format';
import { STUDENT_STATUS } from '@/lib/review-status-ui';

export const metadata: Metadata = { title: 'Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

const H1 =
  'm-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]';
const H2 = 'm-0 font-display text-[24px] font-extrabold tracking-[-0.02em]';
const CARD = 'rounded-[24px] border border-border bg-surface-0 p-5.5';
const FIGURE = 'font-display text-[44px] leading-none font-extrabold tracking-[-0.03em]';

interface Todo {
  title: string;
  text: string;
  cta: string;
  href: string;
  icon: IconName;
  tone: string;
}

/** « Vue d'ensemble » of Mon espace: key figures, « À faire », latest messages, my reviews. */
export default async function EspaceHome({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  // Old links (mails sent before the dashboard) pointed to /espace?conversation=…
  const { conversation } = await searchParams;
  if (conversation) redirect(`/espace/messages/${encodeURIComponent(conversation)}`);

  const e = await getEspace();
  const published = e.reviews.filter((r) => r.status === 'PUBLISHED');
  const views = e.reviews.reduce((n, r) => n + r.viewCount, 0);
  const helpful = published.reduce((n, r) => n + r.helpfulCount, 0);
  const waiting = e.waiting;

  const todos: Todo[] = [];
  if (e.toFix)
    todos.push({
      title: `${e.toFix} avis à reformuler`,
      text: 'La modération attend ta correction avant de le publier.',
      cta: 'Reformuler',
      href: '/espace/avis',
      icon: 'edit',
      tone: 'bg-warning-bg text-warning',
    });
  if (waiting.count && waiting.first)
    todos.push({
      title: `${waiting.count} question${waiting.count > 1 ? 's' : ''} sans réponse`,
      text: `Un·e étudiant·e attend ton retour sur « ${waiting.first.review.title ?? waiting.first.review.program.title} ».`,
      cta: 'Répondre',
      href: `/espace/messages/${waiting.first.id}`,
      icon: 'message',
      tone: 'bg-violet-100 text-violet-700',
    });
  const masters = [...new Map(e.reviews.map((r) => [r.programId, r.program])).values()];
  for (const p of masters)
    if (masterVerificationState(p.id, e.verifications) === 'none')
      todos.push({
        title: `Vérifie ton master « ${p.title} »`,
        text: 'Pour que ton avis porte le badge « Parcours vérifié ». 2 minutes.',
        cta: 'Vérifier',
        href: `/espace/verification?parcours=${p.slug}`,
        icon: 'check',
        tone: 'bg-surface-50 text-success',
      });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className={H1}>Ton tableau de bord</h1>
        <span className="text-[15px] text-ink-muted">
          Ce que tes avis apportent aux étudiant·es, et ce qui t’attend.
        </span>
      </div>

      <section
        aria-label="Chiffres clés"
        className="grid grid-cols-4 gap-3.5 max-[1000px]:grid-cols-2"
      >
        <div className="flex flex-col gap-1.5 rounded-[24px] bg-lime-400 p-5 text-on-lime">
          <span className="text-[14px] font-semibold">Lectures de tes avis</span>
          <span className={FIGURE}>
            <CountUp value={views} />
          </span>
          <span className="text-[13px]">+{e.weekViews} ces 7 derniers jours</span>
        </div>
        <div className={cn(CARD, 'flex flex-col gap-1.5 p-5')}>
          <span className="text-[14px] font-semibold text-ink-muted">« Utile » reçus</span>
          <span className={FIGURE}>
            <CountUp value={helpful} />
          </span>
          <span className="text-[13px] text-ink-muted">
            sur {published.length} avis publié{published.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className={cn(CARD, 'flex flex-col gap-1.5 p-5')}>
          <span className="text-[14px] font-semibold text-ink-muted">Questions reçues</span>
          <span className={FIGURE}>
            <CountUp value={waiting.asked} />
          </span>
          <span className="text-[13px] text-ink-muted">
            {waiting.count
              ? `${waiting.count} en attente de réponse`
              : waiting.asked
                ? 'toutes ont une réponse'
                : 'aucune pour l’instant'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[24px] bg-night p-5 text-on-night">
          <span className="text-[14px] font-semibold text-on-night-muted">Masters suivis</span>
          <span className={FIGURE}>
            <CountUp value={e.favorites.length} />
          </span>
          <Link href="/espace/suivis" className="self-start text-[13px] font-bold text-lime-400">
            Voir et comparer
          </Link>
        </div>
      </section>

      <section aria-labelledby="todo" className={cn(CARD, 'flex flex-col gap-3')}>
        <h2 id="todo" className={H2}>
          À faire
        </h2>
        {todos.map((t) => (
          <div
            key={t.title}
            className={cn('flex flex-wrap items-center gap-3.5 rounded-[18px] px-4 py-3.5', t.tone)}
          >
            <span
              aria-hidden="true"
              className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-surface-0"
            >
              <Icon name={t.icon} size={20} />
            </span>
            <span className="flex flex-[1_1_260px] flex-col gap-0.5 text-ink">
              <span className="text-[15px] font-bold">{t.title}</span>
              <span className="text-[14px] text-[color-mix(in_srgb,var(--ink)_50%,var(--ink-muted))]">
                {t.text}
              </span>
            </span>
            <Link href={t.href} className={buttonClasses('night', 'm', 'min-h-10.5')}>
              {t.cta}
            </Link>
          </div>
        ))}
        {todos.length === 0 && (
          <span className="text-[15px]">Rien en attente. Merci pour tes avis !</span>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
        <section aria-labelledby="last-msgs" className={cn(CARD, 'flex flex-col gap-3')}>
          <div className="flex items-center justify-between gap-2.5">
            <h2 id="last-msgs" className={H2}>
              Derniers messages
            </h2>
            <Link href="/espace/messages" className="text-[14px] font-bold">
              Tout voir
            </Link>
          </div>
          {e.conversations.slice(0, 3).map((c) => (
            <Link
              key={c.id}
              href={`/espace/messages/${c.id}`}
              className={cn(
                'flex flex-col gap-0.5 rounded-[16px] border-[1.5px] px-3.5 py-3 text-ink no-underline',
                c.unread ? 'border-violet-500 bg-violet-100' : 'border-border bg-surface-0',
              )}
            >
              <span className="flex justify-between gap-2">
                <span className={cn('text-[14px]', c.unread ? 'font-extrabold' : 'font-medium')}>
                  {c.otherAlias}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {formatRelative(new Date(c.lastMessageAt))}
                </span>
              </span>
              <span className="truncate text-[14px]">{c.messages.at(-1)?.body}</span>
            </Link>
          ))}
          {e.conversations.length === 0 && (
            <span className="text-[14px] text-ink-muted">
              Aucun message. Les questions sur tes avis arriveront ici.
            </span>
          )}
        </section>

        <section aria-labelledby="my-reviews" className={cn(CARD, 'flex flex-col gap-3')}>
          <div className="flex items-center justify-between gap-2.5">
            <h2 id="my-reviews" className={H2}>
              Mes avis
            </h2>
            <Link href="/espace/avis" className="text-[14px] font-bold">
              Gérer
            </Link>
          </div>
          {e.reviews.slice(0, 4).map((r) => {
            const s = STUDENT_STATUS[r.status];
            return (
              <div key={r.id} className="flex items-center gap-3">
                <Grade value={r.overallRating} size="s" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-bold">
                    « {r.title ?? r.program.title} »
                  </span>
                  <span className="truncate text-[13px] text-ink-muted">{r.program.title}</span>
                </span>
                <span
                  className={cn('flex-none rounded-pill px-2.5 py-1 text-[12px] font-bold', s.cls)}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
          {e.reviews.length === 0 && (
            <span className="text-[14px] text-ink-muted">Tu n’as pas encore donné d’avis.</span>
          )}
        </section>
      </div>
    </>
  );
}
