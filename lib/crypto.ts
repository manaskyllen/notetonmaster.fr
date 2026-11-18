/**
 * Encryption at rest (AES-256-GCM) and keyed hashes (HMAC-SHA256) for lookups.
 * Keys are derived from APP_ENCRYPTION_KEY (32 bytes, base64) with HKDF.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
} from 'node:crypto';

let keys: { enc: Buffer; mac: Buffer } | null = null;

function getKeys() {
  if (keys) return keys;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set');
  const master = Buffer.from(raw, 'base64');
  if (master.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.APP_URL ?? '').startsWith('https://') &&
    master.toString().startsWith('dev-only')
  )
    throw new Error('APP_ENCRYPTION_KEY still has its development value');
  keys = {
    enc: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'notetonmaster:enc', 32)),
    mac: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'notetonmaster:mac', 32)),
  };
  return keys;
}

const PREFIX = 'v1:';

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKeys().enc, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(payload: string): string {
  if (!payload.startsWith(PREFIX)) throw new Error('Unknown ciphertext format');
  const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
  // 12-byte IV + a full 16-byte tag: a shorter tag would make forgery feasible.
  if (buf.length < 28) throw new Error('Ciphertext too short');
  const decipher = createDecipheriv('aes-256-gcm', getKeys().enc, buf.subarray(0, 12), {
    authTagLength: 16,
  });
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

/** Keyed hash for lookups (emails, university emails, voter cookies). */
export function hmac(value: string): string {
  return createHmac('sha256', getKeys().mac).update(value).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return hmac(`email:${normalizeEmail(email)}`);
}

/** Single-use tokens are stored as SHA-256 hashes only. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 6-digit numeric code. */
export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** "a•••@gmail.com" — for moderators, never public. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.charAt(0)}•••@${domain}`;
}
