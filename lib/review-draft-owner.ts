import 'server-only';
import { hmac } from '@/lib/crypto';

/** Owner of the review drafts of an account: a keyed hash, never the id itself. */
export const draftOwnerOf = (studentId: string) => `c-${hmac(`draft:${studentId}`).slice(0, 20)}`;
