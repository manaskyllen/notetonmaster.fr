import { HoverLink as Link } from '@/components/ui/HoverLink';
import { getCurrentStudent } from '@/lib/auth/student';
import {
  footerFigures,
  formatStatsDate,
  getFooterStats,
  type FooterStats,
} from '@/lib/domain/footer-stats';
import { FooterGate, FooterThemeSwitcher, SiteFooterMotion } from './SiteFooterMotion';
import { BrandName } from '@/components/ui/BrandName';
import { cachedOpenZones } from '@/lib/launch/cached';

/**
 * Footer of the public site. Server component: it reads the figures of
 * « La base aujourd'hui » (cached 1 hour) and renders the final state (full numbers, giant logo in
 * place); SiteFooterMotion only plays the entrance animations and drives the theme selector.
 * Hidden on /avis/nouveau (FooterGate); never rendered in /admin (not in that layout).
 */

/** Cities listed in the « Par ville » column before « Toutes les villes → » (/masters). */
const FOOTER_CITIES = 5;

const linkClass = 'ft-link nm-hit self-start text-[15px] leading-[normal]';

async function readStats(): Promise<FooterStats | null> {
  try {
    return await getFooterStats();
  } catch {
    // The footer always shows, without its figures when the database does not answer.
    return null;
  }
}

export async function SiteFooter() {
  const [stats, student, zones] = await Promise.all([
    readStats(),
    getCurrentStudent().catch(() => null),
    cachedOpenZones().catch(() => []),
  ]);
  const figures = stats ? footerFigures(stats) : null;
  const columns: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: 'Trouver',
      links: [
        { href: '/explorer', label: 'Explorer les masters' },
        { href: '/mentions', label: 'Les mentions' },
        { href: '/universites', label: 'Les universités' },
        { href: '/guides', label: 'Guides' },
      ],
    },
    // The open cities only (their pages answer 404 once a city is closed).
    ...(zones.length
      ? [
          {
            title: 'Par ville',
            // the most furnished first, then always the page of every city (/masters): it is
            // its only link from the other pages, it must never be orphan
            links: [
              ...zones
                .slice(0, FOOTER_CITIES)
                .map((z) => ({ href: `/masters/${z.slug}`, label: `Masters à ${z.name}` })),
              { href: '/masters', label: 'Toutes les villes →' },
            ],
          },
        ]
      : []),
    {
      title: 'Contribuer',
      links: [
        { href: '/avis/nouveau', label: 'Donner mon avis' },
        student
          ? { href: '/espace', label: 'Mon espace' }
          : { href: '/connexion', label: 'Se connecter' },
      ],
    },
    {
      title: 'Le site',
      links: [
        { href: '/a-propos', label: 'À propos et contact' },
        { href: '/a-propos#sources', label: 'Sources et méthode' },
        { href: '/legal/charte', label: 'Charte de modération' },
        { href: '/signaler', label: 'Signaler un contenu' },
        { href: '/legal/mentions-legales', label: 'Mentions légales' },
        { href: '/legal/confidentialite', label: 'Confidentialité' },
      ],
    },
  ];

  return (
    <FooterGate>
      <footer className="ft mt-24" aria-labelledby="ft-title" data-ft="">
        <h2 id="ft-title" className="sr-only">
          Pied de page
        </h2>
        <div className="mx-auto box-border flex max-w-[1248px] flex-col gap-14 px-6 pt-16">
          <div className="flex flex-wrap justify-between gap-12">
            <div className="flex max-w-[440px] flex-[1_1_340px] flex-col items-start gap-5">
              <p className="m-0 font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.03em]">
                Tu es passé·e par un master{' '}? À toi de{' '}
                <span className="inline-block -rotate-2 rounded-[8px] bg-[#d4f75a] px-2 pb-0.5 text-[#16131f]">
                  raconter.
                </span>
              </p>
              <Link
                href="/avis/nouveau"
                className="ft-cta inline-flex min-h-13 items-center gap-2.5 rounded-pill bg-[#d4f75a] px-5.5 text-[16px] font-bold"
              >
                Donner mon avis
                <svg
                  className="ft-arr"
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>

            <nav
              aria-label="Pied de page"
              className="grid flex-[2_1_520px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-8 max-sm:flex-[1_1_100%]"
            >
              {columns.map((c) => (
                <div key={c.title} className="flex flex-col gap-3 max-sm:gap-6">
                  <span className="text-[12px] leading-[normal] font-bold tracking-[0.08em] text-[#d4f75a] uppercase">
                    {c.title}
                  </span>
                  {c.links.map((l) => (
                    <Link key={l.href} href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </div>

          {figures && (
            <section
              aria-labelledby="ft-stats"
              className="flex flex-col gap-6 border-t border-[#2e2a3a] pt-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3
                  id="ft-stats"
                  className="m-0 text-[12px] leading-[normal] font-bold tracking-[0.08em] text-[#cfcadb] uppercase"
                >
                  La base aujourd’hui
                </h3>
                {stats?.updatedAt && (
                  <span className="inline-flex items-center gap-2.5 text-[13px] leading-[normal] text-[#cfcadb]">
                    <span className="ft-live" aria-hidden="true" />
                    Données à jour · {formatStatsDate(stats.updatedAt)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-7 max-[479px]:grid-cols-1 min-[480px]:max-sm:grid-cols-2">
                {figures.map((f, i) => (
                  <div key={f.key} className="flex flex-col gap-2.5" data-ft-stat={f.key}>
                    <span className="ft-num" role="img" aria-label={f.aria} data-ft-value={f.value}>
                      {f.text}
                    </span>
                    <span
                      className="ft-bar"
                      aria-hidden="true"
                      style={{ transitionDelay: `${120 * i}ms` }}
                    />
                    <span aria-hidden="true" className="text-[15px] leading-[1.4] text-[#cfcadb]">
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-7 gap-y-4 border-t border-[#2e2a3a] pt-5.5 text-[13px] leading-[normal] text-[#a9a3b8]">
            <span className="flex max-w-[640px] flex-col gap-1">
              <span>
                <BrandName /> — site indépendant, non affilié aux universités ni au ministère.
              </span>
            </span>
            <span className="flex items-center gap-4">
              <FooterThemeSwitcher />
              <span>© {new Date().getFullYear()}</span>
            </span>
          </div>
        </div>

        <div aria-hidden="true" className="ft-wm">
          <span className="w w1">note</span>
          <span className="w w2 g">ton</span>
          <span className="w hl">master</span>
        </div>
        <SiteFooterMotion />
      </footer>
    </FooterGate>
  );
}
