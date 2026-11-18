'use client';

import { useEffect, useState } from 'react';
import type { SearchType } from '@/lib/domain/search';
import type { SearchResult } from '@/lib/domain/search.server';

export type SearchHit = Omit<SearchResult, 'score'>;

export interface SearchAnswer {
  results: SearchHit[];
  totals: Record<SearchType, number>;
  hiddenPrivate: number;
  /** A known place outside the open cities (« Lyon »), said instead of an empty answer. */
  notYet: { place: string } | null;
}

export interface UseSearchOptions {
  types?: SearchType[];
  limit?: number;
  limits?: Partial<Record<SearchType, number>>;
  /** Debounce before the request. */
  delay?: number;
}

const EMPTY: SearchAnswer = {
  results: [],
  totals: { program: 0, mention: 0, university: 0, city: 0 },
  hiddenPrivate: 0,
  notYet: null,
};

/** Latest answers, kept in memory for the visit: going back to a query shows it at once. */
const memory = new Map<string, SearchAnswer>();
const MEMORY_MAX = 40;
function remember(key: string, a: SearchAnswer) {
  memory.delete(key);
  memory.set(key, a);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

/**
 * The site search (GET /api/search) as you type: 120 ms debounce, each keystroke aborts the
 * previous request, recent answers come from memory. Keeps the previous results until the new
 * ones arrive, so lists do not blink; `query` is the query the results belong to.
 */
export function useSearch(input: string, opts: UseSearchOptions = {}) {
  const { types, limit = 20, limits, delay = 120 } = opts;
  const [state, setState] = useState<{ query: string } & SearchAnswer>({ query: '', ...EMPTY });
  const q = input.trim();
  const typesKey = types?.join(',') ?? '';
  const limitsKey = limits
    ? Object.entries(limits)
        .map(([t, n]) => `${t}:${n}`)
        .join(',')
    : '';

  useEffect(() => {
    if (!q) return;
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (typesKey) params.set('types', typesKey);
    if (limitsKey) params.set('limits', limitsKey);
    const key = params.toString();
    const known = memory.get(key);
    if (known) {
      const id = window.setTimeout(() => setState({ query: q, ...known }), 0);
      return () => window.clearTimeout(id);
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${key}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchAnswer;
        const answer = {
          results: data.results,
          totals: data.totals,
          hiddenPrivate: data.hiddenPrivate,
          notYet: data.notYet ?? null,
        };
        remember(key, answer);
        setState({ query: q, ...answer });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setState({ query: q, ...EMPTY });
      }
    }, delay);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, typesKey, limitsKey, limit, delay]);

  if (!q) return { query: '', ...EMPTY, pending: false };
  return { ...state, pending: state.query !== q };
}
