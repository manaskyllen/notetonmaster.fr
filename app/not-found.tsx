import type { Metadata } from 'next';
import { PageShell } from '@/components/public/PageShell';
import { NotFoundContent } from '@/components/public/NotFoundContent';

export const metadata: Metadata = { title: 'Page introuvable', robots: { index: false } };

/** An unknown address (no route matches). */
export default function NotFound() {
  return (
    <PageShell>
      <NotFoundContent />
    </PageShell>
  );
}
