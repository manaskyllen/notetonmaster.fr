import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteBanner } from '@/components/site/SiteBanner';
import type { BannerData } from '@/lib/domain/banner';
import { SearchShortcutProvider } from './SearchShortcut';
import { SiteHeader } from './SiteHeader';

/** Public chrome: skip link, header, main, footer; ⌘K leads to the page's search. */
export function PageShell({
  children,
  banner = null,
}: {
  children: React.ReactNode;
  banner?: BannerData | null;
}) {
  return (
    <SearchShortcutProvider>
      <div className="flex min-h-screen flex-col">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-pill focus:bg-night focus:px-4 focus:py-3 focus:text-on-night"
        >
          Aller au contenu
        </a>
        <SiteBanner banner={banner} />
        <SiteHeader />
        <div id="contenu" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </div>
    </SearchShortcutProvider>
  );
}

/** Standard page container (1200px, 24px gutters, 16px on mobile). */
export function Container({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-page px-6 max-sm:px-4 ${className}`}>{children}</div>
  );
}

/** "Source : …" caption required under every public figure. */
export function SourceLine({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`m-0 text-caption text-ink-muted ${className}`}>{children}</p>;
}
