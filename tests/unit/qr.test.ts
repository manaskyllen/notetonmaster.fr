import { inflateSync } from 'node:zlib';
import jsQR from 'jsqr';
import { describe, expect, it, vi } from 'vitest';
import {
  isBot,
  isInternalPath,
  isPrefetch,
  isValidSlug,
  parisDay,
  proposeSlug,
  targetFor,
  targetKindOf,
} from '@/lib/domain/qr';

vi.mock('server-only', () => ({}));
const { qrMatrix, qrPng, qrSvg, QR_MARGIN } = await import('@/lib/qr/render');

/** Short links of the QR codes (issue #17). */
describe('slug', () => {
  it('is 3 to 32 characters among a-z, 0-9 and « - »', () => {
    expect(isValidSlug('sous-bock-vert')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
    expect(isValidSlug('Sous-bock')).toBe(false);
    expect(isValidSlug('sous_bock')).toBe(false);
    expect(isValidSlug('bock vert')).toBe(false);
    expect(isValidSlug('bière')).toBe(false);
  });

  it('is proposed from the label', () => {
    expect(proposeSlug('Sous-bock vert · Nantes')).toBe('sous-bock-vert-nantes');
    expect(proposeSlug('Affiche « Bar du Coin », Strasbourg')).toBe(
      'affiche-bar-du-coin-strasbourg',
    );
    expect(proposeSlug('A')).toBe('qr-a');
    expect(proposeSlug('')).toBe('qr-lien');
    const long = proposeSlug('Sous-bock vert du bar de la place du marché à Nantes');
    expect(isValidSlug(long)).toBe(true);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('target', () => {
  it('accepts the internal paths', () => {
    for (const p of ['/', '/avis/nouveau', '/masters/nantes', '/explorer?ville=nantes#a'])
      expect(isInternalPath(p), p).toBe(true);
  });

  it('refuses another site, a scheme, « \\ », spaces and /q/ itself', () => {
    for (const p of [
      'https://exemple.fr',
      'http://exemple.fr/',
      '//exemple.fr',
      '///exemple.fr',
      '/\\exemple.fr',
      '\\\\exemple.fr',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,x',
      'mailto:a@b.fr',
      'exemple.fr',
      '',
      '/\t/exemple.fr',
      '/\n/exemple.fr',
      '/ /exemple.fr',
      `/${String.fromCharCode(0x2028)}/exemple.fr`,
      '/q/autre-lien',
      '/q',
      `/${'a'.repeat(300)}`,
    ])
      expect(isInternalPath(p), JSON.stringify(p)).toBe(false);
    expect(isInternalPath(42)).toBe(false);
    expect(isInternalPath(null)).toBe(false);
  });

  it('round-trips the choices of the admin', () => {
    expect(targetFor('home')).toBe('/');
    expect(targetFor('avis')).toBe('/avis/nouveau');
    expect(targetFor('ville', 'nantes')).toBe('/masters/nantes');
    expect(targetFor('path', ' /explorer ')).toBe('/explorer');
    expect(targetKindOf('/masters/nantes')).toEqual({ kind: 'ville', value: 'nantes' });
    expect(targetKindOf('/avis/nouveau')).toEqual({ kind: 'avis', value: '' });
    expect(targetKindOf('/explorer')).toEqual({ kind: 'path', value: '/explorer' });
  });
});

describe('what is not counted', () => {
  it('robots and link previews, from the user agent', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.23.20.0',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'TelegramBot (like TwitterBot)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'curl/8.5.0',
      'python-requests/2.31',
      '',
      null,
    ])
      expect(isBot(ua), String(ua)).toBe(true);
  });

  it('people, including the in-app browsers', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
    ])
      expect(isBot(ua), ua).toBe(false);
  });

  it('prefetches and prerenders', () => {
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    expect(isPrefetch(h({ 'sec-purpose': 'prefetch' }))).toBe(true);
    expect(isPrefetch(h({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true);
    expect(isPrefetch(h({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetch(h({ 'x-moz': 'prefetch' }))).toBe(true);
    expect(isPrefetch(h({}))).toBe(false);
  });
});

describe('day of a scan', () => {
  it('is the day in Paris', () => {
    // 23:30 UTC on 24 November is already 25 November in Paris.
    expect(parisDay(new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-25');
    expect(parisDay(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
  });
});

/** Reads a code from a module matrix drawn at 8 px a module, as a phone would. */
function decodeMatrix(m: boolean[][]) {
  const scale = 8;
  const size = (m.length + 2 * QR_MARGIN) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.floor(y / scale) - QR_MARGIN;
      const c = Math.floor(x / scale) - QR_MARGIN;
      if (m[r]?.[c]) px.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  return jsQR(px, size, size)?.data ?? null;
}

describe('QR code', () => {
  const url = 'https://notetonmaster.fr/q/sous-bock-vert-nantes';

  it('encodes the short address', () => {
    expect(decodeMatrix(qrMatrix(url))).toBe(url);
  });

  it('SVG: the same modules, with a quiet zone of 4 modules', () => {
    const svg = qrSvg(url, { title: url });
    const n = qrMatrix(url).length;
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);
    expect(svg).toContain(`<title>${url}</title>`);
    // Every run starts inside the margin.
    const starts = [...svg.matchAll(/M(\d+) (\d+)h/g)].map((x) => [Number(x[1]), Number(x[2])]);
    expect(Math.min(...starts.map((s) => s[0]!))).toBe(QR_MARGIN);
    expect(Math.min(...starts.map((s) => s[1]!))).toBe(QR_MARGIN);
    // Back to a matrix from the path, then read.
    const back = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
    for (const x of svg.matchAll(/M(\d+) (\d+)h(\d+)/g))
      for (let k = 0; k < Number(x[3]); k++)
        back[Number(x[2]) - QR_MARGIN]![Number(x[1]) - QR_MARGIN + k] = true;
    expect(decodeMatrix(back)).toBe(url);
  });

  it('PNG: a valid greyscale image that scans', () => {
    const png = qrPng(url, 8);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const size = png.readUInt32BE(16);
    const idatLen = png.readUInt32BE(33);
    expect(png.toString('ascii', 37, 41)).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    const px = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = raw[y * (size + 1) + 1 + x]!;
        px.set([v, v, v, 255], (y * size + x) * 4);
      }
    expect(jsQR(px, size, size)?.data).toBe(url);
  });
});
