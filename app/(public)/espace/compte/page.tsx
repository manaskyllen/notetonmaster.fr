import type { Metadata } from 'next';
import { AccountPanel } from '@/components/espace/AccountPanel';
import { getEspace } from '@/lib/espace';

export const metadata: Metadata = { title: 'Compte · Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ adresse?: string }>;
}) {
  const [{ adresse }, e] = await Promise.all([searchParams, getEspace()]);
  return (
    <AccountPanel
      maskedEmail={e.maskedEmail}
      changed={adresse === 'ok'}
      prefs={{
        acceptsQuestions: e.student.acceptsQuestions,
        notifyNewMessage: e.student.notifyNewMessage,
        notifyReviewStatus: e.student.notifyReviewStatus,
        notifySavedDigest: e.student.notifySavedDigest,
        notifyQuestionDigest: e.student.notifyQuestionDigest,
      }}
    />
  );
}
