import { NotFoundContent } from '@/components/public/NotFoundContent';

/**
 * notFound() in a public page (an unknown fiche, mention, university or closed city): the site's
 * 404 inside the public layout, status 404, one h1.
 */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
