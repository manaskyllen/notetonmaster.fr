'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BANNER_TONES, bannerKey, bannerShownOn, type BannerData } from '@/lib/domain/banner';

/** Star of the banner. */
export function BannerStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

/**
 * Information banner above the navigation bar, rendered on the server in the
 * public layout. The page path decides where it shows (scope, review form, login), also after a
 * client navigation. A dismissal is kept in localStorage under `banner:<id>:<updatedAt>`; the
 * inline script of the root layout hides it before the first paint (no flash).
 */
export function SiteBanner({ banner }: { banner: BannerData | null }) {
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const key = banner ? bannerKey(banner) : '';
  useEffect(() => {
    if (!key) return;
    try {
      // first appearance only: no slide-in on the next pages of the visit
      sessionStorage.setItem(`banner-seen:${key}`, '1');
    } catch {
      // storage blocked: the banner simply slides in again
    }
  }, [key]);
  if (!banner || closed || !bannerShownOn(banner, pathname)) return null;
  const t = BANNER_TONES[banner.tone];
  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // private mode: closed for this page only
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) setClosed(true);
    else {
      setLeaving(true);
      window.setTimeout(() => setClosed(true), 340);
    }
  };
  const internal = banner.linkUrl?.startsWith('/');
  return (
    <div
      role="region"
      aria-label="Information de l’équipe"
      data-banner={key}
      className={`ann ${leaving ? 'leaving' : ''}`}
      style={{ background: t.bg, color: t.fg }}
    >
      <div className="mx-auto box-border flex min-h-12 max-w-page items-center gap-3 py-2.5 pr-4 pl-6 max-sm:items-start max-sm:pr-2 max-sm:pl-4">
        <span
          className="ann-ico flex size-7 flex-none items-center justify-center rounded-[9px]"
          style={{ background: t.icoBg, color: t.icoFg }}
        >
          <BannerStar />
        </span>
        <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.4] font-semibold max-sm:pt-1">
          {banner.message}
          {banner.linkLabel && banner.linkUrl && (
            <>
              {' '}
              {internal ? (
                <Link href={banner.linkUrl} className="ann-link font-bold whitespace-nowrap">
                  {banner.linkLabel} →
                </Link>
              ) : (
                <a
                  href={banner.linkUrl}
                  className="ann-link font-bold whitespace-nowrap"
                  rel="noopener noreferrer"
                >
                  {banner.linkLabel} →
                </a>
              )}
            </>
          )}
        </p>
        {banner.dismissible && (
          <button
            type="button"
            className="ann-x flex size-9 flex-none cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-inherit"
            aria-label="Masquer ce message"
            onClick={close}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
