import { TopNav } from '@/components/ui/TopNav';
import { getCurrentStudent, unreadCount } from '@/lib/auth/student';
import { draftOwnerOf } from '@/lib/review-draft-owner';
import { DraftJanitor } from './DraftJanitor';
import { HeaderSearchPill } from './HeaderSearchPill';

export async function SiteHeader() {
  const student = await getCurrentStudent();
  const unread = student ? await unreadCount(student.id) : 0;
  return (
    <>
      <DraftJanitor owner={student ? draftOwnerOf(student.id) : 'anon'} />
      <TopNav
        search={<HeaderSearchPill />}
        links={[
          // No "Comparer" link: the comparator is reached from Explorer (or followed masters).
          { label: 'Explorer', href: '/explorer' },
          { label: 'Villes', href: '/masters' },
          { label: 'Guides', href: '/guides' },
          student
            ? { label: 'Mon espace', href: '/espace', badge: unread || undefined }
            : { label: 'Se connecter', href: '/connexion' },
        ]}
      />
    </>
  );
}
