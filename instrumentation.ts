/**
 * Runs once when the server starts: the environment is checked before any request (lib/env.ts).
 * A refused configuration stops the server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertEnv } = await import('@/lib/env');
  assertEnv();
  // No demo account nor demo content in a production database (lib/auth/demo.ts).
  const { assertNoDemoData } = await import('@/lib/auth/demo');
  await assertNoDemoData();
}
