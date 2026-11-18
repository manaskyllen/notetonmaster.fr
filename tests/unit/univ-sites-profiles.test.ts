/** Profiles of the university sites: starting file, program URLs per template, options. */
import { describe, expect, it } from 'vitest';
import {
  configFromSeed,
  extractOptions,
  isProgramUrl,
  pageLevel,
  profileConfig,
  readSeedProfiles,
} from '@/lib/connectors/univ-sites/profiles';
import { coverage } from '@/lib/connectors/univ-sites';

const ametys = profileConfig.parse({
  template: 'AMETYS_ODF_HTML',
  hosts: ['formation.univ-lille.fr'],
});
const ksup = profileConfig.parse({ template: 'KSUP', hosts: ['www.univ-tours.fr'] });

describe('starting file', () => {
  it('every profile is valid, with at least one host; Disallow sites are blocked', () => {
    const seeds = readSeedProfiles();
    expect(seeds.length).toBe(92);
    for (const s of seeds) expect(() => configFromSeed(s)).not.toThrow();
    const blocked = seeds.filter((s) => s.blocked).map((s) => s.name);
    expect(blocked).toContain('Aix-Marseille Université');
    expect(seeds.filter((s) => s.template === 'AMETYS_ODF_HTML').length).toBeGreaterThanOrEqual(23);
    expect(seeds.filter((s) => s.template === 'KSUP').length).toBeGreaterThanOrEqual(18);
  });
});

describe('program pages', () => {
  it('Ametys: mention or parcours pages, never course units nor other hosts', () => {
    const base = 'https://formation.univ-lille.fr/fr/offre-de-formation/master-lmd-XB';
    expect(
      isProgramUrl(
        ametys,
        `${base}/master-staps-management-du-sport-MG002537/european-master-of-governance-MX129953.html`,
      ),
    ).toBe(true);
    expect(isProgramUrl(ametys, `${base}/master-staps-management-du-sport-MG002537.html`)).toBe(
      true,
    );
    expect(
      isProgramUrl(
        ametys,
        `${base}/master-x-MG002537/parcours-y-MX129953/ue-projets-MI8YDM4T/etudes-de-cas-MLKWUWQD.html`,
      ),
    ).toBe(false);
    expect(isProgramUrl(ametys, `${base}/cursus-master-ingenierie-K1KNZY34.html`)).toBe(false);
    // a mention slug also starts with « master- »: its choice blocks are not parcours (Montpellier)
    expect(
      isProgramUrl(
        ametys,
        `${base}/master-droit-penal-ITJZ790G/master-droit-penal-et-pratiques-penales-IY9VL3A7/choix-bloc-d-options-LU8HE6H1.html`,
      ),
    ).toBe(false);
    expect(
      isProgramUrl(
        ametys,
        'https://formation.univ-lille.fr/fr/catalogue/master-M/master-x-L3VOQ8RU/parcours-y-L3VOQ97D.html',
      ),
    ).toBe(true);
    expect(isProgramUrl(ametys, 'https://www.univ-lille.fr/master-x-MG002537.html')).toBe(false);
    // a lowercase mention code (Montpellier) and a doubled type segment with a unit (Poitiers)
    expect(
      isProgramUrl(
        ametys,
        `${base}/master-mention-histoire-du-droit-hnesblvo/master-histoire-IYJ12345/seminaire-LBQCUO32.html`,
      ),
    ).toBe(false);
    expect(
      isProgramUrl(
        ametys,
        `${base}/master-XB/master-comptabilite-JC94ZX0D/ue2-finance-JCBS3AT9.html`,
      ),
    ).toBe(false);
    expect(isProgramUrl(ametys, `${base}/master-mention-histoire-du-droit-hnesblvo.html`)).toBe(
      true,
    );
    expect(pageLevel(ametys, `${base}/master-x-MG002537/parcours-y-MX129953.html`)).toBe(
      'PARCOURS',
    );
    expect(pageLevel(ametys, `${base}/master-x-MG002537.html`)).toBeNull();
  });

  it('K-Sup: master pages, not news, events nor files', () => {
    expect(
      isProgramUrl(
        ksup,
        'https://www.univ-tours.fr/formations/master-sciences-du-vivant-parcours-biotechnologies-et-droit',
      ),
    ).toBe(true);
    expect(
      isProgramUrl(ksup, 'https://www.univ-tours.fr/actualites/2026/rentree-des-masters'),
    ).toBe(false);
    expect(isProgramUrl(ksup, 'https://www.univ-tours.fr/formations/livret-master.pdf')).toBe(
      false,
    );
  });

  it('a profile pattern overrides the template', () => {
    const own = profileConfig.parse({
      template: 'KSUP',
      hosts: ['www.univ-tours.fr'],
      include: '^/formations/',
      exclude: 'archives',
    });
    expect(isProgramUrl(own, 'https://www.univ-tours.fr/formations/licence-x')).toBe(true);
    expect(isProgramUrl(own, 'https://www.univ-tours.fr/formations/archives/master-x')).toBe(false);
  });
});

describe('options and coverage', () => {
  it('template options with the profile settings on top', () => {
    const o = extractOptions(
      profileConfig.parse({
        template: 'AMETYS_ODF_HTML',
        hosts: ['a.fr'],
        extract: { drop: '.x', noise: ['^voir$'] },
      }),
      'https://a.fr/p.html',
    );
    expect(o.headings?.[0]).toEqual({ selector: 'h2.ametys-section-title', level: 2 });
    expect(o.drop).toContain('.x');
    expect(o.noise?.[0]?.test('Voir')).toBe(true);
    expect(o.url).toBe('https://a.fr/p.html');
  });

  it('coverage counts pages with 0, 1–2 and 3 rubrics or more', () => {
    expect(coverage([0, 1, 2, 3, 7])).toEqual({
      pages: 5,
      zero: 1,
      few: 2,
      threeOrMore: 2,
      rate: 0.4,
    });
  });
});
