import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportForm } from '@/components/public/ReportForm';
import { prisma } from '@/lib/db';
import { authorWho } from '@/lib/domain/rating';
import { appUrl } from '@/emails/Layout';

export const metadata: Metadata = {
  title: 'Signaler un contenu',
  robots: { index: false, follow: false },
  description:
    'Signaler un avis ou notifier un contenu illicite. Chaque demande est lue par une personne de l’équipe.',
};
export const dynamic = 'force-dynamic';

export default async function SignalerPage({
  searchParams,
}: {
  searchParams: Promise<{ avis?: string; mode?: string }>;
}) {
  const { avis, mode } = await searchParams;
  const review =
    avis && /^avis-[0-9a-f]{6}$/.test(avis)
      ? await prisma.review.findFirst({
          where: { ref: avis, status: { in: ['PUBLISHED', 'HIDDEN'] } },
          include: { program: { select: { title: true, slug: true } } },
        })
      : null;
  return (
    <main className="mx-auto box-border flex w-full max-w-[1100px] flex-col gap-6 px-6 pt-8 pb-20 max-sm:px-4">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[clamp(36px,5vw,52px)] leading-none font-extrabold tracking-[-0.035em]">
          Signaler un contenu
        </h1>
        <p className="m-0 text-body-l text-ink-muted">
          Chaque signalement est lu par une personne de l’équipe. Tu reçois une réponse motivée.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_560px]">
          <ReportForm
            initialTarget={
              review ? `${appUrl()}/parcours/${review.program.slug}#${review.ref}` : undefined
            }
            initialMode={mode === 'retrait' ? 'formal' : 'simple'}
            backHref={review ? `/parcours/${review.program.slug}` : '/'}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          {review && (
            <>
              <span className="text-label text-ink-muted uppercase">Contenu signalé</span>
              <article className="flex flex-col gap-1.5 rounded-[22px] border border-border bg-surface-0 p-5">
                <span className="text-[13px] text-ink-muted">
                  {review.isDemo ? 'Avis exemple · ' : ''}
                  {review.program.title}
                </span>
                <span className="text-[14px] font-bold">
                  Anonyme · {authorWho(review.level, review.cohortYear)}
                </span>
                <span className="line-clamp-3 text-[14px] text-ink-muted">{review.pros}</span>
                <span className="font-mono text-code text-ink-muted">ID {review.ref}</span>
              </article>
            </>
          )}
          <div className="flex flex-col gap-1.5 rounded-[22px] bg-surface-100 p-5 text-[14px] leading-[1.5]">
            <strong>Comment on traite ta demande</strong>
            <span>1. Accusé de réception immédiat.</span>
            <span>2. Examen par un·e modérateur·rice, au regard de la charte et de la loi.</span>
            <span>3. Décision motivée envoyée à toi et à l’auteur de l’avis.</span>
            <Link href="/legal/charte" className="mt-1 font-semibold">
              Lire la charte de modération →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
