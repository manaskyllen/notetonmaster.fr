import { describe, expect, it } from 'vitest';
import { frenchList, identitySources } from '@/lib/catalog/fiche-identity';

const at = (d: string) => new Date(`${d}T10:00:00Z`);

describe('sources of the identity block', () => {
  it('computed from the provenance of the fields shown, in a fixed order, with the last update', () => {
    const r = identitySources([
      { sourceKey: 'univ-sites', fetchedAt: at('2026-10-01'), updatedAt: at('2026-10-01') },
      { sourceKey: 'monmaster-opendata', fetchedAt: at('2026-11-02'), updatedAt: at('2026-11-02') },
      { sourceKey: 'monmaster-fiches', fetchedAt: null, updatedAt: at('2026-09-01') },
      { sourceKey: 'rncp', fetchedAt: at('2026-10-20'), updatedAt: at('2026-10-20') },
    ]);
    expect(r.sources).toBe(
      'Mon Master (données ouvertes du ministère), RNCP et site de l’université',
    );
    expect(r.updatedAt).toEqual(at('2026-11-02'));
  });

  it('a manual entry, a single source, nothing', () => {
    expect(
      identitySources([{ sourceKey: null, fetchedAt: null, updatedAt: at('2026-01-01') }]).sources,
    ).toBe('saisie de l’équipe');
    expect(identitySources([])).toEqual({ sources: '', updatedAt: null });
    expect(frenchList(['a', 'b', 'c'])).toBe('a, b et c');
  });
});
