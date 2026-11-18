import type { Metadata } from 'next';
import { MessagesTab } from '@/components/espace/MessagesTab';
import type { Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Messages · Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Params> }) {
  return <MessagesTab sp={await searchParams} />;
}
