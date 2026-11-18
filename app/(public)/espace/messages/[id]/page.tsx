import type { Metadata } from 'next';
import { MessagesTab } from '@/components/espace/MessagesTab';
import type { Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Conversation · Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <MessagesTab id={id} sp={sp} />;
}
