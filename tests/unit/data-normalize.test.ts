import { describe, expect, it } from 'vitest';
import {
  normCity,
  normCode,
  normMention,
  normProgramTitle,
  normText,
  parseMonMasterPlace,
  programAliases,
  similarity,
  splitMonMasterPlaces,
  toFloat,
  toInt,
} from '@/lib/data/normalize';

describe('normText', () => {
  it('unifies apostrophes, dashes, accents, "&" and spaces', () => {
    expect(normText('Histoire de l’art et culture matérielle')).toBe(
      normText("Histoire de l'art et culture materielle"),
    );
    expect(normText('Arts – Lettres & Langues')).toBe('arts lettres et langues');
    expect(normText('  Œuvres   d’art ')).toBe('oeuvres d art');
  });
});

describe('normProgramTitle', () => {
  it('removes prefixes, internal codes and bracketed acronyms (kept as aliases)', () => {
    const a = 'M1 Administration culturelle / Projets Culturels Internationaux (PR1138)';
    const b = 'M1 Administration culturelle / Projets Culturels Internationaux #PR1138';
    const c = 'Administration culturelle / Projets culturels internationaux (ACPCI)';
    expect(normProgramTitle(a)).toBe('administration culturelle projets culturels internationaux');
    expect(normProgramTitle(b)).toBe(normProgramTitle(a));
    expect(normProgramTitle(c)).toBe(normProgramTitle(a));
    expect(programAliases(c)).toEqual(['ACPCI']);
    expect(programAliases(a)).toEqual([]);
  });

  it('handles the EPIC title with its double space and acronym', () => {
    const t = 'Expertise des médiations,  professions et institutions de la culture (EPIC)';
    expect(normProgramTitle(t)).toBe(
      'expertise des mediations professions et institutions de la culture',
    );
    expect(programAliases(t)).toEqual(['EPIC']);
  });

  it('strips "Master", "Parcours", "Mention" prefixes', () => {
    expect(normProgramTitle('Master parcours Valorisation des nouveaux patrimoines (VNP)')).toBe(
      'valorisation des nouveaux patrimoines',
    );
  });
});

describe('normMention', () => {
  it('matches Mon Master upper case and RNCP "(fiche nationale)" titles', () => {
    expect(normMention('CULTURE, PATRIMOINE ET MEDIATION')).toBe(
      normMention('Culture, patrimoine et médiation (fiche nationale)'),
    );
    expect(normMention('Master mention Gestion de patrimoine')).toBe('gestion de patrimoine');
    expect(
      normMention('comptabilite controle audit', { 'comptabilite controle audit': 'cca' }),
    ).toBe('cca');
  });
});

describe('codes and cities', () => {
  it('normalises codes', () => {
    expect(normCode('rncp 42684')).toBe('RNCP42684');
    expect(normCode('2000144-03K')).toBe('200014403K');
  });
  it('normalises city names without INSEE code', () => {
    expect(normCity('TROYES CEDEX 9')).toBe('troyes');
    expect(normCity('St-Étienne')).toBe('saint etienne');
  });
});

describe('Mon Master places', () => {
  it('parses one place', () => {
    expect(parseMonMasterPlace('Campus des Comtes de Champagne - TROYES CEDEX 9 (10)')).toEqual({
      label: 'Campus des Comtes de Champagne',
      commune: 'TROYES',
      department: '10',
    });
    expect(parseMonMasterPlace('Guyancourt - GUYANCOURT (78)')?.commune).toBe('GUYANCOURT');
  });
  it('splits 2025 (|) and 2024 (,) cells without breaking labels that contain commas', () => {
    expect(
      splitMonMasterPlaces(
        'Nantes Université - NANTES (44)|Faculté des Langues et cultures étrangères (FLCE) - NANTES (44)',
      ).map((p) => p.label),
    ).toEqual(['Nantes Université', 'Faculté des Langues et cultures étrangères (FLCE)']);
    expect(
      splitMonMasterPlaces(
        'Nantes Université - NANTES (44),Faculté des Langues et cultures étrangères (FLCE) - NANTES (44)',
      ).length,
    ).toBe(2);
    expect(
      splitMonMasterPlaces('UFR SCIENCES ECONOMIQUES. SOCIALES, ET DE GESTION - REIMS CEDEX (51)'),
    ).toHaveLength(1);
  });
});

describe('similarity and numbers', () => {
  it('scores close titles high and different ones low', () => {
    expect(
      similarity('Musée, bibliothéques, archives', 'Musées, bibliothèques, archives'),
    ).toBeGreaterThan(0.75);
    expect(
      similarity('Histoire de l’art et culture matérielle', 'Droit des affaires'),
    ).toBeLessThan(0.2);
    expect(similarity('abc', 'abc')).toBe(1);
  });
  it('never turns markers into 0', () => {
    expect(toInt('nd')).toBeNull();
    expect(toInt('')).toBeNull();
    expect(toInt('42')).toBe(42);
    expect(toFloat('64,1')).toBe(64.1);
    expect(toFloat('ns')).toBeNull();
  });
});
