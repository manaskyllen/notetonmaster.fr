import { cn } from '@/lib/cn';
import { matchedByText, type MatchedBy as MatchedByValue } from '@/lib/domain/search';

/**
 * « Trouvé par RNCP · RNCP42684 »: shown when a result was found by one of its identifiers and
 * not by its text. Renders nothing for a text match.
 */
export function MatchedBy({
  match,
  className,
}: {
  match: MatchedByValue | null | undefined;
  className?: string;
}) {
  const text = matchedByText(match);
  if (!text) return null;
  return <span className={cn('nm-codehit', className)}>Trouvé par {text}</span>;
}
