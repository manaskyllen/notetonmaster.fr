/**
 * Outgoing requests of the collector and of « Importer un livret »: never towards an internal
 * address (SSRF).
 *
 * - The URL: https only (http when allowed: CRAWLER_ALLOW_HTTP=true), never a literal internal
 *   address, never a single-label name (`db`, `app`, `localhost`…), never credentials in the URL.
 * - The connection: the name is resolved once, every resolved address must be public, and the
 *   socket connects to that checked address (undici `connect.lookup`): a DNS answer cannot change
 *   between the check and the connection (rebinding). Checked again at every redirection, since
 *   each hop is a new request through `safeFetch`.
 * - No cookie is ever sent (undici fetch has no cookie jar), no TLS check is relaxed.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciInit } from 'undici';

type Resolved = { address: string; family: number };
export type Lookup = (host: string) => Promise<Resolved[]>;

/** IPv4 as a 32-bit number. */
function v4(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // « this » network
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

function v4Public(ip: string): boolean {
  const n = v4(ip);
  if (n === null) return false;
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (v4(base)! & mask) >>> 0;
  });
}

/** IPv6 expanded to 8 groups of 16 bits, or null. */
function v6Groups(ip: string): number[] | null {
  let s = ip
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]!;
  const tail4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail4) {
    const n = v4(tail4[1]!);
    if (n === null) return null;
    s = s.slice(0, -tail4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail, ...rest] = s.split('::');
  if (rest.length) return null;
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  if (fill < 0) return null;
  const g = [...h, ...Array<string>(fill).fill('0'), ...t];
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return g.map((x) => parseInt(x, 16));
}

function v6Public(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible: judged as IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const ip4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
    return v4Public(ip4);
  }
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (first === 0x0064 && g[1] === 0xff9b) return false; // NAT64 (may reach IPv4 internals)
  if (first === 0x2002) return false; // 6to4 (embeds an IPv4)
  return true;
}

/** True for a routable public unicast address (IPv4 or IPv6). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip.replace(/^\[|\]$/g, '').split('%')[0]!);
  if (family === 4) return v4Public(ip);
  if (family === 6) return v6Public(ip);
  return false;
}

export class BlockedUrlError extends Error {}

/**
 * Checks a URL before any request (no DNS here): protocol, credentials, literal addresses
 * (including the integer, octal and hexadecimal IPv4 forms that WHATWG URL normalises), names
 * that only make sense on an internal network.
 */
export function assertFetchableUrl(raw: string, o: { allowHttp: boolean }): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError('adresse invalide');
  }
  if (u.protocol !== 'https:' && !(o.allowHttp && u.protocol === 'http:'))
    throw new BlockedUrlError(o.allowHttp ? 'protocole refusé' : 'https:// uniquement');
  if (u.username || u.password) throw new BlockedUrlError('identifiants dans l’adresse refusés');
  // URL() has already turned 2130706433, 0x7f.1 or 0177.0.0.1 into dotted IPv4.
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedUrlError('adresse interne refusée');
  } else if (
    !host.includes('.') ||
    host === 'localhost' ||
    /\.(localhost|local|internal|lan|home|intranet|corp|localdomain)$/.test(host)
  )
    throw new BlockedUrlError('adresse interne refusée');
  return u;
}

/** Resolves every address of a host; refuses the host when any of them is not public. */
async function resolvePublic(host: string, lookup: Lookup): Promise<Resolved> {
  const all = await lookup(host);
  if (!all.length) throw new BlockedUrlError('nom introuvable');
  const bad = all.find((a) => !isPublicAddress(a.address));
  if (bad) throw new BlockedUrlError(`adresse interne refusée (${host})`);
  return all[0]!;
}

const systemLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Agent whose sockets only ever connect to the checked public address. */
function guardedAgent(lookup: Lookup) {
  return new Agent({
    connect: {
      lookup: (hostname, _opts, cb) => {
        resolvePublic(hostname, lookup).then(
          (r) => cb(null, [{ address: r.address, family: r.family }] as never),
          (e: Error) => cb(e, '' as never, 0 as never),
        );
      },
    },
  });
}

const defaultAgent = guardedAgent(systemLookup);

/**
 * fetch() for the collector: the URL is checked, then the connection goes to a public address
 * only. Redirections are never followed here (`redirect: 'manual'` in the callers): each hop is a
 * new, checked call.
 */
export async function safeFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  o: { lookup?: Lookup; allowHttp?: boolean } = {},
): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const u = assertFetchableUrl(url, { allowHttp: o.allowHttp ?? allowHttpFromEnv() });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const lookup = o.lookup ?? systemLookup;
  // Checked before connecting (clear error), and again by the agent at connection time.
  if (!isIP(host)) await resolvePublic(host, lookup);
  const res = await undiciFetch(u, {
    ...(init as UndiciInit),
    redirect: 'manual',
    credentials: 'omit',
    dispatcher: o.lookup ? guardedAgent(lookup) : defaultAgent,
  } as UndiciInit);
  return res as unknown as Response;
}

export function allowHttpFromEnv(): boolean {
  return process.env.CRAWLER_ALLOW_HTTP === 'true';
}
