import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Playwright reaches the dev server through the "web" network alias.
  allowedDevOrigins: ['web'],
  reactStrictMode: true,
  // Title, description and canonical always in the <head> of the first bytes, for every visitor:
  // by default Next.js streams them into the <body> except for a list of bots, and Googlebot is
  // not in it (docs/seo/audit.md). The fiches wait for their data before the shell anyway.
  htmlLimitedBots: /.*/,
  // The trailing slash is removed by proxy.ts with a 301 (same rule as the case and the host).
  skipTrailingSlashRedirect: true,
  // Native / Node-only packages that must not be bundled.
  serverExternalPackages: ['@node-rs/argon2'],
  // 1 MB for every Server Action; the proof of study (10 MB) has its own route
  // (app/api/espace/justificatif).
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  async redirects() {
    return [
      // City renamed: « Montbéliar » → « Montbéliard » (migration city_index).
      { source: '/masters/montbeliar', destination: '/masters/montbeliard', statusCode: 301 },
      {
        source: '/masters/montbeliar/:path*',
        destination: '/masters/montbeliard/:path*',
        statusCode: 301,
      },
    ];
  },
  async headers() {
    const https = (process.env.APP_URL ?? '').startsWith('https://');
    // Pages of a link that carries a token in its address: no Referer at all.
    const tokenPages = [
      '/connexion/lien/:path*',
      '/avis/confirmer/:path*',
      '/reponse/:path*',
      '/admin/invitation/:path*',
    ];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          // HSTS is sent here, by the application, over HTTPS only: one year, sub-domains, no
          // preload. The reverse proxy (Caddy) must not add its own (docs/deploiement.md).
          ...(https
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
      // Open Graph images are shown by other sites (link previews).
      {
        source: '/og/:path*',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }],
      },
      ...tokenPages.map((source) => ({
        source,
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      })),
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    '/**': ['./content/**/*'],
    // Share images (lib/brand/og-fonts.ts reads the fonts at run time, which tracing cannot see):
    // without them, every /og/… image of the standalone build answered 500.
    '/og/**': [
      './node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff',
      './node_modules/@fontsource/inter/files/inter-latin-600-normal.woff',
    ],
  },
};

export default nextConfig;
