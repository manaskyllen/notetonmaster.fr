import type { Metadata } from 'next';
import { EspaceNav, TabFade } from '@/components/espace/EspaceNav';
import { CtaArrow, ctaClasses } from '@/components/ui/Button';
import { DemoNotice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { LEVEL_SHORT } from '@/lib/domain/rating';
import { getEspace } from '@/lib/espace';
import { logout } from '../connexion/actions';

export const dynamic = 'force-dynamic';

/** Private area: never indexed (also disallowed in robots.txt). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PILL = {
  all: 'bg-success-bg text-success',
  some: 'bg-violet-100 text-violet-700',
  none: 'bg-surface-100 text-ink',
};

/** « Mon espace »: dashboard with a sticky sidebar and six tabs. */
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const e = await getEspace();
  const v = e.verified;
  const tone = v.total && v.verified === v.total ? 'all' : v.verified ? 'some' : 'none';
  const level = e.student.level ?? e.reviews[0]?.level ?? null;
  return (
    <div className="mx-auto box-border grid w-full max-w-page grid-cols-[260px_minmax(0,1fr)] items-start gap-7 px-6 pt-7 pb-20 max-[899px]:grid-cols-1 max-[899px]:pt-4 max-sm:px-4">
      <aside className="sticky top-22 flex flex-col gap-3.5 max-[899px]:static max-[899px]:min-w-0">
        <div className="flex flex-col gap-2.5 rounded-[24px] border border-border bg-surface-0 p-4.5 max-[899px]:hidden">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-violet-100 font-display text-[16px] font-extrabold text-violet-700"
            >
              {level ? LEVEL_SHORT[level] : '·'}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">Mon espace</span>
              <span className="truncate text-[13px] text-ink-muted">{e.maskedEmail}</span>
            </span>
          </span>
          {v.total > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 self-start rounded-pill px-2.5 py-1 text-[12px] font-bold',
                PILL[tone],
              )}
            >
              <span aria-hidden="true" className="size-1.75 rounded-pill bg-current" />
              {v.label}
            </span>
          )}
        </div>
        <EspaceNav counts={{ toFix: e.toFix, unread: e.unread }} />
        <div className="flex flex-col gap-2.5 px-0.5 py-1 max-[899px]:hidden">
          <a href="/avis/nouveau" className={ctaClasses('primary', 'm', 'self-start')}>
            Donner un nouvel avis
            <CtaArrow />
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex min-h-tap cursor-pointer items-center border-0 bg-transparent px-3 text-[14px] font-semibold text-[color-mix(in_srgb,var(--ink)_50%,var(--ink-muted))]"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <main id="espace-main" className="flex min-w-0 flex-col gap-5.5">
        {e.student.isDemo && (
          <DemoNotice>
            Ce compte est un compte de démonstration : avis, messages et vérifications sont fictifs.
          </DemoNotice>
        )}
        <TabFade>{children}</TabFade>
      </main>
    </div>
  );
}
