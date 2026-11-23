'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

const noop = () => () => {};
/** True in a browser that exposes the clipboard (HTTPS or localhost), false on the server. */
const canCopy = () => typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;

/**
 * « Copier » next to a text to copy (User-Agent, robots.txt lines of /a-propos#notre-robot): the
 * label becomes « Copié ✓ » for 2 seconds, announced politely. Not rendered without JavaScript
 * nor without a clipboard: the text stays selectable.
 */
export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  /** Accessible name, e.g. « Copier le User-Agent ». */
  label: string;
  className?: string;
}) {
  const supported = useSyncExternalStore(noop, canCopy, () => false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return; // refused (permissions): nothing copied, nothing announced
        }
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }}
      className={cn(
        'min-h-10 flex-none cursor-pointer rounded-pill border-[1.5px] border-lime-400 bg-transparent px-3.5 text-[13px] font-bold text-lime-400 hover:bg-lime-400 hover:text-on-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400',
        className,
      )}
    >
      <span aria-live="polite">{copied ? 'Copié ✓' : 'Copier'}</span>
    </button>
  );
}
