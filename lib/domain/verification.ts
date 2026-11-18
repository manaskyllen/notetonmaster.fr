/**
 * "Parcours vérifié" badge rules: master by master, not by profile. A university
 * email only proves the university, and a student may have followed several masters.
 */
export interface ProgramVerificationLike {
  programId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MORE_INFO';
  method?: 'UNIVERSITY_EMAIL' | 'DOCUMENT';
  codeExpiresAt?: Date | null;
}

/** A review carries the badge when its author has an APPROVED verification of its program. */
export function isReviewVerified(programId: string, verifications: ProgramVerificationLike[]) {
  return verifications.some((v) => v.status === 'APPROVED' && v.programId === programId);
}

export type MasterVerificationState = 'approved' | 'pending' | 'code-sent' | 'refused' | 'none';

/**
 * State of one master in the « Vérification » tab: approved wins, then a document under review,
 * then a code waiting to be typed (still valid), then the latest refusal.
 */
export function masterVerificationState(
  programId: string,
  verifications: (ProgramVerificationLike & { createdAt?: Date })[],
  now = new Date(),
): MasterVerificationState {
  const mine = verifications.filter((v) => v.programId === programId);
  if (mine.some((v) => v.status === 'APPROVED')) return 'approved';
  if (mine.some((v) => v.status === 'PENDING' && v.method === 'DOCUMENT')) return 'pending';
  if (
    mine.some(
      (v) =>
        v.status === 'PENDING' &&
        v.method === 'UNIVERSITY_EMAIL' &&
        v.codeExpiresAt != null &&
        v.codeExpiresAt > now,
    )
  )
    return 'code-sent';
  const last = [...mine].sort(
    (x, y) => (y.createdAt?.getTime() ?? 0) - (x.createdAt?.getTime() ?? 0),
  )[0];
  return last && (last.status === 'REJECTED' || last.status === 'MORE_INFO') ? 'refused' : 'none';
}

/** « N master(s) vérifié(s) sur M » for the identity card ; « Tous tes masters vérifiés ». */
export function verifiedSummary(programIds: string[], verifications: ProgramVerificationLike[]) {
  const ids = [...new Set(programIds)];
  const verified = ids.filter((id) => isReviewVerified(id, verifications)).length;
  const total = ids.length;
  const label =
    total === 0
      ? 'Aucun master à vérifier'
      : verified === total
        ? total > 1
          ? 'Tous tes masters vérifiés'
          : 'Ton master est vérifié'
        : `${verified} master${verified > 1 ? 's' : ''} vérifié${verified > 1 ? 's' : ''} sur ${total}`;
  return { verified, total, label };
}

/** Returns the university whose recognised domains include the email domain (or a subdomain). */
export function matchUniversityDomain<U extends { id: string; emailDomains: string[] }>(
  email: string,
  universities: U[],
): U | null {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return null;
  return (
    universities.find((u) =>
      u.emailDomains.some(
        (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`),
      ),
    ) ?? null
  );
}

export const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** JPEG, PNG or PDF (lib/uploads.ts strips the photo metadata; WebP and HEIC are refused). */
export const DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
