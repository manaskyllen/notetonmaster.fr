/**
 * Polite HTTP client shared by every real connector.
 *
 * - explicit User-Agent, robots.txt (RFC 9309) read and cached 24 h per host, TDMRep honoured;
 * - one request at a time per host, at most one every 2 s (or Crawl-delay);
 * - 429/503: Retry-After then exponential back-off; after 3 failures the host is paused 24 h;
 * - 30 s timeout, size limits, accepted content types, at most 5 redirects and never outside the
 *   allowed domains of the source. No JavaScript, no login, no form.
 * - Open-data exception, kept as narrow as possible: the distribution URLs a producer publishes as
 *   official resources of a dataset under Licence Ouverte (declared per source as URL patterns)
 *   are not checked against robots.txt. The exception is logged on every request it covers.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { crawlerContactEmail } from '@/lib/contact';
import { isAllowed, robotsForStatus, type Robots } from './robots';
import { isReservedByFile, isReservedByHeader, parseTdmRep, type TdmRule } from './tdm';
import { allowHttpFromEnv, assertFetchableUrl, BlockedUrlError, safeFetch } from './net-guard';

export const DAY_MS = 24 * 3600_000;

export interface HostState {
  host: string;
  robotsTxt: string | null;
  robotsStatus: number | null;
  robotsSha256: string | null;
  robotsFetchedAt: Date | null;
  tdmrep: TdmRule[] | null;
  failures: number;
  pausedUntil: Date | null;
  pausedReason: string | null;
}

/** Persistence of the per-host state (CrawlHost table in production, memory in tests). */
export interface HostStore {
  get(host: string): Promise<HostState | null>;
  save(host: string, patch: Partial<HostState>): Promise<void>;
}

export class MemoryHostStore implements HostStore {
  data = new Map<string, HostState>();
  async get(host: string) {
    return this.data.get(host) ?? null;
  }
  async save(host: string, patch: Partial<HostState>) {
    const cur = this.data.get(host) ?? {
      host,
      robotsTxt: null,
      robotsStatus: null,
      robotsSha256: null,
      robotsFetchedAt: null,
      tdmrep: null,
      failures: 0,
      pausedUntil: null,
      pausedReason: null,
    };
    this.data.set(host, { ...cur, ...patch, host });
  }
}

export type HttpEvent =
  | { type: 'skip'; url: string; reason: string }
  | { type: 'open-data-exception'; url: string }
  | { type: 'robots-changed'; host: string; previous: string | null; current: string }
  | { type: 'retry'; url: string; status: number | null; waitMs: number; attempt: number }
  | { type: 'host-paused'; host: string; reason: string; until: Date };

export type Accept = 'html' | 'pdf' | 'xml' | 'csv' | 'json' | 'zip' | 'text';
const MIME: Record<Accept, RegExp> = {
  html: /^(text\/html|application\/xhtml\+xml)/i,
  pdf: /^application\/pdf/i,
  xml: /^(application|text)\/([\w.+-]+\+)?xml/i,
  csv: /^(text\/csv|application\/csv|text\/plain|application\/vnd\.ms-excel)/i,
  json: /^application\/([\w.+-]+\+)?json/i,
  zip: /^application\/(zip|x-zip-compressed|octet-stream)/i,
  text: /^text\/plain/i,
};

export interface HttpClientOptions {
  userAgent: string;
  /** Domains (and their subdomains) this source may visit. */
  allowedDomains: string[];
  /** URL patterns covered by the open-data exception (robots.txt not applied, TDMRep still is). */
  openDataExceptions?: RegExp[];
  /** Hosts never visited even if inside an allowed domain (test hosts). */
  deniedHosts?: RegExp[];
  minDelayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  store?: HostStore;
  /** Defaults to `safeFetch` (public addresses only, lib/data/net-guard.ts). */
  fetchImpl?: typeof fetch;
  /** Plain http allowed (else https only). Default: CRAWLER_ALLOW_HTTP=true. */
  allowHttp?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: (e: HttpEvent) => void | Promise<void>;
}

export interface RequestOptions {
  accept?: Accept[];
  maxBytes?: number;
  etag?: string | null;
  lastModified?: string | null;
  /** Stream the body to this file instead of memory (large archives). */
  toFile?: string;
  timeoutMs?: number;
  /** Skip the TDMRep check (only for robots.txt / tdmrep.json themselves). */
  raw?: boolean;
}

export type HttpResult =
  | { kind: 'skip'; url: string; reason: string }
  | { kind: 'not-modified'; url: string; status: 304; headers: Headers }
  | {
      kind: 'response';
      url: string;
      status: number;
      headers: Headers;
      contentType: string | null;
      etag: string | null;
      lastModified: string | null;
      body: Buffer | null; // null when written to a file
      file: string | null;
      bytes: number;
      sha256: string;
    };

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export const MB = 1024 * 1024;

export class PoliteHttpClient {
  private readonly o: Required<
    Omit<HttpClientOptions, 'onEvent' | 'openDataExceptions' | 'deniedHosts'>
  > &
    Pick<HttpClientOptions, 'onEvent'> & { openDataExceptions: RegExp[]; deniedHosts: RegExp[] };
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly lastAt = new Map<string, number>();
  private readonly robots = new Map<string, { robots: Robots; at: number }>();

  constructor(opts: HttpClientOptions) {
    this.o = {
      userAgent: opts.userAgent,
      allowedDomains: opts.allowedDomains,
      minDelayMs: opts.minDelayMs ?? 2000,
      timeoutMs: opts.timeoutMs ?? 30_000,
      maxRetries: opts.maxRetries ?? 3,
      store: opts.store ?? new MemoryHostStore(),
      fetchImpl:
        opts.fetchImpl ??
        (((u: string, i?: RequestInit) =>
          safeFetch(u, i, { allowHttp: opts.allowHttp ?? allowHttpFromEnv() })) as typeof fetch),
      allowHttp: opts.allowHttp ?? allowHttpFromEnv(),
      now: opts.now ?? (() => Date.now()),
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      openDataExceptions: opts.openDataExceptions ?? [],
      deniedHosts: opts.deniedHosts ?? [],
      onEvent: opts.onEvent,
    };
  }

  get userAgent() {
    return this.o.userAgent;
  }

  /** True when the host belongs to an allowed domain and is not denied. */
  hostAllowed(host: string): boolean {
    const h = host.toLowerCase();
    if (this.o.deniedHosts.some((re) => re.test(h))) return false;
    return this.o.allowedDomains.some((d) => h === d || h.endsWith(`.${d}`));
  }

  private isOpenData(url: string) {
    return this.o.openDataExceptions.some((re) => re.test(url));
  }

  private async emit(e: HttpEvent) {
    await this.o.onEvent?.(e);
  }

  /** Runs `fn` alone for this host, at least `delay` after the previous request. */
  private async onHost<T>(host: string, fn: () => Promise<T>, crawlDelayS?: number): Promise<T> {
    const prev = this.queues.get(host) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(async () => {
        const delay = Math.max(this.o.minDelayMs, (crawlDelayS ?? 0) * 1000);
        const last = this.lastAt.get(host);
        if (last != null) {
          const wait = last + delay - this.o.now();
          if (wait > 0) await this.o.sleep(wait);
        }
        try {
          return await fn();
        } finally {
          this.lastAt.set(host, this.o.now());
        }
      });
    this.queues.set(host, run);
    return run;
  }

  /** robots.txt of a host, cached 24 h in memory and in the store; a change raises an event. */
  async robotsFor(origin: URL): Promise<Robots> {
    const host = origin.host;
    const mem = this.robots.get(host);
    if (mem && this.o.now() - mem.at < DAY_MS) return mem.robots;
    const state = await this.o.store.get(host);
    if (
      state?.robotsFetchedAt &&
      state.robotsStatus != null &&
      this.o.now() - state.robotsFetchedAt.getTime() < DAY_MS
    ) {
      const robots = robotsForStatus(state.robotsStatus, state.robotsTxt ?? '');
      this.robots.set(host, { robots, at: state.robotsFetchedAt.getTime() });
      return robots;
    }
    let status = 0;
    let text = '';
    try {
      const r = await this.onHost(host, () =>
        this.fetchFollowing(new URL('/robots.txt', origin).toString(), {}, true),
      );
      status = r.status;
      text = r.status >= 200 && r.status < 300 ? (r.body?.toString('utf8') ?? '') : '';
    } catch {
      status = 503; // unreachable: assume complete disallow (RFC 9309 §2.3.1.4)
    }
    const robots = robotsForStatus(status, text);
    const sha = createHash('sha256').update(`${status}\n${text}`).digest('hex');
    if (state?.robotsSha256 && state.robotsSha256 !== sha)
      await this.emit({ type: 'robots-changed', host, previous: state.robotsTxt, current: text });
    await this.o.store.save(host, {
      robotsTxt: text,
      robotsStatus: status,
      robotsSha256: sha,
      robotsFetchedAt: new Date(this.o.now()),
    });
    this.robots.set(host, { robots, at: this.o.now() });
    return robots;
  }

  private async tdmFor(origin: URL): Promise<TdmRule[]> {
    const state = await this.o.store.get(origin.host);
    if (
      state?.tdmrep &&
      state.robotsFetchedAt &&
      this.o.now() - state.robotsFetchedAt.getTime() < DAY_MS
    )
      return state.tdmrep;
    let rules: TdmRule[] = [];
    try {
      const r = await this.onHost(origin.host, () =>
        this.fetchFollowing(new URL('/.well-known/tdmrep.json', origin).toString(), {}, true),
      );
      if (r.status === 200 && r.body) rules = parseTdmRep(r.body.toString('utf8'));
    } catch {
      rules = [];
    }
    await this.o.store.save(origin.host, { tdmrep: rules });
    return rules;
  }

  /**
   * Checks what may be fetched: allowed domain, host not paused, robots.txt (unless covered by
   * the open-data exception), TDMRep. Returns a skip reason, or null when the URL may be fetched.
   */
  async check(url: string): Promise<{ reason: string } | { crawlDelay?: number }> {
    let u: URL;
    try {
      // No internal address, https only unless allowed (SSRF: lib/data/net-guard.ts).
      u = assertFetchableUrl(url, { allowHttp: this.o.allowHttp });
    } catch (e) {
      return { reason: (e as Error).message };
    }
    if (!this.hostAllowed(u.host)) return { reason: `domaine hors liste blanche (${u.host})` };
    const state = await this.o.store.get(u.host);
    if (state?.pausedUntil && state.pausedUntil.getTime() > this.o.now())
      return {
        reason: `hôte en pause jusqu'au ${state.pausedUntil.toISOString()} (${state.pausedReason ?? ''})`,
      };
    let crawlDelay: number | undefined;
    if (this.isOpenData(url)) {
      await this.emit({ type: 'open-data-exception', url });
    } else {
      const verdict = isAllowed(await this.robotsFor(u), this.o.userAgent, u.pathname + u.search);
      if (!verdict.allowed)
        return {
          reason: `robots.txt : ${verdict.rule ? `Disallow ${verdict.rule.pattern}` : 'collecte interdite'}`,
        };
      crawlDelay = verdict.crawlDelay;
    }
    const tdm = await this.tdmFor(u);
    if (isReservedByFile(tdm, u.pathname)) return { reason: 'réservé par tdmrep.json (TDMRep)' };
    return { crawlDelay };
  }

  /** GET with every politeness rule. Never throws for a skip; throws HttpError after retries. */
  async get(url: string, opts: RequestOptions = {}): Promise<HttpResult> {
    const verdict = await this.check(url);
    if ('reason' in verdict) {
      await this.emit({ type: 'skip', url, reason: verdict.reason });
      return { kind: 'skip', url, reason: verdict.reason };
    }
    const host = new URL(url).host;
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const r = await this.onHost(
          host,
          () => this.fetchFollowing(url, opts, false),
          verdict.crawlDelay,
        );
        if (r.status === 429 || r.status === 503) throw new RetryableError(r.status, r.headers);
        if (!opts.raw && isReservedByHeader(r.headers)) {
          if (r.file) await rm(r.file, { force: true });
          const reason = 'réservé par l’en-tête tdm-reservation';
          await this.emit({ type: 'skip', url, reason });
          return { kind: 'skip', url, reason };
        }
        await this.o.store.save(host, { failures: 0 });
        if (r.status === 304)
          return { kind: 'not-modified', url: r.url, status: 304, headers: r.headers };
        return r;
      } catch (err) {
        if (
          err instanceof HttpError &&
          !(err instanceof RetryableError) &&
          err.status !== null &&
          err.status < 500
        )
          throw err; // refused content type, size, redirect: not a host failure
        const status = err instanceof RetryableError ? err.status : null;
        const state = await this.o.store.get(host);
        const failures = (state?.failures ?? 0) + 1;
        await this.o.store.save(host, { failures });
        if (attempt >= this.o.maxRetries) {
          const until = new Date(this.o.now() + DAY_MS);
          const reason = `${this.o.maxRetries} échecs de suite (${status ?? (err as Error).message})`;
          await this.o.store.save(host, { pausedUntil: until, pausedReason: reason, failures: 0 });
          await this.emit({ type: 'host-paused', host, reason, until });
          throw new HttpError(`Hôte ${host} mis en pause 24 h : ${reason}`, status);
        }
        const retryAfter =
          err instanceof RetryableError ? parseRetryAfter(err.headers, this.o.now()) : null;
        const waitMs = Math.max(retryAfter ?? 0, 2 ** attempt * 1000);
        await this.emit({ type: 'retry', url, status, waitMs, attempt });
        await this.o.sleep(waitMs);
      }
    }
  }

  /** Fetches one URL following at most 5 redirects, all inside the allowed domains. */
  private async fetchFollowing(
    url: string,
    opts: RequestOptions,
    raw: boolean,
  ): Promise<Extract<HttpResult, { kind: 'response' }>> {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      // Every hop is checked again: a redirection may point anywhere.
      try {
        assertFetchableUrl(current, { allowHttp: this.o.allowHttp });
      } catch (e) {
        if (e instanceof BlockedUrlError)
          throw new HttpError(`Adresse refusée : ${e.message}`, 400);
        throw e;
      }
      const headers: Record<string, string> = {
        'user-agent': this.o.userAgent,
        accept: raw ? '*/*' : acceptHeader(opts.accept),
      };
      if (opts.etag) headers['if-none-match'] = opts.etag;
      if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;
      const res = await this.o.fetchImpl(current, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.o.timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        const loc = res.headers.get('location');
        await res.body?.cancel();
        if (!loc) throw new HttpError(`Redirection sans destination (${res.status})`, res.status);
        const next = new URL(loc, current);
        if (!this.hostAllowed(next.host))
          throw new HttpError(`Redirection hors des domaines autorisés : ${next.host}`, 400);
        current = next.toString();
        continue;
      }
      return this.readBody(current, res, raw ? {} : opts);
    }
    throw new HttpError('Plus de 5 redirections', 400);
  }

  private async readBody(url: string, res: Response, opts: RequestOptions) {
    const contentType = res.headers.get('content-type');
    const base = {
      kind: 'response' as const,
      url,
      status: res.status,
      headers: res.headers,
      contentType,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    };
    if (res.status === 304 || res.status >= 400 || !res.body) {
      await res.body?.cancel();
      return {
        ...base,
        body: res.status >= 400 ? Buffer.alloc(0) : null,
        file: null,
        bytes: 0,
        sha256: '',
      };
    }
    if (opts.accept?.length && contentType && !opts.accept.some((a) => MIME[a].test(contentType))) {
      await res.body.cancel();
      throw new HttpError(`Type de contenu refusé : ${contentType}`, 415);
    }
    const max = opts.maxBytes ?? 25 * MB;
    const declared = Number(res.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > max) {
      await res.body.cancel();
      throw new HttpError(`Fichier trop gros (${declared} octets, maximum ${max})`, 413);
    }
    const hash = createHash('sha256');
    let bytes = 0;
    const reader = res.body.getReader();
    if (opts.toFile) {
      await mkdir(dirname(opts.toFile), { recursive: true });
      const tmp = `${opts.toFile}.part`;
      const out = createWriteStream(tmp);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > max) throw new HttpError(`Fichier trop gros (plus de ${max} octets)`, 413);
          hash.update(value);
          if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
        }
        await new Promise<void>((resolve, reject) => {
          out.once('error', reject);
          out.end(() => resolve());
        });
        await rename(tmp, opts.toFile);
      } catch (e) {
        out.destroy();
        await rm(tmp, { force: true });
        await reader.cancel().catch(() => undefined);
        throw e;
      }
      return { ...base, body: null, file: opts.toFile, bytes, sha256: hash.digest('hex') };
    }
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new HttpError(`Fichier trop gros (plus de ${max} octets)`, 413);
      }
      hash.update(value);
      chunks.push(value);
    }
    return { ...base, body: Buffer.concat(chunks), file: null, bytes, sha256: hash.digest('hex') };
  }
}

class RetryableError extends HttpError {
  constructor(
    status: number,
    readonly headers: Headers,
  ) {
    super(`HTTP ${status}`, status);
  }
}

function acceptHeader(accept?: Accept[]) {
  if (!accept?.length) return '*/*';
  const map: Record<Accept, string> = {
    html: 'text/html,application/xhtml+xml',
    pdf: 'application/pdf',
    xml: 'application/xml,text/xml',
    csv: 'text/csv',
    json: 'application/json',
    zip: 'application/zip',
    text: 'text/plain',
  };
  return `${accept.map((a) => map[a]).join(',')};q=1.0,*/*;q=0.1`;
}

/** Retry-After in seconds or as an HTTP date; null when absent or invalid. */
export function parseRetryAfter(headers: Headers, now: number): number | null {
  const v = headers.get('retry-after');
  if (!v) return null;
  if (/^\d+$/.test(v.trim())) return Number(v) * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/**
 * User-Agent of the robot: notetonmasterBot/1.0 (+<CRAWLER_INFO_URL>; <contact>), the contact
 * being CRAWLER_CONTACT_EMAIL, else CONTACT_EMAIL (lib/contact.ts). Shown as is on
 * /a-propos#notre-robot.
 */
export function crawlerUserAgent() {
  const info = process.env.CRAWLER_INFO_URL ?? 'https://notetonmaster.example/a-propos#notre-robot';
  return `notetonmasterBot/1.0 (+${info}; ${crawlerContactEmail()})`;
}

/** URL patterns of the open-data exception, shared by the connectors. */
export const OPEN_DATA_PATTERNS = {
  /**
   * data.gouv.fr (decision of 14/11/2026): only the RNCP export file of France compétences,
   * whose URL is read in the resource list of the dataset (robots.txt forbids /resources).
   */
  rncpExport:
    /^https:\/\/static\.data\.gouv\.fr\/resources\/repertoire-national-des-certifications-professionnelles-et-repertoire-specifique\/\d{8}-\d{6}\/export-fiches-rncp-v4-1-\d{4}-\d{2}-\d{2}\.zip$/,
  /** ESR portal (Opendatasoft): dataset metadata and full exports, as published on data.gouv.fr. */
  esr: (dataset: string) =>
    new RegExp(
      `^https://data\\.enseignementsup-recherche\\.gouv\\.fr/api/explore/v2\\.1/catalog/datasets/${dataset.replace(/[-_]/g, '[-_]')}(?:/exports/(?:csv|json)(?:\\?.*)?)?(?:\\?.*)?$`,
    ),
};
