'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Button,
  CheckboxCard,
  ChoiceGroup,
  Field,
  formCardClass,
  FormNav,
  GradePicker,
  Input,
  NativeSelect,
  Notice,
  Textarea,
} from '@/components/ui';
import { CURRENT_YEAR, REVIEW_MIN_CHARS } from '@/lib/validation';
import { CRITERIA, CRITERION_LABEL, type CriterionKey } from '@/lib/domain/rating';
import { detectNamedPerson } from '@/lib/domain/names';
import {
  EMPLOYMENT_LABEL,
  EMPLOYMENT_STATUSES,
  JOB_TITLE_HELP,
  JOB_TITLE_MAX,
  type EmploymentStatus,
} from '@/lib/domain/graduate';
import { updateMyReview } from '@/app/(public)/espace/actions';

type Values = {
  level: 'M1' | 'M2' | 'GRADUATE';
  employmentStatus: '' | EmploymentStatus;
  jobTitle: string;
  cohortYear: number;
  overallRating: number;
  title: string;
  pros: string;
  cons: string;
  acceptsQuestions: boolean;
  scores: Partial<Record<CriterionKey, number>>;
};

const LEVELS: { value: Values['level']; label: string }[] = [
  { value: 'M1', label: 'En M1' },
  { value: 'M2', label: 'En M2' },
  { value: 'GRADUATE', label: 'Diplômé·e' },
];
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
  const hit = detectNamedPerson(v.title, v.pros, v.cons);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));
  if (!editable) return <Notice tone="info">Cet avis ne peut plus être modifié.</Notice>;
  return (
    <form
      className={formCardClass}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateMyReview(reviewId, v);
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
        onChange={(l) => set('level', l)}
        error={errors.level}
      />
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
      <Field label="Ton avis en une phrase" optional error={errors.title}>
        {(a) => (
          <Input
            {...a}
            value={v.title}
            maxLength={80}
            onChange={(e) => set('title', e.target.value)}
          />
        )}
      </Field>
      {(
        [
          ['pros', 'Ce que tu as aimé'],
          ['cons', 'Ce qui pourrait être mieux'],
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
