'use client';

import { useEffect } from 'react';
import { checkDraftOwner } from '@/lib/review-draft';

/** Removes review drafts after a logout or a change of account (lib/review-draft.ts). */
export function DraftJanitor({ owner }: { owner: string }) {
  useEffect(() => checkDraftOwner(owner), [owner]);
  return null;
}
