import { describe, expect, it } from 'vitest';
import {
  bannerKey,
  bannerShownOn,
  bannerStatus,
  parisDay,
  toParisDay,
  type BannerData,
} from '@/lib/domain/banner';
import { bannerSchema } from '@/lib/domain/banner-schema';

const NOW = new Date('2026-11-16T10:00:00Z');
const b = (o: Partial<BannerData> = {}): BannerData => ({
  id: 'b1',
  message: 'Bonjour',
  linkLabel: null,
  linkUrl: null,
  tone: 'INFO',
  scope: 'ALL',
  startsAt: '2026-11-14T00:00:00Z',
  endsAt: null,
  dismissible: true,
  active: true,
  updatedAt: '2026-11-14T09:00:00Z',
  ...o,
});

describe('visibility', () => {
  it('active, started, not ended', () => {
    expect(bannerShownOn(b(), '/explorer', NOW)).toBe(true);
    expect(bannerShownOn(b({ active: false }), '/explorer', NOW)).toBe(false);
    expect(bannerShownOn(b({ startsAt: '2026-11-20T00:00:00Z' }), '/', NOW)).toBe(false);
    expect(bannerShownOn(b({ endsAt: '2026-11-15T00:00:00Z' }), '/', NOW)).toBe(false);
    expect(bannerShownOn(b({ endsAt: '2026-11-30T00:00:00Z' }), '/', NOW)).toBe(true);
  });
  it('scope: everywhere public, or the home page only', () => {
    expect(bannerShownOn(b({ scope: 'HOME' }), '/', NOW)).toBe(true);
    expect(bannerShownOn(b({ scope: 'HOME' }), '/explorer', NOW)).toBe(false);
  });
  it('never on the review form, the login or the admin', () => {
    for (const p of [
      '/avis/nouveau',
      '/connexion',
      '/connexion/lien/abc',
      '/admin',
      '/admin/parametres',
    ])
      expect(bannerShownOn(b(), p, NOW)).toBe(false);
    expect(bannerShownOn(b(), '/avis/confirmer/x', NOW)).toBe(true);
  });
  it('status of the preview', () => {
    expect(bannerStatus(b(), NOW)).toBe('En ligne');
    expect(bannerStatus(b({ startsAt: '2026-12-01T00:00:00Z' }), NOW)).toBe('Programmé');
    expect(bannerStatus(b({ endsAt: '2026-11-15T00:00:00Z' }), NOW)).toBe('Terminé');
    expect(bannerStatus(b({ active: false }), NOW)).toBe('Masqué');
  });
  it('a new message gets a new dismissal key', () => {
    expect(bannerKey(b())).toBe(`banner:b1:${Date.parse('2026-11-14T09:00:00Z')}`);
    expect(bannerKey(b({ updatedAt: '2026-11-16T09:00:00Z' }))).not.toBe(bannerKey(b()));
  });
});

const form = (o: Record<string, unknown> = {}) => ({
  active: true,
  tone: 'INFO',
  message: 'Nouvelle session ouverte',
  linkLabel: 'En savoir plus',
  linkUrl: '/a-propos',
  startsAt: '2026-11-14',
  endsAt: '',
  scope: 'ALL',
  dismissible: true,
  ...o,
});
const errors = (o: Record<string, unknown>) => {
  const r = bannerSchema.safeParse(form(o));
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('validation', () => {
  it('accepts an internal path or an https address, or no link', () => {
    expect(errors({})).toEqual([]);
    expect(errors({ linkUrl: 'https://www.monmaster.gouv.fr/' })).toEqual([]);
    expect(errors({ linkLabel: '', linkUrl: '' })).toEqual([]);
  });
  it('a link text without address (and the reverse) is refused', () => {
    expect(errors({ linkUrl: '' })).toEqual([
      'linkUrl: Le lien doit avoir un texte et une adresse, ou rester vide.',
    ]);
    expect(errors({ linkLabel: '' })).toEqual([
      'linkLabel: Le lien doit avoir un texte et une adresse, ou rester vide.',
    ]);
  });
  it('an address that is not https or internal is refused', () => {
    for (const u of ['http://exemple.fr', 'javascript:alert(1)', '//evil.example', 'exemple.fr'])
      expect(errors({ linkUrl: u })).toEqual([
        'linkUrl: Adresse interne commençant par / ou adresse https://.',
      ]);
  });
  it('end before start, message required or too long, HTML', () => {
    expect(errors({ endsAt: '2026-11-01' })).toEqual([
      'endsAt: La date de fin doit suivre la date de début.',
    ]);
    expect(errors({ message: '  ' })).toEqual(['message: Le message est requis.']);
    expect(errors({ message: 'x'.repeat(161) })).toEqual(['message: 160 caractères au maximum.']);
    expect(errors({ message: 'x'.repeat(160) })).toEqual([]);
    expect(errors({ message: 'Un <b>message</b>' })).toEqual([
      'message: Texte simple seulement, sans balise.',
    ]);
  });
});

describe('Paris days', () => {
  it('start and end of a day in Paris, winter and summer', () => {
    expect(parisDay('2026-11-14').toISOString()).toBe('2026-11-13T23:00:00.000Z');
    expect(parisDay('2026-07-14', true).toISOString()).toBe('2026-07-14T21:59:59.000Z');
    expect(toParisDay(new Date('2026-11-13T23:30:00Z'))).toBe('2026-11-14');
  });
});
