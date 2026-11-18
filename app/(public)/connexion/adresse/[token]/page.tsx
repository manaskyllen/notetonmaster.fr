import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenConfirm } from '@/components/public/TokenConfirm';
import { peekToken } from '@/lib/auth/magic-link';
import { confirmEmailChange } from '../../actions';

export const metadata: Metadata = {
  title: 'Nouvelle adresse',
  robots: { index: false, follow: false },
};

/** Link of the « Changer d'adresse » mail: one click confirms the new address. */
export default async function EmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await peekToken(token, 'CHANGE_EMAIL');
  return (
    <main className="mx-auto box-border flex w-full max-w-[640px] flex-1 flex-col justify-center gap-5 px-6 py-14 max-sm:px-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-0 p-9 max-sm:p-5">
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          {valid ? 'Confirme ta nouvelle adresse' : 'Ce lien ne marche plus'}
        </h1>
        {valid ? (
          <>
            <p className="m-0 text-[16px] text-ink-muted">
              Tu te connecteras désormais avec cette adresse ; l’ancienne ne servira plus.
            </p>
            <TokenConfirm
              label="Confirmer sur cet appareil"
              action={confirmEmailChange.bind(null, token)}
            />
          </>
        ) : (
          <>
            <p className="m-0 text-[16px] text-ink-muted">
              Il a expiré (10 minutes) ou a déjà servi, peut-être avec le code du même mail. Refais
              la demande depuis ton espace.
            </p>
            <Link href="/espace/compte" className="font-semibold">
              Retour à mon compte →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
