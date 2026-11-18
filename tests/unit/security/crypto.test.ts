/** AES-256-GCM at rest: a truncated authentication tag is refused (16 bytes required). */
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '@/lib/crypto';

/** The encryption key derived like lib/crypto.ts does (test environment key). */
const encKey = () =>
  Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(process.env.APP_ENCRYPTION_KEY!, 'base64'),
      Buffer.alloc(0),
      'notetonmaster:enc',
      32,
    ),
  );

describe('decrypt', () => {
  it('round-trips', () => {
    expect(decrypt(encrypt('jean.dupont@example.org'))).toBe('jean.dupont@example.org');
  });

  it('refuses a ciphertext whose tag was shortened', () => {
    const buf = Buffer.from(encrypt('secret').slice(3), 'base64');
    // iv (12) + 4 bytes of tag only + ciphertext: what a forger would try.
    const forged =
      'v1:' +
      Buffer.concat([buf.subarray(0, 12), buf.subarray(12, 16), buf.subarray(28)]).toString(
        'base64',
      );
    expect(() => decrypt(forged)).toThrow();
  });

  it('refuses a payload too short to hold an iv and a tag', () => {
    expect(() => decrypt('v1:' + Buffer.alloc(20).toString('base64'))).toThrow();
  });

  it('refuses a valid ciphertext whose tag is only 4 bytes (2³² tries to forge one)', () => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', encKey(), iv, { authTagLength: 4 });
    c.update(Buffer.alloc(0));
    c.final();
    const payload = 'v1:' + Buffer.concat([iv, c.getAuthTag()]).toString('base64');
    expect(() => decrypt(payload)).toThrow();
  });
});
