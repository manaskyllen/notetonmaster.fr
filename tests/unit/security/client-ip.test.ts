/**
 * The visitor IP is the one written by our own proxy (Caddy, which replaces X-Forwarded-For with
 * the real client address): the last hop, never a value the client could choose.
 */
import { describe, expect, it } from 'vitest';
import { resolveClientIp } from '@/lib/ip';

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe('client IP behind our proxy (TRUSTED_PROXY_HOPS)', () => {
  it('ignores the hops a client puts in front of the one written by the proxy', () => {
    // The client sent « X-Forwarded-For: 1.2.3.4 »; a proxy that appends keeps it in front.
    const forged = headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' });
    expect(resolveClientIp(forged, false, 1)).toBe('198.51.100.9');
  });

  it('reads the hop added by the n-th trusted proxy', () => {
    const twoProxies = headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9, 10.0.0.2' });
    expect(resolveClientIp(twoProxies, false, 2)).toBe('198.51.100.9');
  });

  it('a value that is not an IP address counts as unknown', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': 'evil' }), false, 1)).toBe('unknown');
    expect(resolveClientIp(headers({}), false, 1)).toBe('unknown');
  });

  it('a different forged hop at each request does not give a different IP', () => {
    const seen = new Set(
      ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((f) =>
        resolveClientIp(headers({ 'x-forwarded-for': `${f}, 198.51.100.9` }), false, 1),
      ),
    );
    expect([...seen]).toEqual(['198.51.100.9']);
  });

  it('TRUSTED_PROXY_HOPS is read from the environment (1 by default)', () => {
    const h = headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' });
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(resolveClientIp(h, false)).toBe('198.51.100.9');
  });
});
