import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmReviewButton } from '@/components/public/ConfirmReviewButton';
import { peekToken } from '@/lib/auth/magic-link';

export const metadata: Metadata = {
  title: 'Confirmer mon avis',
  robots: { index: false, follow: false },
};

export default async function ConfirmReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await peekToken(token, 'CONFIRM_REVIEW');
  return (
    <main className="mx-auto box-border flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-14 max-sm:px-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-0 p-9 max-sm:p-5">
        {valid ? (
          <ConfirmReviewButton token={token} />
        ) : (
          <>
            <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
              Ce lien ne marche plus
            </h1>
            <p className="m-0 text-[16px] text-ink-muted">
              Ton avis est peut-être déjà confirmé (avec le code du même mail, par exemple), ou le
              lien a expiré (10 minutes). Le bouton « Renvoyer un code » de l’écran de remerciement
              en envoie un nouveau.
            </p>
            <Link href="/avis/nouveau" className="font-semibold">
              Donner mon avis →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
