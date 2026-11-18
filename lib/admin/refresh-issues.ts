import 'server-only';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';
import { computeIssues, type IssueScope } from './issues';

/**
 * After a change in the admin (server actions): problems of the fiches touched, then the
 * counters of the sidebar and of the views (cache `admin-counts`). Next.js only: the worker
 * expires the cache through invalidateTagsRemote.
 */
export async function refreshIssues(scope: IssueScope | undefined, actorId: string | null) {
  await computeIssues(scope, actorId);
  expireTags([TAGS.admin]);
}
