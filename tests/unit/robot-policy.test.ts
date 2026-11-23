import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cadenceLabel,
  CRAWLER_NAME,
  cronCadence,
  effectiveMinDelaySeconds,
  MIN_DELAY_FLOOR_SECONDS,
  ROBOTS_EXCLUSION,
} from '@/lib/data/robot-policy';
import { crawlerUserAgent } from '@/lib/data/http';
import { SETTINGS_DEFAULTS } from '@/lib/settings-defaults';

/** The values shown on /a-propos#notre-robot are those the robot applies. */
describe('robot policy', () => {
  it('reads the rhythm of a cron expression', () => {
    expect(cronCadence('0 1 * * *')).toBe('night');
    expect(cronCadence('25 3 * * *')).toBe('night');
    expect(cronCadence('0 9 * * *')).toBe('day');
    expect(cronCadence('10 3 * * 1')).toBe('week');
    expect(cronCadence('40 2 1 * *')).toBe('month');
    expect(cronCadence('*/15 * * * *')).toBeNull();
    expect(cronCadence('0 3 1 1 *')).toBeNull();
    expect(cronCadence(null)).toBeNull();
    expect(cronCadence('nonsense')).toBeNull();
  });

  it('labels a group of sources, from the most to the least frequent', () => {
    expect(cadenceLabel(['10 3 * * 1'])).toBe('Chaque semaine');
    expect(cadenceLabel(['40 2 1 * *', '10 3 * * 1', '10 3 * * 2'])).toBe(
      'Chaque semaine ou chaque mois',
    );
    expect(cadenceLabel([null, undefined])).toBeNull();
  });

  it('gives the frequencies of the seeded sources', () => {
    const { sources } = JSON.parse(readFileSync('prisma/fixtures/sources.json', 'utf8')) as {
      sources: { key: string; schedule: string | null }[];
    };
    const of = (...keys: string[]) =>
      cadenceLabel(sources.filter((s) => keys.includes(s.key)).map((s) => s.schedule));
    expect(of('univ-sites')).toBe('Chaque nuit');
    expect(of('rncp')).toBe('Chaque nuit');
    expect(of('monmaster-fiches')).toBe('Chaque semaine');
    expect(of('monmaster-opendata', 'esr-etablissements', 'insersup', 'sise-diplomes')).toBe(
      'Chaque semaine ou chaque mois',
    );
  });

  it('never waits less than the floor between two requests', () => {
    expect(effectiveMinDelaySeconds(0)).toBe(MIN_DELAY_FLOOR_SECONDS);
    expect(effectiveMinDelaySeconds(SETTINGS_DEFAULTS['collect.minDelaySeconds'])).toBe(5);
  });

  it('excludes with the name it announces', () => {
    expect(crawlerUserAgent().startsWith(`${CRAWLER_NAME}/`)).toBe(true);
    expect(ROBOTS_EXCLUSION).toBe(`User-agent: ${CRAWLER_NAME}\nDisallow: /`);
  });
});
