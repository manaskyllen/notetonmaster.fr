import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * Body of the 404 page: under the root (an unknown address, app/not-found.tsx) and inside the
 * public layout (a notFound() of a fiche, a mention, a city page: app/(public)/not-found.tsx).
 */
export function NotFoundContent() {
  return (
    <main className="mx-auto box-border flex w-full max-w-[1100px] flex-1 flex-wrap items-center gap-10 px-6 py-14 max-sm:px-4">
      <div aria-hidden="true" className="relative h-80 min-w-0 flex-[1_1_340px] max-sm:h-64">
        <div className="absolute top-7.5 left-0 size-55 -rotate-8 rounded-[40px] bg-violet-500 max-sm:size-44" />
        <div className="absolute top-0 left-37.5 size-37.5 rounded-pill bg-lime-400 max-sm:left-28 max-sm:size-28" />
        <div className="absolute top-42.5 left-47.5 size-32.5 rotate-16 rounded-[30px] bg-coral-300 max-sm:left-36 max-sm:size-24" />
        <span className="absolute top-22.5 left-5 font-display text-[120px] leading-none font-extrabold tracking-[-0.05em] text-[#16131f] max-sm:text-[96px]">
          404
        </span>
      </div>
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4.5">
        <h1 className="m-0 font-display text-[clamp(34px,5vw,52px)] leading-[1.02] font-extrabold tracking-[-0.035em]">
          Cette page a quitté la fac.
        </h1>
        <p className="m-0 text-[17px] leading-[1.55]">
          Le lien est peut-être ancien, ou la formation a changé de nom. Cherche-la directement :
        </p>
        <form
          role="search"
          action="/"
          method="get"
          className="flex items-center gap-2 rounded-[20px] border-2 border-ink bg-surface-0 py-1.5 pr-1.5 pl-4.5 focus-within:shadow-[0_0_0_4px_var(--focus-halo)]"
        >
          <label htmlFor="q4" className="sr-only">
            Rechercher
          </label>
          <Icon name="search" size={20} />
          <input
            id="q4"
            name="q"
            type="search"
            placeholder="Un master, une fac, une ville…"
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[17px] text-ink outline-none placeholder:text-ink-muted"
          />
          <button type="submit" className={buttonClasses('primary')}>
            Chercher
          </button>
        </form>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/" className={buttonClasses('night')}>
            Accueil
          </Link>
          <Link href="/explorer" className={buttonClasses('outline')}>
            Explorer le catalogue
          </Link>
          <Link href="/a-propos#contact" className={buttonClasses('ghost')}>
            Signaler un lien cassé
          </Link>
        </div>
      </div>
    </main>
  );
}
