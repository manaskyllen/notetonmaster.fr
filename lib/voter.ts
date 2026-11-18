import 'server-only';
import { cookies } from 'next/headers';
import { hmac, randomToken } from '@/lib/crypto';

const COOKIE = 'nm_voter';

/** Anonymous visitor key for "Utile" votes: random httpOnly cookie, stored hashed. */
export async function getVoterKey(create: boolean): Promise<string | null> {
  const jar = await cookies();
  let raw = jar.get(COOKIE)?.value;
  if (!raw && create) {
    raw = randomToken(18);
    jar.set(COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      secure: (process.env.APP_URL ?? '').startsWith('https://'),
    });
  }
  return raw ? hmac(`voter:${raw}`) : null;
}
