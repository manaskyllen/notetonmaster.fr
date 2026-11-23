'use client';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Icon } from '@/components/ui/Icon';
import { ShareCopyButton } from './ShareCopyButton';
import { cn } from '@/lib/cn';
import { shareText, whatsappUrl, type ShareData } from '@/lib/domain/share';
import {
  LABELS,
  SHARE_TABS,
  SHARE_TITLE,
  shareMessage,
  shareTitle,
  type ShareContext,
  type ShareTab,
} from '@/lib/domain/share-copy';

/** The QR code (and qrcode-generator) is its own chunk, fetched on « QR code » only. */
const ShareQr = dynamic(() => import('./ShareQr').then((m) => m.ShareQr), {
  ssr: false,
  loading: () => <div className="h-[144px] rounded-[16px] bg-night" />,
});

/** Below this width, a modal sheet from the bottom; from it, a popover under the button. */
export const SHEET_QUERY = '(max-width: 759.98px)';

export interface SharePanelProps {
  data: ShareData;
  context: ShareContext;
  initialTab: ShareTab;
  /** The button the popover hangs from (focus comes back to it on close). */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/**
 * « Partager » (issue #13): two tabs (the fiche, the review form set on the parcours), the card a
 * conversation will show, a message in two tones that can be edited (kept in memory only), copy,
 * WhatsApp, e-mail and a QR code. A non-modal popover under the button on a computer, a modal
 * sheet from the bottom on a phone (native share sheet there). No network call, no tracker.
 */
export function SharePanel(props: SharePanelProps) {
  const [sheet] = useState(() => window.matchMedia(SHEET_QUERY).matches);
  return sheet ? <Sheet {...props} /> : <Popover {...props} />;
}

function Popover({ anchor, onClose, ...rest }: SharePanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);

  // Centred under the button, moved back inside the window (16 px) when it would go past it;
  // the arrow stays on the middle of the button. Left is relative to the button's wrapper
  // (ShareButton, position: relative), so the popover follows the button wherever it wraps.
  useLayoutEffect(() => {
    const place = () => {
      const p = panel.current;
      const a = anchor.current;
      const box = p?.offsetParent;
      if (!p || !a || !box) return;
      const b = a.getBoundingClientRect();
      const width = p.offsetWidth;
      const middle = b.left + b.width / 2;
      const max = document.documentElement.clientWidth - 16 - width;
      const left = Math.max(16, Math.min(middle - width / 2, max));
      const r = box.getBoundingClientRect();
      setPos({ left: left - r.left, top: b.bottom - r.top + 14, arrow: middle - left - 8 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [anchor]);

  const close = (focus: boolean) => {
    onClose();
    if (focus) anchor.current?.focus();
  };

  useEffect(() => {
    const close = (focus: boolean) => {
      onClose();
      if (focus) anchor.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-share-panel="popover"
      // Placed by the layout effect above, before the first paint.
      style={pos ? { left: pos.left, top: pos.top } : undefined}
      className="nm-share-pop absolute top-full left-0 z-40 box-border w-[420px] max-w-[calc(100vw-32px)] rounded-[26px] bg-surface-0 p-5 text-left text-ink shadow-[0_24px_60px_rgba(22,19,31,.22),0_2px_6px_rgba(22,19,31,.08)]"
    >
      <span
        aria-hidden="true"
        data-share-arrow
        style={{ left: pos?.arrow ?? 0 }}
        className="absolute -top-1.75 size-4 rotate-45 rounded-[3px] bg-surface-0"
      />
      <Body {...rest} titleId={titleId} sheet={false} onClose={() => close(true)} />
    </div>
  );
}

function Sheet({ anchor, onClose, ...rest }: SharePanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => {
    dialog.current?.close();
    onClose();
    anchor.current?.focus();
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    d.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);

  // Tab and Shift+Tab stay inside the sheet (the browser would leave it for its own toolbar).
  const trap = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea, [tabindex="0"]',
      ),
    ].filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-share-panel="sheet"
      onKeyDown={trap}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click on the dimmed background (the dialog itself, around its box) closes it.
      onClick={(e) => e.target === e.currentTarget && close()}
      className="nm-share-sheet m-0 mt-auto box-border max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border-0 bg-surface-0 p-0 text-ink"
    >
      <div className="flex flex-col gap-4 px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="h-1.25 w-11 self-center rounded-pill bg-border" />
        <Body {...rest} titleId={titleId} sheet onClose={close} />
      </div>
    </dialog>
  );
}

function Body({
  data,
  context,
  initialTab,
  titleId,
  sheet,
  onClose,
}: Omit<SharePanelProps, 'anchor' | 'onClose'> & {
  titleId: string;
  sheet: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ShareTab>(initialTab);
  const [qr, setQr] = useState(false);
  const [canShare] = useState(() => typeof navigator.share === 'function');
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const id = useId();

  // The popover gives the focus to the selected tab (the sheet does it after showModal).
  useEffect(() => {
    if (!sheet) tabs.current[initialTab]?.focus();
  }, [sheet, initialTab]);

  const message = shareMessage(tab, data, context);
  const url = data.links[tab];

  const both = () => shareText(message, url);
  const pickTab = (t: ShareTab) => setTab(t);
  const onTabKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = SHARE_TABS.findIndex((x) => x.id === tab);
    const next = SHARE_TABS[(i + step + SHARE_TABS.length) % SHARE_TABS.length]!.id;
    pickTab(next);
    tabs.current[next]?.focus();
  };
  const native = async () => {
    try {
      await navigator.share({ title: shareTitle(tab, data), text: message, url });
    } catch {
      // Closed by the person, or refused: the other buttons stay there.
    }
  };

  // Look and motion of the buttons: .nm-sbtn / .nm-stgt (styles/motion.css).
  const qrButton = (
    <button
      type="button"
      aria-expanded={qr}
      aria-controls={qr ? `${id}-qr` : undefined}
      onClick={() => setQr((q) => !q)}
      className="nm-stgt"
    >
      <span className="nm-ic" aria-hidden="true">
        <Icon name="qr" size={18} />
      </span>
      {LABELS.qr}
    </button>
  );
  const copyLink = (
    <ShareCopyButton
      variant="tgt"
      icon="link"
      text={() => url}
      label={LABELS.copyLink}
      done={LABELS.linkCopied}
    />
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="m-0 font-display text-[24px] font-extrabold tracking-[-0.02em]">
          {SHARE_TITLE}
        </h2>
        <button
          type="button"
          aria-label={LABELS.close}
          onClick={onClose}
          className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-[12px] border-0 bg-surface-100 text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        role="tablist"
        aria-label={LABELS.tablist}
        className="grid grid-cols-2 gap-1 rounded-[14px] bg-surface-100 p-1"
      >
        {SHARE_TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${id}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => pickTab(t.id)}
              onKeyDown={onTabKey}
              className={cn(
                'min-h-11 cursor-pointer rounded-[11px] border-0 px-2.5 font-sans text-[14px] font-bold text-ink transition-colors',
                on ? 'bg-surface-0 shadow-[0_2px_8px_rgba(22,19,31,.10)]' : 'bg-transparent',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${tab}`}
        className="flex flex-col gap-3.5"
      >
        <p
          data-share-message
          className="m-0 rounded-[16px] bg-surface-50 px-4 py-3.5 text-[15px] leading-[1.5] text-ink"
        >
          {message}{' '}
          <span className="font-semibold text-violet-700 [overflow-wrap:anywhere]">{url}</span>
        </p>

        <div className="flex flex-col gap-2">
          {sheet && canShare ? (
            <>
              <button
                type="button"
                onClick={() => void native()}
                className="nm-sbtn nm-sbtn--main"
              >
                <span className="nm-ic" aria-hidden="true">
                  <Icon name="share" size={18} />
                </span>
                {LABELS.nativeShare}
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <ShareCopyButton
                  variant="tgt"
                  text={both}
                  label={LABELS.copyShort}
                  done={LABELS.copiedShort}
                />
                {qrButton}
              </div>
            </>
          ) : (
            <>
              <ShareCopyButton
                variant="main"
                text={both}
                label={LABELS.copyMessage}
                done={LABELS.messageCopied}
              />
              <div className={cn('grid gap-1.5', sheet ? 'grid-cols-2' : 'grid-cols-3')}>
                {copyLink}
                {/* WhatsApp only on a computer: on a phone, the share sheet proposes it. */}
                {!sheet && (
                  <a
                    href={whatsappUrl(message, url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nm-stgt"
                  >
                    <span className="nm-ic" aria-hidden="true">
                      <Icon name="whatsapp" size={18} />
                    </span>
                    {LABELS.whatsapp}
                  </a>
                )}
                {qrButton}
              </div>
            </>
          )}
        </div>

        {qr && <ShareQr id={`${id}-qr`} tab={tab} url={url} />}
      </div>
    </div>
  );
}
