import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/public/LoginForm';
import { Icon } from '@/components/ui/Icon';
import { getCurrentStudent } from '@/lib/auth/student';

export const metadata: Metadata = {
  title: 'Se connecter',
  robots: { index: false, follow: false },
};

/**
 * Where the login brings back: « favori » → Masters suivis, or a page of the site
 * (« /parcours/… »). Only relative paths of the site, checked again when the code is sent.
 */
function nextOf(suite: string | undefined): string | undefined {
  if (suite === 'favori') return '/espace/suivis';
  return suite && /^\/[a-z0-9/_#?=&%.-]*$/i.test(suite) && !suite.startsWith('//')
    ? suite
    : undefined;
}

const programParam = (v: string | undefined) =>
  v && /^[a-z0-9-]{20,40}$/i.test(v) ? v : undefined;

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; suivre?: string }>;
}) {
  if (await getCurrentStudent()) redirect('/espace');
  const { suite, suivre } = await searchParams;
  return (
    <main className="mx-auto box-border flex w-full max-w-[1100px] flex-1 flex-wrap items-center gap-8 px-6 py-12 max-sm:px-4">
      <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-5 rounded-xl border border-border bg-surface-0 p-9 max-sm:p-5">
        <LoginForm next={nextOf(suite)} follow={programParam(suivre)} />
      </section>
      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5">
        <span className="font-display text-[22px] font-bold">Ce qu’on fait de ton adresse</span>
        <ul className="flex flex-col gap-2.5 text-[15px]">
          {(
            [
              [true, 'Te connecter sans mot de passe, avec un code à 6 chiffres.'],
              [true, 'Te prévenir quand ton avis est publié.'],
              [false, 'Jamais affichée sur le site.'],
              [false, 'Jamais transmise à ton université.'],
            ] as const
          ).map(([yes, t]) => (
            <li key={t} className="flex items-start gap-2.5">
              <span
                className={`flex size-6 flex-none items-center justify-center rounded-pill ${yes ? 'bg-success-bg text-success' : 'bg-surface-100 text-ink'}`}
              >
                <Icon name={yes ? 'check' : 'close'} size={14} strokeWidth={2.6} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <span className="text-[14px] leading-[1.5] text-ink-muted">
          Le badge « Parcours vérifié » se demande ensuite depuis ton espace, avec ton mail
          universitaire ou un justificatif.
        </span>
        <Link href="/legal/confidentialite" className="text-[14px] font-semibold">
          Politique de confidentialité →
        </Link>
      </aside>
    </main>
  );
}
