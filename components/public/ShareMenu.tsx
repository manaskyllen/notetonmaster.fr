'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { ShareTarget } from '@/lib/domain/share';

/** A phone with the share sheet of the system; elsewhere, links are copied. */
function nativeShare(): boolean {
  return (
    typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches
  );
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or no permission: the selection of a hidden field.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * The two choices of « Partager » (components/public/ShareButton.tsx). On a phone each opens the
 * share sheet with its own title and text; on a computer each has « Copier le lien », and
 * « Lien copié » is announced (aria-live). A bottom sheet on a phone, a dropdown from 640 px.
 */
export function ShareMenu({
  id,
  targets,
  onClose,
}: {
  id: string;
  targets: ShareTarget[];
  onClose: () => void;
}) {
  const [native] = useState(nativeShare);
  const [copied, setCopied] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  const share = async (t: ShareTarget) => {
    try {
      await navigator.share({ title: t.title, text: t.text, url: t.url });
      onClose();
    } catch (e) {
      // Closed by the person: nothing to do. Refused by the browser: copy instead.
      if ((e as Error).name !== 'AbortError' && (await copy(t.url))) setCopied(t.id);
    }
  };

  return (
    <div
      id={id}
      role="group"
      aria-label="Partager"
      className={cn(
        'z-30 flex flex-col gap-1 rounded-[20px] border border-border bg-surface-0 p-2 text-ink shadow-[0_18px_40px_rgba(22,19,31,.18)]',
        // Phone: a sheet at the bottom, inside the safe area; from 640 px: under the button.
        'fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))]',
        'sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:bottom-auto sm:mt-2 sm:w-[340px]',
      )}
    >
      {targets.map((t, i) =>
        native ? (
          <button
            key={t.id}
            ref={i === 0 ? first : undefined}
            type="button"
            onClick={() => void share(t)}
            className="flex min-h-tap cursor-pointer flex-col items-start gap-0.5 rounded-[14px] border-0 bg-transparent px-3.5 py-3 text-left font-sans text-ink hover:bg-surface-50"
          >
            <span className="text-[15px] font-bold">{t.label}</span>
            <span className="text-[13px] text-ink-muted">{t.hint}</span>
          </button>
        ) : (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[14px] px-3.5 py-3"
          >
            <span className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
              <span id={`${id}-${t.id}`} className="text-[15px] font-bold">
                {t.label}
              </span>
              <span className="text-[13px] text-ink-muted">{t.hint}</span>
            </span>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              aria-describedby={`${id}-${t.id}`}
              onClick={async () => {
                if (await copy(t.url)) setCopied(t.id);
              }}
              className="inline-flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] border-border-control bg-surface-0 px-3.5 font-sans text-[14px] font-semibold text-ink"
            >
              <Icon name={copied === t.id ? 'check' : 'link'} size={16} />
              {copied === t.id ? 'Copié' : 'Copier le lien'}
            </button>
          </div>
        ),
      )}
      <p role="status" aria-live="polite" className="m-0 px-3.5 text-[13px] font-semibold text-success">
        {copied ? 'Lien copié' : ''}
      </p>
    </div>
  );
}
