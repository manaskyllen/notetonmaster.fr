/** Lightening of November 2026: no trace of the removed features in the code (migrations apart). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (p.includes('generated')) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css)$/.test(p) ? [p] : [];
  });
}

/**
 * The removed features, by name. « Calendrier » is the removed component (its tag, import or
 * declaration): the word itself is a theme of the guides (« Calendrier Mon Master »).
 */
const TRACES: [string, RegExp][] = [
  ['Wish', /Wish/],
  ['PhaseReminder', /PhaseReminder/],
  ['maplibre', /maplibre/],
  [
    'Calendrier',
    /<Calendrier\b|\{\s*Calendrier\b|(?:function|const|class) Calendrier\b|\/Calendrier['"]/,
  ],
  ['ListeVoeux', /ListeVoeux/],
];

describe('no trace', () => {
  it('of Wish, PhaseReminder, maplibre, Calendrier, ListeVoeux in app/, components/ and lib/', () => {
    const hits = ['app', 'components', 'lib']
      .flatMap((d) => files(join(process.cwd(), d)))
      .flatMap((f) => {
        const text = readFileSync(f, 'utf8');
        return TRACES.filter(([, re]) => re.test(text)).map(
          ([w]) => `${f.replace(process.cwd(), '')}: ${w}`,
        );
      });
    expect(hits).toEqual([]);
  });

  it('no reminder is scheduled by the worker any more', () => {
    const worker = ['index.ts', 'schedule.ts']
      .map((f) => readFileSync(join(process.cwd(), 'worker', f), 'utf8'))
      .join('\n');
    expect(worker).not.toMatch(/PhaseReminder|phaseReminder|dailyPhaseReminders/);
  });
});
