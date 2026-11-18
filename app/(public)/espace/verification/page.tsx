import type { Metadata } from 'next';
import { VerificationMasters, type MasterToVerify } from '@/components/espace/VerificationMasters';
import { masterVerificationState } from '@/lib/domain/verification';
import { getEspace } from '@/lib/espace';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Vérification · Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

const H1 =
  'm-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]';

/** « Vérification »: master by master. ?parcours=slug opens that master. */
export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ parcours?: string }>;
}) {
  const [{ parcours }, e] = await Promise.all([searchParams, getEspace()]);
  const seen = new Set<string>();
  const masters: MasterToVerify[] = [];
  for (const r of e.reviews) {
    if (seen.has(r.programId)) continue;
    seen.add(r.programId);
    const mine = e.verifications.filter((v) => v.programId === r.programId);
    const approved = mine.find((v) => v.status === 'APPROVED');
    const refused = mine.find((v) => v.status === 'REJECTED' || v.status === 'MORE_INFO');
    const uni = r.program.university;
    masters.push({
      programId: r.programId,
      slug: r.program.slug,
      title: r.program.title,
      university: uni.name,
      domains: uni.emailDomains,
      review: r.title ?? r.program.title,
      state: masterVerificationState(r.programId, e.verifications),
      approvedHow: approved
        ? `${approved.method === 'UNIVERSITY_EMAIL' ? 'avec ton mail universitaire' : 'avec un justificatif'} le ${formatDate(approved.decidedAt ?? approved.createdAt)}`
        : null,
      refusal: refused?.reason ?? null,
      canReuseEmail: e.verifications.some(
        (v) =>
          v.status === 'APPROVED' &&
          v.method === 'UNIVERSITY_EMAIL' &&
          v.universityEmailHash &&
          v.programId !== r.programId &&
          v.program.universityId === uni.id,
      ),
    });
  }
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className={H1}>Vérification des parcours</h1>
        <span className="max-w-[680px] text-[15px] leading-[1.5] text-ink-muted">
          Le badge « Parcours vérifié » se gagne master par master : prouve une fois que tu as suivi
          chaque master sur lequel tu donnes un avis. Ça vaut pour tous tes avis sur ce master, même
          modifiés plus tard.
        </span>
      </div>
      <VerificationMasters masters={masters} openSlug={parcours} />
      <section className="flex flex-col gap-2 rounded-[24px] border border-border bg-surface-0 p-5.5">
        <h2 className="m-0 font-display text-[24px] font-extrabold tracking-[-0.02em]">
          Pourquoi master par master ?
        </h2>
        <span className="text-[15px] leading-[1.55]">
          Un mail universitaire prouve que tu étais dans cette université, un justificatif prouve le
          master suivi. Vérifier chaque master évite qu’un avis sur un autre master hérite du badge
          par erreur. Ton nom, ton mail et ton document ne sont jamais affichés ni conservés.
        </span>
      </section>
    </>
  );
}
