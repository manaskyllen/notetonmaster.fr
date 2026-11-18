/**
 * Client IP behind Cloudflare. Pure functions, tested: no request object.
 *
 * Cloudflare's published ranges (https://www.cloudflare.com/ips/), kept here as a cached copy:
 * no network call at runtime. Update them with the list Cloudflare publishes when it changes.
 */
export const CLOUDFLARE_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const;

/** An IP address as a big integer and its family, or null when it does not parse. */
function parseIp(ip: string): { v: 4 | 6; n: bigint } | null {
  const s = ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const parts = s.split('.').map(Number);
    if (parts.some((p) => p > 255)) return null;
    return { v: 4, n: parts.reduce((acc, p) => (acc << 8n) + BigInt(p), 0n) };
  }
  if (!s.includes(':') || !/^[0-9a-f:]+$/i.test(s)) return null;
  const [head, tail, ...rest] = s.split('::');
  if (rest.length) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  if (tail === undefined ? h.length !== 8 : missing < 1) return null;
  const groups = [...h, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...t];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return { v: 6, n: groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n) };
}

/** True when `ip` is inside the CIDR range (IPv4 or IPv6). */
export function inRange(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const a = parseIp(ip);
  const b = parseIp(base ?? '');
  if (!a || !b || a.v !== b.v) return false;
  const width = a.v === 4 ? 32 : 128;
  const bits = Number(bitsRaw ?? width);
  const shift = BigInt(width - bits);
  return a.n >> shift === b.n >> shift;
}

export function isCloudflareIp(ip: string): boolean {
  return CLOUDFLARE_RANGES.some((r) => inRange(ip, r));
}

/**
 * Visitor IP, as written by our own reverse proxy.
 *
 * Production: Caddy is the only exposed service and runs without `trusted_proxies`, so it
 * *replaces* X-Forwarded-For with the real client address. The hop to read is therefore the one
 * added by the last `TRUSTED_PROXY_HOPS` proxies (1 by default: the last element); every hop in
 * front of it may have been written by the client and is ignored.
 *
 * If a CDN is ever put in front of Caddy, configure `trusted_proxies` in Caddy (with the CDN
 * ranges) and review this reading: TRUST_CLOUDFLARE below, or a higher TRUSTED_PROXY_HOPS.
 *
 * With TRUST_CLOUDFLARE: CF-Connecting-IP, but only when the request reached us from a
 * Cloudflare address (the hop written by our proxy); otherwise the header could be forged by
 * anyone hitting the origin directly.
 */
export function resolveClientIp(
  h: { get(name: string): string | null },
  trustCloudflare: boolean,
  hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1),
): string {
  const xff = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const n = Number.isInteger(hops) && hops >= 1 ? hops : 1;
  const peer = xff.at(-n) ?? h.get('x-real-ip')?.trim() ?? '';
  if (trustCloudflare) {
    const cf = h.get('cf-connecting-ip')?.trim();
    if (cf && peer && isCloudflareIp(peer) && parseIp(cf)) return cf;
  }
  return parseIp(peer) ? peer : 'unknown';
}
