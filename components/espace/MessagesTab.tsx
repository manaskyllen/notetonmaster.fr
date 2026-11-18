import { notFound } from 'next/navigation';
import { Pagination } from '@/components/ui';
import { getEspace } from '@/lib/espace';
import {
  CONVERSATIONS_PER_PAGE,
  countStudentConversations,
  getConversationThread,
  getStudentConversations,
} from '@/lib/messaging/queries';
import { readPage, type Params } from '@/lib/pagination';
import { MessagesPanel } from './MessagesPanel';

/**
 * /espace/messages and /espace/messages/[id] (the open conversation): 20 conversations per page,
 * the open one with its latest 30 messages (« Messages précédents » loads more).
 */
export async function MessagesTab({ id, sp = {} }: { id?: string; sp?: Params }) {
  const e = await getEspace();
  const { page, offset } = readPage(sp, { perPage: CONVERSATIONS_PER_PAGE });
  const [conversations, total, thread] = await Promise.all([
    getStudentConversations(e.student.id, { skip: offset, take: CONVERSATIONS_PER_PAGE }),
    countStudentConversations(e.student.id),
    id ? getConversationThread(e.student.id, id) : null,
  ]);
  if (id && !thread) notFound();
  return (
    <MessagesPanel
      conversations={conversations}
      thread={thread}
      acceptsQuestions={e.student.acceptsQuestions}
      chatEnabled={e.settings['chat.enabled']}
      openId={id}
      pagination={
        <Pagination
          pathname={id ? `/espace/messages/${id}` : '/espace/messages'}
          params={sp}
          page={page}
          perPage={CONVERSATIONS_PER_PAGE}
          total={total}
          targetId="messages"
        />
      }
    />
  );
}
