import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@/lib/db/generated/client';
import type { TokenPurpose } from '@/lib/db/generated/enums';
import { prisma } from '@/lib/db';
import { hashToken, hmac, randomCode, randomToken } from '@/lib/crypto';

/**
 * Login, review confirmation and change of address: one mail carries a 6-digit code and a
 * link « Se connecter sur cet appareil ». Both live on the same row, so using one consumes the
 * other. The link never acts on GET: it opens a confirmation page whose button does the work,
 * so the mail scanners of university inboxes (Safe Links…) that open it burn nothing.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_TTL_MS = CODE_TTL_MS;
export const CONFIRM_TTL_MS = CODE_TTL_MS;
export const REPLY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Wrong codes allowed per mail; the link of the same mail keeps working. */
export const MAX_CODE_ATTEMPTS = 5;

/** The code is stored as an HMAC salted by its row, never in clear: 10⁶ values are no secret. */
const codeHashOf = (tokenHash: string, code: string) => hmac(`otp:${tokenHash}:${code}`);

/** « 482913 » → « 482 913 », as written in the mail. */
export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Creates a single-use token; only its SHA-256 hash is stored. Returns the raw token. */
export async function createToken(p: {
  emailHash: string;
  purpose: TokenPurpose;
  ttlMs: number;
  payload?: Prisma.InputJsonValue;
}): Promise<string> {
  const token = randomToken();
  await prisma.magicLinkToken.create({
    data: {
      tokenHash: hashToken(token),
      emailHash: p.emailHash,
      purpose: p.purpose,
      expiresAt: new Date(Date.now() + p.ttlMs),
      payload: p.payload,
    },
  });
  return token;
}

/**
 * Creates the link and its 6-digit code (10 minutes). Earlier unused rows of the same kind
 * (same address, same `scope` in the payload if given) stop working: only the latest mail counts.
 */
export async function createLinkAndCode(p: {
  emailHash: string;
  purpose: TokenPurpose;
  payload?: Record<string, Prisma.InputJsonValue>;
  scope?: { key: string; value: string };
}): Promise<{ token: string; code: string }> {
  await revokeTokens({
    emailHash: p.emailHash,
    purpose: p.purpose,
    payloadKey: p.scope ? { path: [p.scope.key], equals: p.scope.value } : undefined,
  });
  const token = randomToken();
  const code = randomCode();
  const tokenHash = hashToken(token);
  await prisma.magicLinkToken.create({
    data: {
      tokenHash,
      codeHash: codeHashOf(tokenHash, code),
      emailHash: p.emailHash,
      purpose: p.purpose,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      payload: p.payload,
    },
  });
  return { token, code };
}

/** Looks a token up without consuming it (for confirmation pages). */
export async function peekToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 200) return null;
  const row = await prisma.magicLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Consumes a token atomically: returns it only if it was unused and not expired. */
export async function consumeToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const updated = await prisma.magicLinkToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) return null;
  return prisma.magicLinkToken.findUnique({ where: { tokenHash } });
}

export type CodeFailure =
  | { error: 'format' }
  | { error: 'expired' }
  | { error: 'locked' }
  | { error: 'wrong'; remaining: number };

/** Keeps the 6 digits of what was typed or pasted (« 482 913 », « 482-913 »). */
export const cleanCode = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/\D/g, '') : '');

/**
 * Checks the code of the latest mail sent to `emailHash` for `purpose`. Every wrong code counts
 * (5 at most); the comparison runs in constant time. On success the row is consumed, which
 * also kills its link.
 */
export async function consumeCode(p: {
  emailHash: string;
  purpose: TokenPurpose;
  code: unknown;
  scope?: { key: string; value: string };
}): Promise<{ row: NonNullable<Awaited<ReturnType<typeof consumeToken>>> } | CodeFailure> {
  const code = cleanCode(p.code);
  if (code.length !== 6) return { error: 'format' };
  const row = await prisma.magicLinkToken.findFirst({
    where: {
      emailHash: p.emailHash,
      purpose: p.purpose,
      usedAt: null,
      codeHash: { not: null },
      ...(p.scope ? { payload: { path: [p.scope.key], equals: p.scope.value } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!row || row.expiresAt < new Date()) return { error: 'expired' };
  // Counted before comparing, atomically: parallel guesses cannot exceed the limit.
  const counted = await prisma.magicLinkToken.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return { error: 'locked' };
  const expected = Buffer.from(row.codeHash!, 'hex');
  const given = Buffer.from(codeHashOf(row.tokenHash, code), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const remaining = MAX_CODE_ATTEMPTS - (row.attempts + 1);
    return remaining > 0 ? { error: 'wrong', remaining } : { error: 'locked' };
  }
  const used = await prisma.magicLinkToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) return { error: 'expired' };
  return { row };
}

/** The sentence shown under the code boxes. */
export function codeFailureMessage(f: CodeFailure): string {
  switch (f.error) {
    case 'format':
      return 'Le code a 6 chiffres.';
    case 'expired':
      return 'Ce code a expiré ou a déjà servi. Demande un nouveau code.';
    case 'locked':
      return 'Trop d’essais avec ce code. Demande un nouveau code.';
    case 'wrong':
      return `Ce n’est pas le bon code. Encore ${f.remaining} essai${f.remaining > 1 ? 's' : ''}.`;
  }
}

/** Invalidates earlier unused tokens of the same kind (e.g. a new reply link replaces the old one). */
export async function revokeTokens(where: {
  emailHash: string;
  purpose: TokenPurpose;
  payloadKey?: { path: string[]; equals: string };
}) {
  await prisma.magicLinkToken.updateMany({
    where: {
      emailHash: where.emailHash,
      purpose: where.purpose,
      usedAt: null,
      ...(where.payloadKey
        ? { payload: { path: where.payloadKey.path, equals: where.payloadKey.equals } }
        : {}),
    },
    data: { usedAt: new Date() },
  });
}
