import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import type { AdminUser } from '@/lib/db/generated/client';
import { can, type Permission } from '@/lib/domain/permissions';
import { adminSession, recentlyAuthenticated, validateSession } from './session';
import { sessionRefOf, setAuditMetaProvider, truncateIp } from '@/lib/audit';
import { clientIp } from '@/lib/request';

// Audit entries written during an admin request carry its truncated IP and session reference.
setAuditMetaProvider(async () => {
  const [ip, session] = await Promise.all([
    clientIp().catch(() => null),
    adminSession().catch(() => null),
  ]);
  return {
    ip: truncateIp(ip),
    sessionRef: session?.adminId ? sessionRefOf(session.adminId, session.issuedAt) : null,
  };
});

export type Admin = Pick<AdminUser, 'id' | 'name' | 'email' | 'role'>;

/** Current admin with a completed TOTP step, or null. */
export const getCurrentAdmin = cache(async (): Promise<Admin | null> => {
  const session = await adminSession();
  if (!session.adminId || !session.totpVerified) return null;
  // Server-side session: revoked at logout, 30 minutes of inactivity, 8 hours at most.
  if (!(await validateSession('ADMIN', session.sid, session.adminId))) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.adminId },
    select: { id: true, name: true, email: true, role: true, removedAt: true, totpEnabledAt: true },
  });
  if (!admin || admin.removedAt || !admin.totpEnabledAt) return null;
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
});

/** For pages: redirects to the login page when not authenticated, to /admin when not allowed. */
export async function requireAdmin(permission: Permission = 'dashboard.view'): Promise<Admin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  if (!can(admin.role, permission)) redirect('/admin?refus=1');
  return admin;
}

export class ForbiddenError extends Error {}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireRole(permission: Permission): Promise<Admin> {
  const admin = await getCurrentAdmin();
  if (!admin || !can(admin.role, permission))
    throw new ForbiddenError('Action non autorisée pour ce rôle.');
  return admin;
}

/** Answer of a sensitive action when the code must be confirmed again (components/admin/Reauth). */
export const REAUTH_REQUIRED = {
  ok: false as const,
  reauth: true as const,
  error: 'Pour cette action, confirme ton code de double authentification.',
};

/**
 * Sensitive actions (roles, open cities, exports, removals, legal requests): the permission, and
 * a password + TOTP or a TOTP confirmation in the last 5 minutes.
 */
export async function guardSensitive<T>(
  permission: Permission,
  fn: (admin: Admin) => Promise<T>,
): Promise<T | { ok: false; error: string } | typeof REAUTH_REQUIRED> {
  return guard(permission, async (admin) => {
    if (!(await recentlyAuthenticated((await adminSession()).sid))) return REAUTH_REQUIRED;
    return fn(admin);
  });
}

/** Wraps an admin action: returns { ok:false } on missing permission instead of throwing. */
export async function guard<T>(
  permission: Permission,
  fn: (admin: Admin) => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    const admin = await requireRole(permission);
    return await fn(admin);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
