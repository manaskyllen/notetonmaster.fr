import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CursusPanel } from '@/components/admin/CursusPanel';
import { FicheEditor } from '@/components/admin/FicheEditor';
import { getAdminCursus } from '@/lib/admin/cursus';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Notice } from '@/components/ui/Notice';
import { getFicheForEdit } from '@/lib/admin/fiche-edit';
import { getFicheEditExtras } from '@/lib/admin/fiche-edit-extras';
import { parentSuggestions } from '@/lib/admin/parent-candidates';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/admin';

export const metadata: Metadata = { title: 'Modifier une fiche' };

export default async function FicheEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('data.edit');
  const { id } = await params;
  const data = await getFicheForEdit(id);
  if (!data) notFound();
  const [uni, extras, cursus] = await Promise.all([
    data.type === 'UNIVERSITY' ? prisma.university.findUnique({ where: { id } }) : null,
    getFicheEditExtras(id, data.type),
    data.type === 'PROGRAM' ? getAdminCursus(id) : null,
  ]);
  const suggestions = uni ? await parentSuggestions(uni) : [];
  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Fiches', href: '/admin/fiches' },
          { label: data.name, href: `/admin/fiches?vue=toutes&fiche=${id}` },
          { label: 'Modifier' },
        ]}
      />
      {suggestions.length > 0 && (
        <Notice tone="info">
          <span className="font-bold">
            Établissement parent suggéré par les données ouvertes :{' '}
          </span>
          {suggestions.map((sg) => (
            <span key={sg.parentId}>
              {sg.parentName} (indice {sg.strength} · {sg.evidence}).{' '}
            </span>
          ))}
          À valider en choisissant le parent ci-dessous : rien n’est rattaché automatiquement.
        </Notice>
      )}
      {cursus && <CursusPanel data={cursus} />}
      <FicheEditor data={data} extras={extras} />
    </>
  );
}
