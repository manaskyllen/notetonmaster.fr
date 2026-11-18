/**
 * robots.txt (RFC 9309): parsing and matching, pure functions.
 * - groups are selected by our product token (case-insensitive), else "*";
 * - the longest matching rule wins, "allow" wins a tie; "*" and "$" are supported;
 * - 4xx (no robots.txt) allows everything, 5xx or unreachable disallows everything.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
}

export interface Robots {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** "allow-all" when the file is missing (4xx), "disallow-all" when unreachable (5xx). */
  mode?: 'parsed' | 'allow-all' | 'disallow-all';
}

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps, mode: 'parsed' };
}

/** robots.txt as seen for an HTTP status (RFC 9309 §2.3.1). */
export function robotsForStatus(status: number, text: string): Robots {
  if (status >= 200 && status < 300) return parseRobots(text);
  if (status >= 400 && status < 500) return { groups: [], sitemaps: [], mode: 'allow-all' };
  return { groups: [], sitemaps: [], mode: 'disallow-all' };
}

/** "notetonmasterBot/1.0 (+https://…)" → "notetonmasterbot". */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[\/\s]/)[0] ?? '').toLowerCase();
}

function groupsFor(robots: Robots, userAgent: string): RobotsGroup[] {
  const token = productToken(userAgent);
  const mine = robots.groups.filter((g) => g.agents.includes(token));
  if (mine.length) return mine;
  return robots.groups.filter((g) => g.agents.includes('*'));
}

/** Length of the match of a robots pattern against a path, or -1 when it does not match. */
function matchLength(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    '^' +
      body
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      (anchored ? '$' : ''),
  );
  return re.test(path) ? body.length : -1;
}

/** Percent-encodes what robots.txt authors usually write decoded, so both forms compare equal. */
function canonicalPath(p: string): string {
  try {
    return encodeURI(decodeURI(p));
  } catch {
    return p;
  }
}

export interface RobotsVerdict {
  allowed: boolean;
  rule?: RobotsRule;
  crawlDelay?: number;
}

export function isAllowed(robots: Robots, userAgent: string, pathAndQuery: string): RobotsVerdict {
  if (robots.mode === 'allow-all') return { allowed: true };
  if (robots.mode === 'disallow-all') return { allowed: false };
  const path = canonicalPath(pathAndQuery || '/');
  if (path === '/robots.txt') return { allowed: true };
  const groups = groupsFor(robots, userAgent);
  const crawlDelay = groups.find((g) => g.crawlDelay != null)?.crawlDelay;
  let best: { len: number; rule: RobotsRule } | null = null;
  for (const g of groups)
    for (const rule of g.rules) {
      const len = matchLength(canonicalPath(rule.pattern), path);
      if (len < 0) continue;
      if (!best || len > best.len || (len === best.len && rule.allow && !best.rule.allow))
        best = { len, rule };
    }
  return { allowed: best ? best.rule.allow : true, rule: best?.rule, crawlDelay };
}
