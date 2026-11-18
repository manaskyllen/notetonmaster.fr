import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { inRange, isCloudflareIp, resolveClientIp } from '@/lib/ip';
import { TURNSTILE_ERROR, turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { TURNSTILE_MOCK_TOKEN } from '@/lib/turnstile-forms';

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe('client IP behind Cloudflare', () => {
  it('matches IPv4 and IPv6 ranges', () => {
    expect(inRange('104.16.1.2', '104.16.0.0/13')).toBe(true);
    expect(inRange('104.24.0.1', '104.16.0.0/13')).toBe(false);
    expect(inRange('2606:4700:10::6816:1', '2606:4700::/32')).toBe(true);
    expect(inRange('2001:db8::1', '2606:4700::/32')).toBe(false);
    expect(inRange('::ffff:162.158.3.4', '162.158.0.0/15')).toBe(true);
    expect(inRange('not-an-ip', '162.158.0.0/15')).toBe(false);
    expect(isCloudflareIp('172.70.1.1')).toBe(true);
    expect(isCloudflareIp('8.8.8.8')).toBe(false);
  });
  it('reads CF-Connecting-IP only when trusted and coming from Cloudflare', () => {
    const viaCloudflare = headers({
      'x-forwarded-for': '203.0.113.7, 162.158.10.20',
      'cf-connecting-ip': '203.0.113.7',
    });
    expect(resolveClientIp(viaCloudflare, true)).toBe('203.0.113.7');
    // A forged header sent straight to the origin is ignored.
    const forged = headers({ 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '1.2.3.4' });
    expect(resolveClientIp(forged, true)).toBe('198.51.100.9');
    // Without TRUST_CLOUDFLARE: the hop written by our proxy (the last one), here Cloudflare's.
    expect(resolveClientIp(viaCloudflare, false)).toBe('162.158.10.20');
    expect(resolveClientIp(headers({}), true)).toBe('unknown');
  });
});

describe('Turnstile (mock mode)', () => {
  afterAll(() => prisma.$disconnect());
  it('accepts the dummy token and refuses anything else, logging each check', async () => {
    const since = new Date();
    expect(await verifyTurnstile('contact', TURNSTILE_MOCK_TOKEN)).toEqual({ ok: true });
    expect(await verifyTurnstile('contact', 'fail')).toEqual({
      ok: false,
      message: TURNSTILE_ERROR,
    });
    expect(await verifyTurnstile('contact', undefined)).toEqual({
      ok: false,
      message: TURNSTILE_ERROR,
    });
    const logs = await prisma.turnstileLog.findMany({
      where: { form: 'contact', at: { gte: since } },
      orderBy: { at: 'asc' },
    });
    expect(logs.map((l) => l.outcome)).toEqual(['OK', 'FAIL', 'FAIL']);
    expect(logs[2]!.errorCodes).toEqual(['missing-input-response']);
    await prisma.turnstileLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
  });
  it('reads the token from FormData or an object', () => {
    const fd = new FormData();
    fd.set('cf-turnstile-response', 'abc');
    expect(turnstileTokenOf(fd)).toBe('abc');
    expect(turnstileTokenOf({ turnstileToken: 'xyz' })).toBe('xyz');
    expect(turnstileTokenOf(null)).toBeUndefined();
  });
});
