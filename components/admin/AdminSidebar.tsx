'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  tone?: 'lime' | 'danger' | 'muted';
}

/**
 * Shared sidebar of every admin screen (mockups Admin*): fixed on the left, 236 px wide, sticky.
 * Its counters are read in the database and cached 5 minutes (lib/admin/counts.ts).
 */

const nf = new Intl.NumberFormat('fr-FR');

export function AdminSidebar({
  items,
  adminName,
  roleLabel,
  logout,
}: {
  items: NavItem[];
  adminName: string;
  roleLabel: string;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <aside className="box-border bg-[#16131f] text-white max-lg:w-full lg:sticky lg:top-0 lg:h-screen lg:w-59 lg:flex-none lg:self-start">
      <div className="flex h-full flex-col gap-5.5 px-3.5 py-5 lg:overflow-y-auto">
        <div className="flex items-start justify-between gap-2 px-2">
          <Link href="/admin" className="flex flex-col gap-1.5 text-white no-underline">
            <Logo tone="dark" size="s" />
            <span className="text-caption text-[#cfcadb]">Administration</span>
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="admin-nav"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex size-tap items-center justify-center rounded-sm border-0 bg-white/10 text-white lg:hidden"
          >
            <Icon name={open ? 'close' : 'menu'} size={20} />
            <span className="sr-only">Menu</span>
          </button>
        </div>
        <div
          id="admin-nav"
          className={cn('flex flex-1 flex-col gap-5.5', !open && 'max-lg:hidden')}
        >
          <nav aria-label="Administration" className="flex flex-col gap-0.75">
            {items.map((it) => {
              const current =
                it.href === '/admin'
                  ? pathname === '/admin'
                  : pathname === it.href || pathname.startsWith(`${it.href}/`);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex min-h-10.5 items-center gap-2.5 rounded-[12px] px-3 text-[14px] no-underline',
                    current
                      ? 'bg-[#d4f75a] font-bold text-[#16131f]'
                      : 'font-medium text-white hover:bg-white/8',
                  )}
                >
                  <Icon name={it.icon} size={18} />
                  {it.label}
                  {it.count != null && it.count > 0 && (
                    <span
                      className={cn(
                        'ml-auto min-w-5.5 rounded-pill px-1.75 py-0.5 text-center text-[12px] font-bold tabular-nums',
                        it.tone === 'muted'
                          ? current
                            ? 'bg-[#16131f] text-white'
                            : 'bg-[#3a3546] text-white'
                          : it.tone === 'danger'
                            ? 'bg-[#ff8a73] text-[#16131f]'
                            : current
                              ? 'bg-[#16131f] text-[#d4f75a]'
                              : 'bg-[#d4f75a] text-[#16131f]',
                      )}
                    >
                      {nf.format(it.count)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            <Link
              href="/"
              className="flex min-h-tap items-center gap-2 rounded-sm border border-[#3a3546] px-3 font-semibold text-white no-underline"
            >
              Voir le site public
              <Icon name="external" size={16} />
            </Link>
            <div className="flex items-center justify-between gap-2 px-3 text-[13px] text-[#cfcadb]">
              <span>
                {adminName} · {roleLabel}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  className="min-h-tap cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-white underline"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
