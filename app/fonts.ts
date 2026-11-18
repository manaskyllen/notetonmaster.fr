import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';

// Self-hosted at build time by next/font: no request to Google at runtime.
// Latin subset, `swap`: the metric-adjusted fallback shows at once, the font replaces
// it without layout shift; next/font preloads the files.
export const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--nf-display',
  display: 'swap',
});

export const fontSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--nf-sans',
  display: 'swap',
});

// Codes and identifiers only (a few places, mostly in the admin): not preloaded, so that it never
// competes with the text of the page for the first paint.
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--nf-mono',
  display: 'swap',
  preload: false,
});
