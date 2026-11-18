/**
 * The collector and « Importer un livret » never reach an internal address: private, loopback,
 * link-local (cloud metadata), CGNAT, IPv6 local ranges, before and after DNS resolution and at
 * every redirection. Plain http only when explicitly allowed.
 */
import { describe, expect, it } from 'vitest';
import { isPublicAddress, safeFetch, assertFetchableUrl } from '@/lib/data/net-guard';
import { PoliteHttpClient } from '@/lib/data/http';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('%s is not public', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(['8.8.8.8', '193.52.1.10', '172.32.0.1', '2001:4860:4860::8888'])('%s is public', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe('assertFetchableUrl', () => {
  it('refuses literal internal addresses and local names', () => {
    for (const u of [
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/',
      'https://db/',
      'https://app:3000/',
      'https://10.0.0.5/',
      'https://2130706433/', // 127.0.0.1 written as an integer
    ])
      expect(() => assertFetchableUrl(u, { allowHttp: false }), u).toThrow();
  });
  it('refuses http unless allowed, and any other protocol', () => {
    expect(() => assertFetchableUrl('http://www.univ-nantes.fr/', { allowHttp: false })).toThrow();
    expect(() =>
      assertFetchableUrl('http://www.univ-nantes.fr/', { allowHttp: true }),
    ).not.toThrow();
    expect(() => assertFetchableUrl('file:///etc/passwd', { allowHttp: true })).toThrow();
    expect(() =>
      assertFetchableUrl('https://www.univ-nantes.fr/', { allowHttp: false }),
    ).not.toThrow();
  });
});

describe('safeFetch', () => {
  it('refuses a name that resolves to an internal address (checked on the resolved IP)', async () => {
    await expect(safeFetch('https://localhost.localdomain/')).rejects.toThrow();
    await expect(
      safeFetch('https://127.0.0.1.nip.io/', {}, { lookup: fakeDns('127.0.0.1') }),
    ).rejects.toThrow(/interne/);
  });
});

describe('PoliteHttpClient', () => {
  const store = undefined;
  const okFetch: typeof fetch = async () =>
    new Response('ok', { headers: { 'content-type': 'text/html' } });

  it('never sends a request to an internal address, even inside its allowed domains', async () => {
    const calls: string[] = [];
    const client = new PoliteHttpClient({
      userAgent: 'test',
      allowedDomains: ['127.0.0.1', 'localhost'],
      store,
      minDelayMs: 0,
      fetchImpl: async (u) => {
        calls.push(String(u));
        return okFetch(u);
      },
    });
    const r = await client
      .get('https://127.0.0.1/robots-or-page')
      .catch((e: Error) => ({ kind: 'error', e }));
    expect(r.kind === 'skip' || r.kind === 'error').toBe(true);
    expect(calls).toEqual([]);
  });

  it('a redirection to an internal address is refused', async () => {
    const client = new PoliteHttpClient({
      userAgent: 'test',
      allowedDomains: ['univ.example', '169.254.169.254'],
      minDelayMs: 0,
      fetchImpl: async (u) =>
        String(u).endsWith('/robots.txt')
          ? new Response('', { status: 404 })
          : String(u).includes('169.254')
            ? new Response('secret', { headers: { 'content-type': 'text/html' } })
            : new Response(null, {
                status: 302,
                headers: { location: 'https://169.254.169.254/latest' },
              }),
    });
    await expect(client.get('https://univ.example/page', { accept: ['html'] })).rejects.toThrow();
  });

  it('http is refused unless allowHttp', async () => {
    const client = new PoliteHttpClient({
      userAgent: 't',
      allowedDomains: ['univ.example'],
      minDelayMs: 0,
      fetchImpl: okFetch,
    });
    const r = await client.get('http://univ.example/x');
    expect(r.kind).toBe('skip');
  });
});

function fakeDns(address: string) {
  return () => Promise.resolve([{ address, family: address.includes(':') ? 6 : 4 }]);
}
