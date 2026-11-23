'use client';

import type { ShareData } from '@/lib/domain/share';
import {
  INVITE_BUTTON,
  promoInvite,
  shareMessage,
  shareTitle,
  stickerCount,
} from '@/lib/domain/share-copy';
import { ShareButton } from './ShareButton';

/**
 * The invitation of the confirmation screen of a review (issue #13), right on the lime card: the
 * published reviews in a tilted sticker, a sentence, and « Inviter ma promo ». On a computer it
 * opens the share panel on « Inviter ma promo » (message written after a review); on a phone,
 * the share sheet of the system directly.
 */
export function PromoInvite({ data }: { data: ShareData }) {
  const { title, line } = promoInvite(data.reviewCount);
  return (
    <div
      data-promo-invite
      className="mt-2 flex w-full flex-wrap items-center gap-x-4.5 gap-y-4 border-t-[1.5px] border-[rgba(22,19,31,.14)] pt-5.5"
    >
      <span
        aria-hidden="true"
        className="nm-sticker flex size-16 flex-none -rotate-4 flex-col items-center justify-center rounded-[18px] bg-[#16131F] leading-none text-[#D4F75A]"
      >
        <span className="font-display text-[30px] font-extrabold tracking-[-0.04em]">
          {stickerCount(data.reviewCount)}
        </span>
        <span className="mt-0.5 text-[11px] font-bold">avis</span>
      </span>
      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.75">
        <span className="font-display text-[19px] leading-[1.2] font-bold tracking-[-0.01em]">
          {title}
        </span>
        {line && <span className="text-[14px] leading-[1.4] text-[#2F3A10]">{line}</span>}
      </span>
      <ShareButton
        data={data}
        context="after"
        initialTab="promo"
        variant="invite"
        native={{
          title: shareTitle('promo', data),
          text: shareMessage('promo', data, 'after'),
          url: data.links.promo,
        }}
      >
        {INVITE_BUTTON}
      </ShareButton>
    </div>
  );
}
