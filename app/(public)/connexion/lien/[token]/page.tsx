import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenConfirm } from '@/components/public/TokenConfirm';
import { peekToken } from '@/lib/auth/magic-link';
import { confirmLogin } from '../../actions';

export const metadata: Metadata = {
  title: 'Confirmer la connexion',
  robots: { index: false, follow: false },
};

export default async function LoginLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await peekToken(token, 'LOGIN');
  return (
    <main className="mx-auto box-border flex w-full max-w-[640px] flex-1 flex-col justify-center gap-5 px-6 py-14 max-sm:px-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-0 p-9 max-sm:p-5">
        {valid ? (
          <>
            <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
              Confirmer la connexion
            </h1>
            <p className="m-0 text-[16px] text-ink-muted">
              Un clic pour te connecter sur cet appareil. Le code du même mail ne servira plus.
            </p>
            <TokenConfirm
              label="Me connecter sur cet appareil"
              action={confirmLogin.bind(null, token)}
            />
          </>
        ) : (
          <>
            <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
              Ce lien ne marche plus
            </h1>
            <p className="m-0 text-[16px] text-ink-muted">
              Il a expiré (10 minutes) ou a déjà servi, peut-être avec le code du même mail. Demande
              un nouveau code, ça prend dix secondes.
            </p>
            <Link href="/connexion" className="font-semibold">
              Recevoir un nouveau code →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
