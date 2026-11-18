import { cn } from '@/lib/cn';

export interface ChatBubbleProps {
  mine: boolean;
  children: React.ReactNode;
  time?: string;
  /** Sender label for screen readers (e.g. "Toi", "Étudiant·e anonyme #4F2"). */
  from?: string;
  masked?: boolean;
  /** A message that just arrived: it slides in from its side (left for the other, right for me). */
  fresh?: boolean;
}

export function ChatBubble({ mine, children, time, from, masked, fresh }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        mine ? 'items-end' : 'items-start',
        fresh && (mine ? 'nm-msg-in-right' : 'nm-msg-in-left'),
      )}
    >
      <div
        className={cn(
          'max-w-[85%] px-4 py-3 text-[15px] leading-[1.5] whitespace-pre-line',
          mine
            ? 'rounded-[18px_18px_4px_18px] bg-violet-500 text-on-violet'
            : 'rounded-[18px_18px_18px_4px] border border-border bg-surface-0 text-ink',
        )}
      >
        {from ? <span className="sr-only">{from} : </span> : null}
        {children}
      </div>
      {(time || masked) && (
        <span className="text-[12px] text-ink-muted">
          {time}
          {masked ? `${time ? ' · ' : ''}coordonnées masquées` : ''}
        </span>
      )}
    </div>
  );
}
