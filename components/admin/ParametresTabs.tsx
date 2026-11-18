import Link from 'next/link';

/** Paramètres › tabs (Admin only). */
export function ParametresTabs({
  current,
  showSettings,
}: {
  current: 'reglages';
  showSettings: boolean;
}) {
  const tabs = [
    ...(showSettings ? [{ id: 'reglages', href: '/admin/parametres', label: 'Réglages' }] : []),
  ];
  return (
    <nav aria-label="Paramètres" className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? 'page' : undefined}
          className={`inline-flex min-h-tap items-center rounded-pill px-4 font-semibold no-underline ${t.id === current ? 'bg-ink text-surface-0' : 'bg-surface-0 text-ink hover:bg-surface-100'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
