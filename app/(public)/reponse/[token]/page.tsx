import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenReply } from '@/components/public/TokenReply';
import { ChatBubble } from '@/components/ui';
import { peekToken } from '@/lib/auth/magic-link';
import { prisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Répondre', robots: { index: false, follow: false } };

const time = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** Reply page for a participant without account (single-use link, 7 days). */
export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await peekToken(token, 'REPLY');
  const payload = row?.payload as { conversationId?: string; role?: 'AUTHOR' | 'ASKER' } | null;
  const conv = payload?.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: payload.conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          review: { select: { title: true, program: { select: { title: true } } } },
        },
      })
    : null;

  return (
    <main className="mx-auto box-border flex w-full max-w-[720px] flex-col gap-5 px-6 pt-10 pb-20 max-sm:px-4">
      {!conv || !payload?.role ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-9 max-sm:p-5">
          <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Ce lien ne marche plus
          </h1>
          <p className="m-0 text-[16px] text-ink-muted">
            Il a expiré (7 jours) ou a déjà servi. Chaque nouveau message t’envoie un nouveau lien
            par mail.
          </p>
          <Link href="/" className="font-semibold">
            Retour à l’accueil →
          </Link>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-display text-[clamp(32px,5vw,44px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
              {payload.role === 'AUTHOR' ? 'Quelqu’un te pose une question' : 'Tu as une réponse'}
            </h1>
            <p className="m-0 text-ink-muted">
              {conv.review.program.title}
              {conv.review.title ? ` · avis « ${conv.review.title} »` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] bg-surface-100 p-4">
            {conv.messages.map((m) => {
              const mine = m.fromRole === payload.role;
              return (
                <ChatBubble
                  key={m.id}
                  mine={mine}
                  time={time.format(m.createdAt)}
                  from={
                    mine ? 'Toi' : payload.role === 'AUTHOR' ? conv.alias : 'Auteur·rice de l’avis'
                  }
                  masked={m.hadMaskedContent}
                >
                  {m.body}
                </ChatBubble>
              );
            })}
          </div>
          {conv.status === 'OPEN' ? (
            <TokenReply token={token} />
          ) : (
            <p className="m-0 rounded-md bg-warning-bg px-4 py-3 text-[15px]">
              Cette conversation est fermée : tu ne peux plus y répondre.
            </p>
          )}
          <p className="m-0 text-[13px] text-ink-muted">
            Vous restez anonymes l’un pour l’autre. Ce lien ne sert qu’une fois : chaque nouveau
            message t’en enverra un autre.
          </p>
        </>
      )}
    </main>
  );
}
