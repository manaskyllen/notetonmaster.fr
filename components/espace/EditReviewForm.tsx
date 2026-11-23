'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckboxCard } from '@/components/ui/form/CheckboxCard';
import { ChoiceGroup } from '@/components/ui/form/Choice';
import { Field } from '@/components/ui/form/Field';
import { formCardClass, FormNav } from '@/components/ui/form/FormCard';
import { GradePicker } from '@/components/ui/GradePicker';
import { Input, NativeSelect, Textarea } from '@/components/ui/form/Controls';
import { Notice } from '@/components/ui/Notice';
import { CURRENT_YEAR, LEAVE_REASON_MAX, REVIEW_MIN_CHARS } from '@/lib/validation';
import {
  CRITERIA,
  CRITERION_LABEL,
  LEVEL_CHOICE,
  REVIEW_LEVEL_IDS,
  type CriterionKey,
  type ReviewLevelKey,
} from '@/lib/domain/rating';
import { detectNamedPerson } from '@/lib/domain/names';
import { TITLE_LABEL, TITLE_MAX, TITLE_PLACEHOLDER, titleHint } from '@/lib/domain/review-title';
import {
  EMPLOYMENT_LABEL,
  EMPLOYMENT_STATUSES,
  JOB_TITLE_HELP,
  JOB_TITLE_MAX,
  LEFT_HELP,
  LEFT_LABEL,
  LEFT_STATUSES,
  type EmploymentStatus,
} from '@/lib/domain/graduate';
import { updateMyReview } from '@/app/(public)/espace/actions';

type Values = {
  level: ReviewLevelKey;
  employmentStatus: '' | EmploymentStatus;
  jobTitle: string;
  cohortYear: number;
  overallRating: number;
  title: string;
  pros: string;
  cons: string;
  leaveReason: string;
  acceptsQuestions: boolean;
  scores: Partial<Record<CriterionKey, number>>;
};

const LEVELS = REVIEW_LEVEL_IDS.map((value) => ({ value, label: LEVEL_CHOICE[value] }));
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export function EditReviewForm({
  reviewId,
  initial,
  editable,
}: {
  reviewId: string;
  initial: Values;
  editable: boolean;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const left = v.level === 'LEFT';
  const hit = detectNamedPerson(v.title, v.pros, v.cons, left ? v.leaveReason : null);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));
  if (!editable) return <Notice tone="info">Cet avis ne peut plus être modifié.</Notice>;
  return (
    <form
      className={formCardClass}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateMyReview(reviewId, {
            ...v,
            leaveReason: left ? v.leaveReason : '',
          });
          if (r.ok) router.push('/espace/avis');
          else {
            setError(r.error);
            setErrors(r.fieldErrors ?? {});
          }
        });
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <ChoiceGroup
        legend="Tu es…"
        options={LEVELS}
        value={v.level}
        onChange={(l) =>
          // Another status: « Et aujourd'hui ? » starts again from nothing.
          l !== v.level && setV((x) => ({ ...x, level: l, employmentStatus: '', jobTitle: '' }))
        }
        error={errors.level}
      />
      {left && (
        <div className="nm-unfold">
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-surface-50 p-4.5">
            <ChoiceGroup
              legend={
                <>
                  Et aujourd’hui ?<span className="nm-label__optional"> (facultatif)</span>
                </>
              }
              variant="situation"
              options={LEFT_STATUSES.map((s) => ({ value: s, label: LEFT_LABEL[s] }))}
              value={v.employmentStatus}
              onChange={(s) => set('employmentStatus', s)}
              onClear={() => set('employmentStatus', '')}
              error={errors.employmentStatus}
            />
            <p className="nm-hint m-0">{LEFT_HELP}</p>
          </div>
        </div>
      )}
      {v.level === 'GRADUATE' && (
        <div className="nm-unfold">
          <div className="flex flex-col gap-3.5 rounded-[18px] bg-surface-50 p-4.5">
            <ChoiceGroup
              legend="Et aujourd’hui ?"
              variant="situation"
              options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: EMPLOYMENT_LABEL[s] }))}
              value={v.employmentStatus}
              onChange={(s) => set('employmentStatus', s)}
              error={errors.employmentStatus}
            />
            {v.employmentStatus === 'EMPLOYED' && (
              <Field label="Ton poste" hint={JOB_TITLE_HELP} error={errors.jobTitle}>
                {(a) => (
                  <Input
                    {...a}
                    maxLength={JOB_TITLE_MAX}
                    value={v.jobTitle}
                    onChange={(e) => set('jobTitle', e.target.value)}
                    placeholder="Ex. Chargée de médiation, musée municipal"
                  />
                )}
              </Field>
            )}
          </div>
        </div>
      )}
      <Field label="Entré·e en" className="max-w-[260px]" error={errors.cohortYear}>
        {(a) => (
          <NativeSelect
            {...a}
            value={String(Math.max(v.cohortYear, CURRENT_YEAR - 5))}
            onChange={(e) => set('cohortYear', Number(e.target.value))}
            options={YEARS.map((y) => ({
              value: String(y),
              label: y === CURRENT_YEAR - 5 ? `${y} ou avant` : String(y),
            }))}
          />
        )}
      </Field>
      <GradePicker
        label="Ta note globale"
        value={v.overallRating}
        onChange={(n) => set('overallRating', n)}
        help
      />
      {(
        [
          ['pros', 'Ce que tu as aimé'],
          ['cons', 'Ce que tu n’as pas aimé'],
        ] as const
      ).map(([k, l]) => {
        const n = v[k].trim().length;
        return (
          <Field
            key={k}
            label={l}
            error={errors[k]}
            hint={
              n >= REVIEW_MIN_CHARS
                ? 'C’est bon ✓'
                : `Encore ${REVIEW_MIN_CHARS - n} caractères au moins`
            }
            hintTone={n >= REVIEW_MIN_CHARS ? 'ok' : 'muted'}
          >
            {(a) => <Textarea {...a} value={v[k]} onChange={(e) => set(k, e.target.value)} />}
          </Field>
        );
      })}
      {left && (
        <Field
          label="Qu’est-ce qui t’a fait partir ?"
          optional
          hint="Reste général : évite les détails qui pourraient te faire reconnaître."
          error={errors.leaveReason}
        >
          {(a) => (
            <Textarea
              {...a}
              maxLength={LEAVE_REASON_MAX}
              value={v.leaveReason}
              onChange={(e) => set('leaveReason', e.target.value)}
              placeholder="Une réorientation, le contenu, l’ambiance, une opportunité…"
            />
          )}
        </Field>
      )}
      {/* Optional only for a review written before the title existed (none yet). */}
      <Field
        label={TITLE_LABEL}
        optional={!initial.title}
        hint={titleHint(v.title).text}
        hintTone={titleHint(v.title).tone}
        error={errors.title}
      >
        {(a) => (
          <Input
            {...a}
            maxLength={TITLE_MAX}
            value={v.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={TITLE_PLACEHOLDER}
          />
        )}
      </Field>
      {hit.found && (
        <div
          role="alert"
          className="rounded-[14px] bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
        >
          Ton texte semble citer une personne (« {hit.matches[0]} »). Parle plutôt du cours ou de
          l’organisation.
        </div>
      )}
      <fieldset className="m-0 flex min-w-0 flex-col border-0 border-t border-border p-0 pt-3.5">
        <legend className="sr-only">Notes détaillées (facultatif)</legend>
        <span className="nm-label mb-1" aria-hidden="true">
          Notes détaillées <span className="nm-label__optional">(facultatif)</span>
        </span>
        {CRITERIA.map((c) => (
          <div key={c} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="text-[15px] font-medium">{CRITERION_LABEL[c]}</span>
            <GradePicker
              ariaLabel={CRITERION_LABEL[c]}
              size="m"
              hideWord
              value={v.scores[c] ?? 0}
              onChange={(n) => set('scores', { ...v.scores, [c]: n })}
            />
          </div>
        ))}
      </fieldset>
      <CheckboxCard
        checked={v.acceptsQuestions}
        onChange={(e) => set('acceptsQuestions', e.target.checked)}
        title="Accepter que des étudiant·es me posent des questions"
      >
        Un bouton « Poser une question » apparaît sous ton avis. Tu reçois une notification par mail
        et dans ton espace ; personne ne voit ton adresse.
      </CheckboxCard>
      <FormNav>
        <Button variant="outline" size="form" href="/espace/avis">
          Annuler
        </Button>
        <Button type="submit" size="form" disabled={pending || hit.found}>
          {pending ? 'Enregistrement…' : 'Enregistrer et renvoyer en relecture'}
        </Button>
      </FormNav>
    </form>
  );
}
