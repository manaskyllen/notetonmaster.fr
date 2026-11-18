import type { LogLevel, SyncMode } from '@/lib/db/generated/enums';
import type { RawSnapshot } from '@/lib/db/generated/client';
import type { PoliteHttpClient } from '@/lib/data/http';

export type SourceKey =
  | 'esr-etablissements'
  | 'monmaster-opendata'
  | 'rncp'
  | 'insersup'
  | 'sise-diplomes'
  | 'm2-selectifs'
  | 'onisep-ideo'
  | 'univ-sites'
  | 'monmaster-fiches';

/** Dependency order of « Tout synchroniser ». */
export const SOURCE_ORDER: SourceKey[] = [
  'esr-etablissements',
  'monmaster-opendata',
  'rncp',
  'insersup',
  'sise-diplomes',
  'm2-selectifs',
  'onisep-ideo',
  'univ-sites',
  'monmaster-fiches',
];

export interface RunStats {
  updated: number;
  unchanged: number;
  skippedLocked: number;
  conflicts: number;
  created: number;
}

export interface RunResult {
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  stats: RunStats;
  summary: string;
}

export interface RunContext {
  report: (p: { progress: number; step: string }) => Promise<void>;
  log: (level: LogLevel, msg: string) => Promise<void>;
  /** PREVIEW runs everything but publish. Mocks ignore it. */
  mode?: SyncMode;
}

/**
 * A data source connector. `run` is the simple form (mocks, robots-only checks); real
 * connectors of the national pipeline implement `PipelineConnector` instead.
 */
export interface SourceConnector {
  key: SourceKey;
  run(ctx: RunContext): Promise<RunResult>;
}

/** Steps of a pipeline run, recorded in SyncLog; `resumeFromStep` is one of them. */
export const PIPELINE_STEPS = ['fetch', 'parse', 'match', 'merge', 'quality', 'publish'] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const STEP_LABEL: Record<PipelineStep, string> = {
  fetch: 'Téléchargement (fetch + snapshot)',
  parse: 'Lecture (parse + stage + normalize)',
  match: 'Rapprochement (match)',
  merge: 'Fusion des champs (merge)',
  quality: 'Contrôles (quality)',
  publish: 'Publication (publish)',
};

export interface AlertInput {
  key: string;
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
  link?: string;
  linkLabel?: string;
  entityType?: 'PROGRAM' | 'MENTION' | 'UNIVERSITY';
  entityId?: string;
  count?: number;
}

export interface PipelineContext extends RunContext {
  runId: string;
  sourceKey: SourceKey;
  sourceId: string;
  mode: SyncMode;
  /** Re-run every step even when the source did not change (idempotence checks). */
  force: boolean;
  http: PoliteHttpClient;
  alert: (a: AlertInput) => Promise<void>;
  /** Alerts raised during this run (also summarised in the difference report). */
  alerts: AlertInput[];
}

export type FetchOutcome =
  | { nothingNew: true; reason: string; sourceVersion?: string }
  | { nothingNew: false; sourceVersion: string };

export interface StagedInput {
  recordKey: string;
  payload: Record<string, unknown>;
  normalized?: Record<string, unknown>;
}

export interface QualityOutcome {
  /** A blocking problem: the run stops awaiting a human validation. */
  blocking?: string;
}

export interface PipelineConnector {
  key: SourceKey;
  pipeline: true;
  /** Domains the HTTP client may visit, and URL patterns of the open-data exception. */
  http: { allowedDomains: string[]; openDataExceptions?: RegExp[]; deniedHosts?: RegExp[] };
  /** fetch + snapshot: downloads what changed (RawSnapshot rows linked to the run). */
  fetch(ctx: PipelineContext): Promise<FetchOutcome>;
  /** parse + normalize: records read in stream from the snapshots of the run. */
  parse(ctx: PipelineContext, snapshots: RawSnapshot[]): AsyncIterable<StagedInput>;
  /** match: sets matchStatus / target of the staged records. */
  match(ctx: PipelineContext): Promise<void>;
  /** merge: writes a RecordPlan per staged record. */
  merge(ctx: PipelineContext): Promise<void>;
  /** quality: source-specific checks (volume and preview threshold are generic). */
  quality?(ctx: PipelineContext): Promise<QualityOutcome>;
  /** publish: replays the plans (after re-checking locks) and returns the stats. */
  publish(ctx: PipelineContext): Promise<RunStats>;
}

export type AnyConnector = SourceConnector | PipelineConnector;

export function isPipeline(c: AnyConnector): c is PipelineConnector {
  return (c as PipelineConnector).pipeline === true;
}

export const emptyStats = (): RunStats => ({
  updated: 0,
  unchanged: 0,
  skippedLocked: 0,
  conflicts: 0,
  created: 0,
});
