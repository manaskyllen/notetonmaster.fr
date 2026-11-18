/**
 * TDM Reservation Protocol (W3C community report): `/.well-known/tdmrep.json` and the
 * `tdm-reservation` HTTP header. A reserved resource is not collected.
 */

export interface TdmRule {
  location: string;
  reservation: boolean;
  policy?: string;
}

/** Parses a tdmrep.json body; anything malformed yields no rule (nothing reserved by the file). */
export function parseTdmRep(body: string): TdmRule[] {
  try {
    const data = JSON.parse(body) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        location: String(x.location ?? ''),
        reservation: Number(x['tdm-reservation']) === 1,
        policy: typeof x['tdm-policy'] === 'string' ? x['tdm-policy'] : undefined,
      }))
      .filter((r) => r.location);
  } catch {
    return [];
  }
}

function matches(pattern: string, path: string): number {
  const p = pattern.startsWith('/') ? pattern : `/${pattern}`;
  const anchored = p.endsWith('$');
  const body = anchored ? p.slice(0, -1) : p;
  const re = new RegExp(
    '^' +
      body
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      (anchored ? '$' : ''),
  );
  return re.test(path) ? body.length : -1;
}

/** True when the most specific matching rule of tdmrep.json reserves the path. */
export function isReservedByFile(rules: TdmRule[], path: string): boolean {
  let best: { len: number; rule: TdmRule } | null = null;
  for (const r of rules) {
    const len = matches(r.location, path);
    if (len >= 0 && (!best || len > best.len)) best = { len, rule: r };
  }
  return !!best?.rule.reservation;
}

/** `tdm-reservation: 1` header. */
export function isReservedByHeader(headers: Headers): boolean {
  return headers.get('tdm-reservation')?.trim() === '1';
}

/** `X-Robots-Tag` and `<meta name="robots">`: true when the page asks not to be indexed. */
export function robotsDirectives(
  headers: Headers,
  html?: string,
): { noindex: boolean; nofollow: boolean } {
  const values: string[] = [];
  const header = headers.get('x-robots-tag');
  if (header) values.push(header);
  if (html) {
    for (const m of html.matchAll(
      /<meta\s+[^>]*name\s*=\s*["']?(?:robots|notetonmasterbot)["']?[^>]*>/gi,
    )) {
      const c = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
      if (c) values.push(c[1]!);
    }
  }
  const all = values.join(',').toLowerCase();
  return {
    noindex: /\b(noindex|none)\b/.test(all),
    nofollow: /\b(nofollow|none)\b/.test(all),
  };
}
