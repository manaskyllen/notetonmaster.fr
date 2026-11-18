import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { getCurrentAdmin } from '@/lib/auth/admin';

export const metadata: Metadata = { title: 'Connexion admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string }>;
}) {
  const { active } = await searchParams;
  if (await getCurrentAdmin()) redirect('/admin');
  return (
    <main className="relative box-border flex min-h-screen items-center justify-center overflow-hidden bg-[#16131f] px-4 py-10">
      <div
        aria-hidden="true"
        className="absolute -top-20 -left-20 size-70 rounded-pill bg-[#5a3bf0] opacity-50"
      />
      <div
        aria-hidden="true"
        className="absolute -right-10 -bottom-15 size-50 rotate-[18deg] rounded-[48px] bg-[#d4f75a] opacity-25"
      />
      <AdminLoginForm activated={!!active} />
    </main>
  );
}
