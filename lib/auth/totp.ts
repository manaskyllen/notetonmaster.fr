import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

/** TOTP (RFC 6238, 30 s, 6 digits), compatible with common authenticator apps. */
export function newTotpSecret(): string {
  return generateSecret();
}

export function totpCode(secret: string): string {
  return generateSync({ secret });
}

/** Accepts the previous and next 30 s windows to absorb clock drift. */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return verifySync({ secret, token: clean, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
}

/**
 * The time step of a valid code (previous, current or next 30 s window), or null. The caller
 * refuses a step already used (replay): AdminUser.totpLastStep.
 */
export function verifyTotpStep(secret: string, token: string): number | null {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  try {
    const r = verifySync({ secret, token: clean, epochTolerance: 30 }) as {
      valid: boolean;
      timeStep?: number;
    };
    return r.valid && typeof r.timeStep === 'number' ? r.timeStep : null;
  } catch {
    return null;
  }
}

export function totpUri(secret: string, email: string): string {
  return generateURI({ issuer: 'notetonmaster', label: email, secret });
}
