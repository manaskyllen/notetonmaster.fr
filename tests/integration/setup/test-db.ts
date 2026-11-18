/**
 * The integration tests run on their own database (DATABASE_URL_TEST, e.g. notetonmaster_test),
 * dropped and recreated at each run: never on the development database.
 */
export function assertTestDatabase(testUrl: string | undefined, devUrl: string | undefined): URL {
  if (!testUrl)
    throw new Error(
      'DATABASE_URL_TEST manque : les tests d’intégration tournent sur une base dédiée (…/notetonmaster_test), recréée à chaque lancement.',
    );
  let test: URL;
  try {
    test = new URL(testUrl);
  } catch {
    throw new Error('DATABASE_URL_TEST n’est pas une adresse PostgreSQL valide.');
  }
  const name = test.pathname.replace(/^\//, '');
  if (!/_test$/.test(name))
    throw new Error(
      `DATABASE_URL_TEST doit désigner une base dont le nom finit par « _test » (ici « ${name} ») : elle est supprimée et recréée.`,
    );
  if (devUrl) {
    try {
      const dev = new URL(devUrl);
      const same =
        dev.hostname === test.hostname &&
        (dev.port || '5432') === (test.port || '5432') &&
        dev.pathname === test.pathname;
      if (same) throw new Error('DATABASE_URL_TEST désigne la base de développement : refusé.');
    } catch (e) {
      if (e instanceof Error && e.message.includes('refusé')) throw e;
    }
  }
  return test;
}
