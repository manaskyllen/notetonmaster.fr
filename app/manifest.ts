import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'notetonmaster',
    short_name: 'notetonmaster',
    description: 'Compare les masters des universités publiques, parcours par parcours.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f4f8',
    theme_color: '#5a3bf0',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
