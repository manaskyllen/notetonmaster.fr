import { describe, expect, it } from 'vitest';
import { truncateMiddle } from '@/lib/domain/truncate';

describe('labels cut in the middle (breadcrumb)', () => {
  it('keeps the start and the end, on word boundaries', () => {
    expect(
      truncateMiddle(
        'Metiers de l’enseignement, de l’education et de la formation (meef), 1er degre',
      ),
    ).toBe('Metiers de l’enseignement,…la formation (meef), 1er degre');
  });
  it('a short label is left as it is', () => {
    expect(truncateMiddle('Culture, patrimoine et médiation')).toBe(
      'Culture, patrimoine et médiation',
    );
  });
  it('never longer than the budget', () => {
    const long = 'Un intitulé très long '.repeat(10);
    expect(truncateMiddle(long).length).toBeLessThanOrEqual(58);
  });
});
