'use client';

import { useSyncExternalStore } from 'react';

/**
 * The city chosen in « Où ? » on the home, shared by the search form and the domain tiles
 * (« Mentions ouvertes à Nantes »). A tiny external store: the sections of the page stay server
 * components, only what follows the city subscribes. `undefined` until the visitor picks one: the
 * server value (`?ville=`) holds until then.
 */
let value: string | null | undefined;
const listeners = new Set<() => void>();

export function setHomeCity(slug: string | null) {
  value = slug;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useHomeCity(initial: string | null): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (value === undefined ? initial : value),
    () => initial,
  );
}
