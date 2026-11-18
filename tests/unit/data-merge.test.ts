import { describe, expect, it } from 'vitest';
import { buildDiff, diffCsv } from '@/lib/data/diff';
import { decideMerge } from '@/lib/data/merge';
import { evidenceExtract, looksLikePersonNames, scrubPii } from '@/lib/data/pii';
import { compareColumns } from '@/lib/data/schema-check';

const cur = (
  value: unknown,
  sourceKey: string | null,
  extra: Partial<{ locked: boolean; state: string }> = {},
) => ({
  value,
  sourceKey,
  source: sourceKey ?? 'manuel',
  state: extra.state ?? 'OK',
  locked: extra.locked ?? false,
});
const inc = (value: unknown, sourceKey: string) => ({ value, sourceKey, source: sourceKey });

describe('field merge', () => {
  it('never overwrites a locked field', () => {
    expect(
      decideMerge('capacity', cur(24, 'manual', { locked: true }), inc(22, 'monmaster-opendata'))
        .outcome,
    ).toBe('locked');
  });
  it('creates, updates from the same source, keeps unchanged values', () => {
    expect(decideMerge('capacity', null, inc(22, 'monmaster-opendata')).outcome).toBe('create');
    expect(
      decideMerge('capacity', cur(20, 'monmaster-opendata'), inc(22, 'monmaster-opendata')).outcome,
    ).toBe('update');
    expect(
      decideMerge('capacity', cur(22, 'monmaster-opendata'), inc(22, 'monmaster-opendata')).outcome,
    ).toBe('unchanged');
  });
  it('a stronger source wins, a weaker one only fills an empty field', () => {
    expect(
      decideMerge(
        'component',
        cur('UFR Histoire', 'monmaster-opendata'),
        inc('UFR Histoire', 'univ-sites'),
      ).outcome,
    ).toBe('update');
    expect(
      decideMerge('title', cur('Titre A', 'monmaster-opendata'), inc('Titre A', 'univ-sites'))
        .outcome,
    ).toBe('unchanged');
    expect(
      decideMerge('title', cur(null, 'monmaster-opendata'), inc('Titre B', 'univ-sites')),
    ).toEqual({ outcome: 'update', value: 'Titre B' });
  });
  it('opens a conflict when two sources disagree on the component (VNP case)', () => {
    const d = decideMerge(
      'component',
      cur('Faculté des Langues et cultures étrangères (FLCE)', 'monmaster-opendata'),
      inc('UFR Histoire, histoire de l’art et archéologie', 'univ-sites'),
    );
    expect(d.outcome).toBe('conflict');
    expect(d.value).toBe('UFR Histoire, histoire de l’art et archéologie'); // univ-sites has priority
  });
  it('only warns when one word differs in a title', () => {
    const d = decideMerge(
      'title',
      cur('Musées, bibliothèques, archives', 'monmaster-opendata'),
      inc('Musées, bibliothèques et archives', 'univ-sites'),
    );
    expect(d.outcome).toBe('unchanged');
    expect(d.warning).toBeTruthy();
  });
});

describe('personal data filter', () => {
  it('removes e-mails, phones and names after a role', () => {
    const r = scrubPii(
      'Responsable du parcours : Marie DUPONT\nSecrétariat pédagogique : Jean-Luc Martin\nTél. : 02 61 91 10 10\nsecretariat.master@exemple.fr\nSélection : dossier et entretien',
    );
    expect(r.text).not.toMatch(/DUPONT|Martin|02 61|@/);
    expect(r.text).toContain('Responsable du parcours');
    expect(r.text).toContain('Secrétariat pédagogique');
    expect(r.text).toContain('Sélection : dossier et entretien');
    expect(r.removed).toBeGreaterThanOrEqual(4);
  });
  it('catches obfuscated mails and +33 numbers', () => {
    expect(
      scrubPii('contact : prenom.nom [at] univ-reims [dot] fr, +33 (0)3 26 91 30 00').text,
    ).not.toMatch(/univ-reims|26 91/);
  });
  it('tells names from ordinary words', () => {
    expect(looksLikePersonNames('M. DURAND et Mme Petit')).toBe(true);
    expect(looksLikePersonNames('dossier et entretien')).toBe(false);
  });
  it('keeps evidence short', () => {
    expect(evidenceExtract('a '.repeat(400)).length).toBeLessThanOrEqual(300);
  });
});

describe('schema check and difference report', () => {
  it('blocks on a missing required column, warns on a new one', () => {
    const d = compareColumns(
      [{ name: 'ifc', required: true }, { name: 'col', required: true }, { name: 'pct_x' }],
      ['﻿ifc', 'col', 'attendus'],
    );
    expect(d.missingRequired).toEqual([]);
    expect(d.missingOptional).toEqual(['pct_x']);
    expect(d.added).toEqual(['attendus']);
    expect(compareColumns([{ name: 'col', required: true }], ['ifc']).missingRequired).toEqual([
      'col',
    ]);
  });
  it('aggregates plans and exports a CSV', () => {
    const plans = [
      {
        recordKey: 'a',
        plan: {
          action: 'create' as const,
          target: { type: 'program', id: null, label: 'A' },
          changes: [],
        },
      },
      {
        recordKey: 'b',
        plan: {
          action: 'update' as const,
          target: { type: 'program', id: 'p1', label: 'B' },
          changes: [
            {
              entityType: 'PROGRAM' as const,
              entityId: 'p1',
              field: 'capacity',
              label: 'Places',
              from: 20,
              to: 22,
              source: 'Mon Master',
              outcome: 'update' as const,
            },
          ],
        },
      },
      {
        recordKey: 'c',
        plan: {
          action: 'unchanged' as const,
          target: { type: 'program', id: 'p2', label: 'C' },
          changes: [],
        },
      },
    ];
    const d = buildDiff(plans);
    expect(d.byAction.create).toBe(1);
    expect(d.byAction.update).toBe(1);
    expect(d.changeRatio).toBeCloseTo(2 / 3);
    expect(d.fields.changed).toBe(1);
    const csv = diffCsv(plans);
    expect(csv.split('\r\n')).toHaveLength(3); // header + a + b (c is unchanged)
    expect(csv).toContain('b;update;B;program;Places;20;22;update;Mon Master');
  });
});
