/**
 * Settings stored in the `Setting` table (flat dotted keys), with their defaults.
 * Pure module (no database access) so it can be shared by the seed, the app and tests.
 */

export const NOTIFICATION_EVENTS = [
  { id: 'review.submitted', label: 'Nouvel avis à modérer' },
  { id: 'review.reported', label: 'Avis signalé' },
  { id: 'document.submitted', label: 'Justificatif reçu' },
  { id: 'message.reported', label: 'Message signalé' },
  { id: 'legal.received', label: 'Demande légale reçue' },
  { id: 'contact.received', label: 'Message du formulaire de contact' },
  { id: 'sync.failed', label: 'Échec d’une récupération' },
  { id: 'data.conflict', label: 'Nouveau conflit de données' },
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]['id'];
export type NotificationMatrix = Record<
  NotificationEvent,
  Record<'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL', boolean>
>;

import { TURNSTILE_FORMS, type TurnstileForm } from './turnstile-forms';

export const SETTINGS_DEFAULTS = {
  // Collecte
  'collect.userAgent': 'notetonmasterBot/0.1 (+https://notetonmaster.example/a-propos)',
  'collect.minDelaySeconds': 5,
  // Collecte réelle
  /** Matching: automatic link above `autoLink` (with same UAI, commune and title), proposal from `propose`. */
  'data.matchThresholds': { high: 0.9, autoLink: 0.97, propose: 0.75, duplicate: 0.95 },
  /** Conflict when the university announces a capacity that differs by more than this. */
  'data.capacityGap': 0,
  /** A value older than this becomes STALE (days). */
  'data.staleAfterDays': { annual: 400, univPages: 60 },
  /** An import changing more than this share of a source's records needs a validated preview (%). */
  'data.previewThresholdPercent': 10,
  /** Blocking volume check: rows dropped by at least this share since the previous run (%). */
  'data.volumeDropPercent': 20,
  /** Raw snapshots kept per URL (plus one per Mon Master session). */
  'data.snapshotRetention': 6,
  // Modération
  'moderation.autoPublish': false,
  'moderation.nameDetection': true,
  'moderation.anonymousReviews': true,
  'moderation.documents': true,
  'chat.enabled': true,
  'chat.limitEnabled': true,
  'chat.limitPerDay': 3,
  'moderation.delayHours': 48,
  'moderation.reportThreshold': 3,
  'moderation.watchTerms': ['arnaque', 'escroquerie', 'harcèlement', 'nul'],
  // Cloudflare Turnstile, per form
  'turnstile.forms': Object.fromEntries(TURNSTILE_FORMS.map((f) => [f.id, true])) as Record<
    TurnstileForm,
    boolean
  >,
  // Notifications
  'notifications.matrix': {
    'review.submitted': { ADMIN: false, MODERATOR: true, DATA_EDITOR: false, LEGAL: false },
    'review.reported': { ADMIN: true, MODERATOR: true, DATA_EDITOR: false, LEGAL: false },
    'document.submitted': { ADMIN: false, MODERATOR: true, DATA_EDITOR: false, LEGAL: false },
    'message.reported': { ADMIN: false, MODERATOR: true, DATA_EDITOR: false, LEGAL: false },
    'legal.received': { ADMIN: true, MODERATOR: false, DATA_EDITOR: false, LEGAL: true },
    'contact.received': { ADMIN: true, MODERATOR: true, DATA_EDITOR: false, LEGAL: false },
    'sync.failed': { ADMIN: true, MODERATOR: false, DATA_EDITOR: true, LEGAL: false },
    'data.conflict': { ADMIN: false, MODERATOR: false, DATA_EDITOR: true, LEGAL: false },
  } as NotificationMatrix,
  // Légal & RGPD (the contact address is CONTACT_EMAIL, lib/contact.ts)
  'legal.internalDelayDays': 3,
  'legal.inactiveAccountYears': 3,
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS_DEFAULTS)[K] extends boolean
  ? boolean
  : (typeof SETTINGS_DEFAULTS)[K] extends number
    ? number
    : (typeof SETTINGS_DEFAULTS)[K] extends string
      ? string
      : (typeof SETTINGS_DEFAULTS)[K] extends readonly string[]
        ? string[]
        : (typeof SETTINGS_DEFAULTS)[K];

/** Fixed values shown read-only in the admin (legal obligations). */
export const FIXED_SETTINGS = {
  connectionLogRetention: '1 an (obligation légale, non modifiable)',
  documentRetention: 'Supprimés dès la décision (non modifiable)',
  messageRetentionMonths: 12,
} as const;
