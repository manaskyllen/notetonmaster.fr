import { cache } from 'react';
import { prisma } from '@/lib/db';
import { SETTINGS_DEFAULTS, type SettingKey, type SettingValue } from './settings-defaults';

export { SETTINGS_DEFAULTS };

/** All settings for this request, merged over the defaults. */
export const getSettings = cache(async () => {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as { [K in SettingKey]: SettingValue<K> };
});

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await getSettings())[key];
}
