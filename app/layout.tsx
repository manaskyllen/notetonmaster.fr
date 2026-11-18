import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { HydrationMarker } from '@/components/ui/HydrationMarker';
import { NavMarker } from '@/components/ui/NavMarker';
import { SITE_DESCRIPTION } from '@/lib/brand/copy';
import { getBanner } from '@/lib/banner';
import { bannerHeadScript, bannerKey } from '@/lib/domain/banner';
import { siteOrigin } from '@/lib/seo/site';
import { fontDisplay, fontMono, fontSans } from './fonts';
import './globals.css';

/**
 * Read at run time (APP_URL is set at deploy time, not at build time): canonicals, Open Graph
 * and JSON-LD always carry the origin the site is served on. Public pages give their own full
 * metadata (lib/seo/meta.ts); the template is for the others.
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: 'notetonmaster', template: '%s | notetonmaster' },
    description: SITE_DESCRIPTION,
    applicationName: 'notetonmaster',
    openGraph: {
      type: 'website',
      siteName: 'notetonmaster',
      locale: 'fr_FR',
      images: [{ url: '/og/site.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', images: ['/og/site.png'] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f8' },
    { media: '(prefers-color-scheme: dark)', color: '#13111a' },
  ],
};

/** Applies the stored theme (cookie nm-theme, ThemeSwitcher) before first paint to avoid a flash. */
// `nm-first`: first document load, entrance animations off (styles/motion.css, NavMarker).
const themeScript = `document.documentElement.classList.add('nm-js','nm-first');try{var m=document.cookie.match(/(?:^|; )nm-theme=(light|dark)/),t=m?m[1]:localStorage.getItem('nm-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [nonce, banner] = await Promise.all([
    headers().then((h) => h.get('x-nonce') ?? undefined),
    getBanner().catch(() => null),
  ]);
  const bannerScript = banner ? bannerHeadScript(bannerKey(banner)) : '';
  return (
    <html
      lang="fr"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
      // Read at runtime (not at build) by the Turnstile widget.
      data-turnstile-mode={process.env.TURNSTILE_MODE === 'live' ? 'live' : 'mock'}
      data-turnstile-sitekey={process.env.TURNSTILE_SITE_KEY || undefined}
      suppressHydrationWarning
    >
      <head>
        {/* html-safe: constant theme script; the banner key is JSON.stringify'd (bannerHeadScript); nonce of the CSP. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript + bannerScript }} />
      </head>
      <body>
        {children}
        <HydrationMarker />
        <Suspense fallback={null}>
          <NavMarker />
        </Suspense>
      </body>
    </html>
  );
}
