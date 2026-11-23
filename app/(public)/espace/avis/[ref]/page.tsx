import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EditReviewForm } from '@/components/espace/EditReviewForm';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Notice } from '@/components/ui/Notice';
import { getCurrentStudent } from '@/lib/auth/student';
import { prisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Modifier mon avis', robots: { index: false } };

export default async function EditReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const student = await getCurrentStudent();
  if (!student) redirect('/connexion');
  const { ref } = await params;
  const r = await prisma.review.findFirst({
    where: { ref, studentId: student.id },
    include: { scores: true, program: { select: { title: true } } },
  });
  if (!r) notFound();
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-5">
      <Breadcrumb
        items={[{ label: 'Mon espace', href: '/espace' }, { label: 'Modifier mon avis' }]}
      />
      <h1 className="m-0 font-display text-[clamp(32px,5vw,46px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
        {r.status === 'NEEDS_EDIT' ? 'Reformuler mon avis' : 'Modifier mon avis'}
      </h1>
      <p className="m-0 text-ink-muted">{r.program.title}</p>
      {r.status === 'NEEDS_EDIT' && r.moderationReason && (
        <Notice tone="warning" title="Message de la modération">
          {r.moderationReason}
        </Notice>
      )}
      {r.status === 'PUBLISHED' && (
        <Notice tone="info">
          Après modification, ton avis repasse en relecture avant d’être republié.
        </Notice>
      )}
      <EditReviewForm
        reviewId={r.id}
        editable={['PENDING', 'PUBLISHED', 'NEEDS_EDIT'].includes(r.status)}
        initial={{
          level: r.level,
          employmentStatus: r.employmentStatus ?? '',
          jobTitle: r.jobTitle ?? '',
          cohortYear: r.cohortYear,
          overallRating: r.overallRating,
          title: r.title ?? '',
          pros: r.pros,
          cons: r.cons,
          leaveReason: r.leaveReason ?? '',
          acceptsQuestions: r.acceptsQuestions,
          scores: Object.fromEntries(r.scores.map((s) => [s.criterion, s.score])),
        }}
      />
    </div>
  );
}
