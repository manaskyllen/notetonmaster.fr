/**
 * Connector registry. CONNECTORS_MODE=mock (default in dev, tests and CI) replays fixtures and
 * never touches the network; CONNECTORS_MODE=live uses the real connectors. A source without a
 * real connector yet is skipped in live mode (never silently mocked).
 */
import { MOCK_CONNECTORS } from './mocks';
import type { AnyConnector, SourceKey } from './types';

/** Real connectors, filled milestone by milestone. */
const LIVE_CONNECTORS: Partial<Record<SourceKey, () => Promise<AnyConnector>>> = {
  'esr-etablissements': async () => (await import('./esr-etablissements')).connector,
  'monmaster-opendata': async () => (await import('./monmaster-opendata')).connector,
  rncp: async () => (await import('./rncp')).connector,
  'monmaster-fiches': async () => (await import('./monmaster-fiches')).connector,
  'univ-sites': async () => (await import('./univ-sites')).loadConnector(),
};

export type ConnectorsMode = 'mock' | 'live';

export function connectorsMode(): ConnectorsMode {
  const m = process.env.CONNECTORS_MODE ?? 'mock';
  if (m !== 'mock' && m !== 'live')
    throw new Error(`CONNECTORS_MODE inconnu : ${m} (mock ou live)`);
  return m;
}

/**
 * Connector for a run. CONNECTORS_MODE only concerns collection: a run resumed at match, merge,
 * quality or publish (« Recalculer », « Appliquer ») works on the staging of a simulation, makes no
 * network request, and always uses the real pipeline code.
 */
export async function getConnector(
  key: string,
  resumeFromStep?: string | null,
): Promise<AnyConnector | null> {
  const offline = !!resumeFromStep && OFFLINE_STEPS.includes(resumeFromStep);
  if (connectorsMode() === 'mock' && !offline) return MOCK_CONNECTORS[key as SourceKey] ?? null;
  const load = LIVE_CONNECTORS[key as SourceKey];
  return load ? load() : null;
}

/** Steps that only read snapshots already downloaded, the staging and the database (no network). */
export const OFFLINE_STEPS = ['parse', 'match', 'merge', 'quality', 'publish'];
