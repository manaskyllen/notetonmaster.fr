export type Frequency = 'off' | 'day' | 'week' | 'month';

export const FREQUENCIES: {
  value: Frequency;
  label: string;
  cron: string | null;
  scheduleLabel: string;
}[] = [
  { value: 'day', label: 'Quotidienne', cron: '0 4 * * *', scheduleLabel: 'Quotidienne · 04:00' },
  { value: 'week', label: 'Hebdomadaire', cron: '0 3 * * 1', scheduleLabel: 'Hebdo · lun. 03:00' },
  { value: 'month', label: 'Mensuelle', cron: '0 5 1 * *', scheduleLabel: 'Mensuelle' },
  { value: 'off', label: 'Désactivée', cron: null, scheduleLabel: 'Désactivée' },
];

/** Classifies a cron expression into the admin frequency choices. */
export function frequencyOf(enabled: boolean, cron: string | null): Frequency {
  if (!enabled || !cron) return 'off';
  const [, , dom, , dow] = cron.split(/\s+/);
  if (dow && dow !== '*') return 'week';
  if (dom && dom !== '*') return 'month';
  return 'day';
}
