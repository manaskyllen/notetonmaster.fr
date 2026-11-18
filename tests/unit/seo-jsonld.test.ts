/** JSON-LD of each kind of page (lib/seo/jsonld.ts): snapshots, and our own validity rules. */
import { describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  pageJsonLd,
  programJsonLd,
  serializeJsonLd,
  siteJsonLd,
  universityJsonLd,
} from '@/lib/seo/jsonld';
import { checkJsonLd, typesOf } from '@/lib/seo/jsonld-check';

const O = 'https://notetonmaster.fr';
const crumbs = (items: { label: string; href?: string }[]) => ({
  '@context': 'https://schema.org',
  ...breadcrumbJsonLd(items, O),
});
const program = {
  slug: 'valorisation-des-nouveaux-patrimoines',
  title: 'Valorisation des nouveaux patrimoines',
  mention: 'Culture, patrimoine et médiation',
  durationYears: 2,
  ects: 120,
  university: {
    name: 'Nantes Université',
    slug: 'nantes-universite',
    website: 'https://www.univ-nantes.fr',
  },
  city: 'Nantes',
  prerequisites: 'Licence d’histoire, d’histoire de l’art ou de géographie.',
};

describe('every public page', () => {
  it('Organization and WebSite, no SearchAction, no rating', () => {
    const block = siteJsonLd(O);
    expect(block).toMatchSnapshot();
    expect(checkJsonLd(block)).toEqual([]);
    expect(JSON.stringify(block)).not.toMatch(/SearchAction|aggregateRating|FAQPage/);
  });
});

describe('fiche parcours', () => {
  it('EducationalOccupationalProgram with provider, credential, duration, credits; no aggregateRating', () => {
    const block = pageJsonLd([programJsonLd(program, O)]);
    expect(block).toMatchSnapshot();
    expect(checkJsonLd(block)).toEqual([]);
    expect(JSON.stringify(block)).not.toMatch(/aggregateRating/);
  });
  it('a one-year M2 and unknown prerequisites: P1Y, 60 credits, no programPrerequisites', () => {
    const p = programJsonLd({ ...program, durationYears: 1, ects: null, prerequisites: null }, O);
    expect(p).toMatchObject({ timeToComplete: 'P1Y', numberOfCredits: 60 });
    expect(p).not.toHaveProperty('programPrerequisites');
    // the university's own site when known, else its page here
    expect(
      programJsonLd({ ...program, university: { ...program.university, website: null } }, O)
        .provider,
    ).toMatchObject({
      url: `${O}/universites/nantes-universite`,
    });
  });
  it('breadcrumb Accueil › Nantes › Mention › Parcours, the last without item', () => {
    const block = crumbs([
      { label: 'Accueil', href: '/' },
      { label: 'Nantes', href: '/masters/nantes' },
      {
        label: 'Culture, patrimoine et médiation',
        href: '/mentions/culture-patrimoine-et-mediation',
      },
      { label: 'Valorisation des nouveaux patrimoines' },
    ]);
    expect(block).toMatchSnapshot();
    expect(checkJsonLd(block)).toEqual([]);
  });
});

describe('mention, university, city pages', () => {
  it('mention: breadcrumb', () => {
    const block = crumbs([
      { label: 'Accueil', href: '/' },
      { label: 'Mentions', href: '/mentions' },
      { label: 'Droit' },
    ]);
    expect(block).toMatchSnapshot();
    expect(checkJsonLd(block)).toEqual([]);
  });
  it('university: breadcrumb and CollegeOrUniversity, never rated', () => {
    const block = pageJsonLd([
      universityJsonLd(
        {
          name: 'Nantes Université',
          slug: 'nantes-universite',
          website: 'https://www.univ-nantes.fr',
          city: 'Nantes',
        },
        O,
      ),
    ]);
    expect(block).toMatchSnapshot();
    expect(checkJsonLd(block)).toEqual([]);
  });
  it('city and city × mention: breadcrumb', () => {
    const city = crumbs([{ label: 'Accueil', href: '/' }, { label: 'Nantes' }]);
    const pair = crumbs([
      { label: 'Accueil', href: '/' },
      { label: 'Nantes', href: '/masters/nantes' },
      { label: 'Droit' },
    ]);
    expect([city, pair]).toMatchSnapshot();
    expect([...checkJsonLd(city), ...checkJsonLd(pair)]).toEqual([]);
  });
});

describe('the check refuses what Google would not use or show', () => {
  it('rating on our own site or a non eligible type, SearchAction, FAQPage, relative URLs', () => {
    const bad = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: 'x',
          url: `${O}/`,
          potentialAction: { '@type': 'SearchAction' },
        },
        { '@type': 'Organization', name: 'x', url: '/', aggregateRating: {} },
        {
          ...programJsonLd(program, O),
          aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.1, ratingCount: 12 },
        },
        { '@type': 'FAQPage' },
      ],
    };
    const errors = checkJsonLd(bad).join('\n');
    expect(errors).toMatch(/pas de SearchAction/);
    expect(errors).toMatch(/jamais de note sur un établissement/);
    expect(errors).toMatch(/URL absolue/);
    expect(errors).toMatch(/non éligible aux extraits d’avis/);
    expect(errors).toMatch(/FAQPage non retenu/);
    expect(typesOf(bad)).toContain('EducationalOccupationalProgram');
  });
  it('serialised without a closing script tag', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)</script>' })).not.toMatch(/<\//);
  });
});
