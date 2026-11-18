import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/admin';
import { ConfirmIdentity } from '@/components/admin/ConfirmIdentity';

export const metadata: Metadata = { title: 'Confirmer ton code' };

/** Only a page of the administration can follow the confirmation (no open redirect). */
const safeSuite = (s: unknown) =>
  typeof s === 'string' && /^\/admin\/[A-Za-z0-9/_.-]*$/.test(s) && !s.includes('..')
    ? s
    : '/admin';

/** « Confirme ton code » before a sensitive download (export of a legal request). */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  await requireAdmin();
  const { suite } = await searchParams;
  return <ConfirmIdentity next={safeSuite(suite)} />;
}
