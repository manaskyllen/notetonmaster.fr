/** The integration tests never drop the development database. */
import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../integration/setup/test-db';

const dev = 'postgresql://u:p@db:5432/notetonmaster';

describe('test database', () => {
  it('a database whose name ends with _test is accepted', () => {
    expect(assertTestDatabase('postgresql://u:p@db:5432/notetonmaster_test', dev).pathname).toBe(
      '/notetonmaster_test',
    );
  });
  it('refused: missing, the development database, a name without _test', () => {
    expect(() => assertTestDatabase(undefined, dev)).toThrow(/DATABASE_URL_TEST manque/);
    expect(() => assertTestDatabase(dev, dev)).toThrow(/_test/);
    expect(() => assertTestDatabase('postgresql://u:p@db:5432/prod', dev)).toThrow(/_test/);
    expect(() => assertTestDatabase('pas une url', dev)).toThrow(/valide/);
  });
  it('refused when it is the development database, even named _test', () => {
    const same = 'postgresql://u:p@db:5432/x_test';
    expect(() => assertTestDatabase(same, same)).toThrow(/développement/);
  });
});
