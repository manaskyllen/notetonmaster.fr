/** The banner link: an internal path or https://, never a path a browser reads as another site. */
import { describe, expect, it } from 'vitest';
import { bannerSchema } from '@/lib/domain/banner';

const banner = (linkUrl: string) => ({
  message: 'Un message de test pour le bandeau.',
  active: true,
  tone: 'INFO',
  linkLabel: 'En savoir plus',
  linkUrl,
  startsAt: '2026-11-18',
  endsAt: '',
  scope: 'ALL',
  dismissible: true,
});

describe('banner link', () => {
  it.each(['/a-propos', '/parcours/x?y=1', 'https://www.onisep.fr/x'])('accepts %s', (u) => {
    expect(bannerSchema.safeParse(banner(u)).success).toBe(true);
  });
  it.each([
    '/\\evil.example',
    '//evil.example',
    'javascript:alert(1)',
    'data:text/html,x',
    'http://x.fr',
    '/\t/evil.example',
  ])('refuses %s', (u) => {
    expect(bannerSchema.safeParse(banner(u)).success).toBe(false);
  });
});
