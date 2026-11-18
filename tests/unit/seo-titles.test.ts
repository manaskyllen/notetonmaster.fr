/** Titles and descriptions of the public pages (lib/seo/titles.ts). */
import { describe, expect, it } from 'vitest';
import { DESCRIPTION, TITLE } from '@/lib/seo/rules';
import {
  cityDescription,
  cityIntro,
  cityMentionTitle,
  cityTitle,
  cutName,
  cutWords,
  deMention,
  mentionDescription,
  mentionTitle,
  pagedSeoTitle,
  parcoursDescription,
  parcoursTitle,
  plainTitle,
  universityTitle,
} from '@/lib/seo/titles';

const base = {
  title: 'Valorisation des nouveaux patrimoines',
  mention: 'Culture, patrimoine et médiation',
  universityName: 'Nantes Université',
  universityShort: null,
  city: 'Nantes',
  qualifier: null,
  reviewCount: 12,
  avgRating: 4.12,
  hasProgramme: true,
  hasAdmission: true,
};
function within(s: string, l: { min: number; max: number }) {
  expect(s.length, s).toBeGreaterThanOrEqual(l.min);
  expect(s.length, s).toBeLessThanOrEqual(l.max);
}

describe('fiche parcours', () => {
  it('« Master {Parcours} – {Université} ({Ville}) : avis et programme », shortened to fit', () => {
    // 60 characters aimed at: the full form when it fits, then without « et programme »…
    expect(parcoursTitle({ ...base, title: 'Droit', universityName: 'Université de Nantes' })).toBe(
      'Master Droit – Université de Nantes : avis | notetonmaster',
    );
    expect(parcoursTitle({ ...base, title: 'Droit', universityName: 'Lyon 2', city: 'Lyon' })).toBe(
      'Master Droit – Lyon 2 : avis et programme | notetonmaster',
    );
    expect(parcoursTitle({ ...base, title: 'Droit public' })).toBe(
      'Master Droit public – Nantes Université | notetonmaster',
    );
    // the university already names the city: no « (Nantes) »; too long → shorter forms
    // 81 characters with the university: the whole name and the city rather than a cut name
    expect(parcoursTitle(base)).toBe(
      'Master Valorisation des nouveaux patrimoines – Nantes | notetonmaster',
    );
    expect(
      parcoursTitle({
        ...base,
        title: 'Chimie',
        universityName: 'Université de Haute-Alsace',
        city: 'Mulhouse',
      }),
    ).toBe('Master Chimie – Univ. Haute-Alsace (Mulhouse) : avis | notetonmaster');
  });
  it('uses the short name of the university, then cuts the parcours name on a word', () => {
    const t = parcoursTitle({
      ...base,
      title: 'Histoire de l’art et culture matérielle - de l’Antiquité à nos jours',
      universityName: 'Institut national des sciences appliquées de Lyon',
      universityShort: 'INSA de Lyon',
      city: 'Villeurbanne',
    });
    expect(t.length).toBeLessThanOrEqual(TITLE.max);
    // nothing with the university keeps 70 % of the name: the name, then the city
    expect(t).toBe('Master Histoire de l’art et…à nos jours – Villeurbanne | notetonmaster');
  });
  it('a qualifier keeps homonyms apart, in the title and the description', () => {
    const a = {
      ...base,
      title: 'Algorithmique',
      universityName: 'Université de Montpellier',
      city: 'Montpellier',
    };
    expect(parcoursTitle({ ...a, qualifier: 'alternance' })).toBe(
      'Master Algorithmique (alternance) – Univ. Montpellier | notetonmaster',
    );
    const d1 = parcoursDescription({
      ...a,
      reviewCount: 0,
      avgRating: null,
      qualifier: 'Mon Master 1502890BRJQ7',
    });
    const d2 = parcoursDescription({
      ...a,
      reviewCount: 0,
      avgRating: null,
      qualifier: 'Mon Master 1502890BW51J',
    });
    expect(d1).not.toBe(d2);
    expect(d1).toContain('Master Algorithmique (Mon Master 1502890BRJQ7).');
  });
  it('two long names: the parcours name wins over the university', () => {
    const t = parcoursTitle({
      ...base,
      title: 'Archéologie des Gaules romaines et de la Méditerranée occidentale',
      universityName: 'Université de Montpellier Paul-Valéry',
      city: 'Montpellier',
    });
    expect(t.length).toBeLessThanOrEqual(TITLE.max);
    expect(t).toBe('Master Archéologie des…occidentale – Montpellier | notetonmaster');
  });
  it('description with reviews: the rating and the count, then what the page has', () => {
    const d = parcoursDescription(base);
    // the university stays (homonyms of one city); the sentence after it gets shorter first
    expect(d).toBe(
      'Master Valorisation des nouveaux patrimoines (Nantes Université) : 4,1/5 sur 12 avis d’étudiant·es. Programme, admission et parcours similaires à Nantes.',
    );
    expect(parcoursDescription({ ...base, title: 'Droit' })).toBe(
      'Master Droit (Nantes Université) : 4,1/5 sur 12 avis d’étudiant·es. Programme semestre par semestre, admission et parcours similaires à Nantes.',
    );
    within(d, DESCRIPTION);
  });
  it('description without reviews: never claims a programme it does not have', () => {
    const d = parcoursDescription({
      ...base,
      reviewCount: 0,
      avgRating: null,
      hasProgramme: false,
    });
    expect(d).not.toMatch(/Programme/);
    expect(d).toMatch(
      /Admission(, origine des admis)? et parcours similaires à Nantes\. Sois le ou la premier·e à donner ton avis\.$/,
    );
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION.max);
  });
});

describe('mention, university, city', () => {
  it('mention: « Master {Mention} : {n} parcours à {villes} »', () => {
    expect(mentionTitle({ name: 'Droit', programs: 48, cities: ['Nantes', 'Strasbourg'] })).toBe(
      'Master Droit : 48 parcours à Nantes et Strasbourg | notetonmaster',
    );
    const long = mentionTitle({
      name: 'Métiers de l’enseignement, de l’éducation et de la formation (MEEF), 2nd degré',
      programs: 120,
      cities: ['Nantes', 'Strasbourg', 'Mulhouse', 'Lyon'],
    });
    expect(long.length).toBeLessThanOrEqual(TITLE.max);
    expect(
      mentionDescription({
        name: 'Droit',
        programs: 48,
        universities: 3,
        reviews: 0,
        cities: ['Nantes'],
      }),
    ).toBe(
      'Les 48 parcours du master Droit à Nantes, proposés par 3 établissements publics : programmes, admission et les avis d’étudiant·es.',
    );
  });
  it('university: « Masters à {Université} : {n} parcours et avis »', () => {
    expect(universityTitle({ name: 'Nantes Université', shortName: null, programs: 160 })).toBe(
      'Masters à Nantes Université : 160 parcours et avis | notetonmaster',
    );
  });
  it('city: « Masters à {Ville} : {n} parcours, avis d’étudiant·es » within 70', () => {
    expect(cityTitle({ name: 'Nantes', programs: 160 })).toBe(
      'Masters à Nantes : 160 parcours, avis d’étudiant·es | notetonmaster',
    );
    expect(cityTitle({ name: 'Strasbourg', programs: 213 })).toBe(
      'Masters à Strasbourg : 213 parcours et avis | notetonmaster',
    );
    expect(cityIntro({ programs: 213, universities: 3, reviews: 39 })).toBe(
      '213 parcours dans 3 établissements publics, 39 avis d’étudiant·es',
    );
    within(
      cityDescription({
        name: 'Strasbourg',
        programs: 213,
        universities: 3,
        reviews: 39,
        topMentions: ['Droit', 'Chimie', 'Physique'],
      }),
      DESCRIPTION,
    );
  });
  it('city × mention: « Masters de droit à Nantes », elision and acronyms', () => {
    expect(deMention('Droit')).toBe('de droit');
    expect(deMention('Informatique')).toBe('d’informatique');
    expect(deMention('Histoire')).toBe('d’histoire');
    expect(deMention('MIAGE')).toBe('de MIAGE');
    expect(cityMentionTitle({ city: 'Nantes', mention: 'Droit', programs: 12 })).toBe(
      'Masters de droit à Nantes : 12 parcours et avis | notetonmaster',
    );
  });
});

describe('helpers', () => {
  it('cuts on a word with an ellipsis', () => {
    expect(cutWords('Histoire de l’art et culture matérielle', 20)).toBe('Histoire de l’art…');
    expect(cutWords('Court', 20)).toBe('Court');
  });
  it('pages beyond the first say so, still within the lengths', () => {
    expect(pagedSeoTitle('Explorer les masters | notetonmaster', 2)).toBe(
      'Explorer les masters — page 2 | notetonmaster',
    );
    expect(pagedSeoTitle('X | notetonmaster', 1)).toBe('X | notetonmaster');
    expect(plainTitle('Mentions légales')).toBe('Mentions légales | notetonmaster');
  });
});

describe('homonyms (lib/catalog/homonyms.ts)', async () => {
  const { pickQualifier } = await import('@/lib/catalog/homonyms');
  const row = (
    id: string,
    o: Partial<{
      modality: string;
      entryLevel: string;
      campus: string | null;
      mmCode: string | null;
    }> = {},
  ) => ({
    programId: id,
    modality: 'ONSITE',
    entryLevel: 'M1',
    campus: 'UFR Sciences, Montpellier',
    mmCode: `MM${id}`,
    ...o,
  });
  it('no homonym: nothing, or « alternance » for a work-study parcours', () => {
    expect(pickQualifier(row('a'), [row('a')])).toBeNull();
    expect(
      pickQualifier(row('a', { modality: 'WORK_STUDY' }), [row('a', { modality: 'WORK_STUDY' })]),
    ).toBe('alternance');
  });
  it('the first fact of its own: modality, entry, campus, then the Mon Master number', () => {
    expect(pickQualifier(row('a'), [row('a'), row('b', { modality: 'WORK_STUDY' })])).toBeNull();
    const rows = [
      row('a'),
      row('b'),
      row('c', { modality: 'WORK_STUDY' }),
      row('d', { entryLevel: 'M2' }),
    ];
    expect(pickQualifier(rows[2]!, rows)).toBe('alternance');
    expect(pickQualifier(rows[3]!, rows)).toBe('entrée en M2');
    expect(pickQualifier(rows[0]!, rows)).toBe('Mon Master MMa');
    expect(pickQualifier(rows[1]!, rows)).toBe('Mon Master MMb');
  });
});

describe('limits always hold, whatever the names', () => {
  const longs = [
    {
      title: 'Biodiversité : fonctions et conservation (BioFC)',
      qualifier: 'Mon Master 1800844TB2GR',
      universityName: 'Aix-Marseille Université',
      universityShort: null,
      city: 'Marseille',
    },
    {
      title: 'Culture de l’écrit et de l’image',
      qualifier: 'Université Lumière Lyon 2, Lyon',
      universityName:
        'École nationale supérieure des sciences de l’information et des bibliothèques',
      universityShort: null,
      city: 'Villeurbanne',
    },
    {
      title: 'Comptabilité - contrôle - audit',
      qualifier: 'Cnam Intec - Pays de la loire, Nantes',
      universityName: 'Conservatoire national des arts et métiers',
      universityShort: null,
      city: 'Nantes',
    },
    {
      title: 'Accompagnement entrepreneurial : Création, développement, transmission',
      qualifier: 'présentiel',
      universityName: 'Université de Montpellier',
      universityShort: null,
      city: 'Montpellier',
    },
  ];
  it.each(longs)('$title', (x) => {
    for (const rated of [true, false]) {
      const input = {
        ...base,
        ...x,
        reviewCount: rated ? 3 : 0,
        avgRating: rated ? 3.7 : null,
        hasProgramme: false,
      };
      const t = parcoursTitle(input);
      const d = parcoursDescription(input);
      expect(t.length, t).toBeLessThanOrEqual(TITLE.max);
      expect(t.endsWith(' | notetonmaster'), t).toBe(true);
      expect(t, t).toContain(cutName(x.qualifier, 28));
      expect(d.length, d).toBeLessThanOrEqual(DESCRIPTION.max);
      expect(d.length, d).toBeGreaterThanOrEqual(DESCRIPTION.min);
    }
  });
});

describe('near-homonyms keep the words that set them apart', async () => {
  const { distinctWords } = await import('@/lib/catalog/homonyms');
  const { cutKeeping } = await import('@/lib/seo/titles');
  it('« Études arabes » / « Études russes »: arabes survives the cut', () => {
    const t = 'ETUDES ARABES - RELATIONS INTERNATIONALES';
    const keep = distinctWords(t, ['ETUDES RUSSES - RELATIONS INTERNATIONALES']);
    expect(keep).toEqual(['arabes']);
    // another « Études arabes » elsewhere in the city: still the rarest word
    expect(
      distinctWords(t, [
        'ETUDES RUSSES - RELATIONS INTERNATIONALES',
        'Études arabes',
        'Études chinoises - Relations internationales',
      ]),
    ).toEqual(['arabes']);
    expect(cutKeeping(t, 20, keep)).toBe('ETUDES ARABES…');
    const t2 = 'Enseigner les Lettres classiques au CLG et au LGT';
    const k2 = distinctWords(t2, ['Enseigner les Lettres modernes au CLG et au LGT']);
    expect(cutKeeping(t2, 33, k2)).toBe('Enseigner les Lettres classiques…');
    expect(cutKeeping('Court', 20, ['x'])).toBe('Court');
  });
});

describe('pages of a list keep the name', () => {
  it('« — page 2 » takes the place of the long ending, never of the city or the mention', () => {
    const t = cityTitle({ name: 'Nantes', programs: 157, page: 2 });
    expect(t).toBe('Masters à Nantes : 157 parcours et avis — page 2 | notetonmaster');
    const m = mentionTitle({ name: 'Droit', programs: 48, cities: ['Nantes', 'Lyon'], page: 3 });
    expect(m).toContain('Master Droit');
    expect(m).toContain('— page 3 | notetonmaster');
    for (const x of [t, m]) expect(x.length).toBeLessThanOrEqual(TITLE.max);
  });
});
