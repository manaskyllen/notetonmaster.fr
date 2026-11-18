import type { Metadata } from 'next';
import { InvitationForm } from '@/components/admin/InvitationForm';
import { ROLE_LABEL } from '@/lib/domain/permissions';
import { findInvitation } from '@/lib/auth/invitation';
import { acceptInvitation } from './actions';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvitation(token);
  return (
    <main className="relative box-border flex min-h-screen items-center justify-center overflow-hidden bg-[#16131f] px-4 py-10">
      <InvitationForm
        email={invite?.email ?? null}
        roleLabel={invite ? ROLE_LABEL[invite.role] : ''}
        action={acceptInvitation.bind(null, token)}
      />
    </main>
  );
}
