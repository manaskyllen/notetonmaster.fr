'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  Button,
  buttonClasses,
  CheckboxCard,
  ChoiceGroup,
  Field,
  FieldError,
  FormCard,
  FormNav,
  FormPreview,
  GradePicker,
  Input,
  Modal,
  NativeSelect,
  Notice,
  Stepper,
  StepTitle,
  Textarea,
  TurnstileNotice,
  useTurnstile,
} from '@/components/ui';
import { QUIT_REVIEW_EVENT } from '@/components/ui/TopNav';
import { cn } from '@/lib/cn';
import {
  anonymousOwner,
  readDrafts,
  removeDraft,
  writeDraft,
  type StoredDraft,
} from '@/lib/review-draft';
import {
  EMPLOYMENT_LABEL,
  EMPLOYMENT_STATUSES,
  JOB_TITLE_HELP,
  JOB_TITLE_MAX,
  type EmploymentStatus,
} from '@/lib/domain/graduate';
import { detectNamedPerson } from '@/lib/domain/names';
import { CRITERIA, CRITERION_LABEL, type CriterionKey } from '@/lib/domain/rating';
import {
  CURRENT_YEAR,
  REVIEW_MIN_CHARS,
  reviewStep1Checked,
  reviewStep2,
  reviewStep3,
} from '@/lib/validation';
import {
  confirmReviewByCode,
  resendReviewCode,
  submitReview,
  type SubmitResult,
} from '@/app/(public)/avis/actions';
import { requestLoginCode, verifyLoginCode } from '@/app/(public)/connexion/actions';
import { CodeEntry } from './CodeEntry';
import { MasterAutocomplete, type MasterOption } from './MasterAutocomplete';
import { useSearchShortcut } from './SearchShortcut';

export type ProgramOption = MasterOption;

type Level = 'M1' | 'M2' | 'GRADUATE';
type Mode = 'none' | 'account';

type Draft = {
  programSlug: string;
  level: '' | Level;
  employmentStatus: '' | EmploymentStatus;
  jobTitle: string;
  cohortYear: string;
  overallRating: number;
  pros: string;
  cons: string;
  scores: Partial<Record<CriterionKey, number>>;
  mode: Mode;
  email: string;
  acceptsQuestions: boolean;
  wantsBadge: boolean;
  charter: boolean;
};

const EMPTY: Draft = {
  programSlug: '',
  level: '',
  employmentStatus: '',
  jobTitle: '',
  cohortYear: '',
  overallRating: 0,
  pros: '',
  cons: '',
  scores: {},
  mode: 'none',
  email: '',
  acceptsQuestions: false,
  wantsBadge: true,
  charter: false,
};

const TITLES = ['Ton master', 'Ton avis', 'Comment publier ?'];
const LEVELS: { value: Level; label: string }[] = [
  { value: 'M1', label: 'En M1' },
  { value: 'M2', label: 'En M2' },
  { value: 'GRADUATE', label: 'Diplômé·e' },
];
// "2026 … 2022, 2021 ou avant".
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
/** #3B3648: halfway between ink and ink-muted, in both themes. */
const INK_SOFT = 'text-[color-mix(in_srgb,var(--ink)_50%,var(--ink-muted))]';

function lengthHint(value: string) {
  const n = value.trim().length;
  return n >= REVIEW_MIN_CHARS
    ? { text: 'C’est bon ✓', tone: 'ok' as const }
    : { text: `Encore ${REVIEW_MIN_CHARS - n} caractères au moins`, tone: 'muted' as const };
}

/** What a draft keeps: the fields typed, never the account address nor the charter tick. */
type DraftFields = Omit<Draft, 'email' | 'charter'> & { email?: string };

/** What is compared to decide whether the draft changed (not the email nor the charter). */
const snapshot = (program: string, step: number, d: Draft) =>
  JSON.stringify([
    program,
    step,
    d.level,
    d.employmentStatus,
    d.jobTitle,
    d.cohortYear,
    d.overallRating,
    d.pros,
    d.cons,
    d.scores,
    d.mode,
    d.acceptsQuestions,
    d.wantsBadge,
  ]);

function hasContent(d: Draft) {
  return !!(
    d.level ||
    d.employmentStatus ||
    d.jobTitle.trim() ||
    d.cohortYear ||
    d.overallRating ||
    d.pros.trim() ||
    d.cons.trim() ||
    Object.keys(d.scores).length
  );
}

export function ReviewForm({
  programs: initialPrograms,
  initialProgram,
  accountEmail,
  draftOwner,
}: {
  /** The program given in the URL (?parcours=…), if any: the others come from the search. */
  programs: ProgramOption[];
  initialProgram?: string;
  accountEmail: string | null;
  /** Owner of the drafts for an account (`c-…`); without account, an id of the tab. */
  draftOwner: string | null;
}) {
  // Programs whose title is known here: the one in the URL and those picked in the search.
  const [programs, setPrograms] = useState(initialPrograms);
  const [d, setD] = useState<Draft>(() => ({
    ...EMPTY,
    programSlug: initialProgram ?? '',
    mode: accountEmail ? 'account' : 'none',
    email: accountEmail ?? '',
  }));
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'nm-fwd' | 'nm-bwd'>('nm-fwd');
  const masterInput = useRef<HTMLInputElement>(null);
  // The only search of the form: ⌘K goes to the master field at step 1, does nothing after.
  useSearchShortcut({
    kind: 'focus',
    get: () => (step === 1 ? masterInput.current : null),
  });
  const turnstile = useTurnstile('review');
  const [detailOpen, setDetailOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  /** Review without account confirmed with the code of the mail. */
  const [confirmed, setConfirmed] = useState<'published' | 'pending' | null>(null);
  const [pending, start] = useTransition();
  // The draft is saved only once it has been read back, so a first render (or React's dev
  // double mount) never overwrites it with the empty form.
  const [restored, setRestored] = useState(false);
  const owner = useRef<string>('');
  /** Key of the draft being written, to move it when the master changes. */
  const savedAs = useRef<string | null>(null);
  /** Last content written: restoring a draft must not renew its 24 hours. */
  const written = useRef<string>('');
  const [banner, setBanner] = useState(false);
  /** ?parcours=X but the draft is about Y: « Le reprendre ? » */
  const [other, setOther] = useState<StoredDraft<DraftFields> | null>(null);
  const [quitTo, setQuitTo] = useState<string | null>(null);
  const sentRef = useRef(false);
  const router = useRouter();

  const fromDraft = (x: StoredDraft<DraftFields>) => {
    if (x.option)
      setPrograms((xs) => (xs.some((o) => o.slug === x.option!.slug) ? xs : [...xs, x.option!]));
    const restoredD: Draft = {
      ...EMPTY,
      ...x.fields,
      programSlug: x.program === '_' ? '' : x.program,
      mode: accountEmail ? 'account' : x.fields.mode === 'account' ? 'account' : 'none',
      email: accountEmail ?? x.fields.email ?? '',
      charter: false,
    };
    const restoredStep = Math.min(3, Math.max(1, x.step || 1));
    setD(restoredD);
    // At the start of the step it was on; never the confirmation screen.
    setStep(restoredStep);
    savedAs.current = x.program;
    written.current = snapshot(x.program, restoredStep, restoredD);
    setBanner(true);
  };

  useEffect(() => {
    owner.current = draftOwner ?? anonymousOwner();
    const drafts = readDrafts<DraftFields>(owner.current);
    const own = initialProgram ? drafts.find((x) => x.program === initialProgram) : drafts[0];
    if (own) fromDraft(own);
    else if (initialProgram) {
      const elsewhere = drafts.find((x) => x.program !== '_' && x.program !== initialProgram);
      if (elsewhere) setOther(elsewhere);
    }
    setRestored(true);
    // Read once per page: the props of this page do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (done || !restored || other) return;
    const program = d.programSlug || '_';
    if (savedAs.current && savedAs.current !== program) removeDraft(owner.current, savedAs.current);
    if (!hasContent(d)) {
      if (savedAs.current) removeDraft(owner.current, savedAs.current);
      savedAs.current = null;
      return;
    }
    const snap = snapshot(program, step, d);
    if (snap === written.current && savedAs.current === program) return;
    written.current = snap;
    const { charter: _c, email, ...fields } = d;
    void _c;
    writeDraft<DraftFields>({
      owner: owner.current,
      program,
      option: programs.find((o) => o.slug === d.programSlug) ?? null,
      step: step as 1 | 2 | 3,
      fields: accountEmail ? fields : { ...fields, email },
    });
    savedAs.current = program;
  }, [d, step, done, restored, other, programs, accountEmail]);

  const clearDraft = () => {
    if (savedAs.current) removeDraft(owner.current, savedAs.current);
    savedAs.current = null;
  };

  /** « Effacer » of the banner: an empty form, on the master of the URL if any. */
  const startOver = () => {
    clearDraft();
    setD({
      ...EMPTY,
      programSlug: initialProgram ?? '',
      mode: accountEmail ? 'account' : 'none',
      email: accountEmail ?? '',
    });
    setStep(1);
    setErrors({});
    setBanner(false);
  };

  // « Quitter » (header) with fields filled: keep or erase the draft first.
  useEffect(() => {
    const onQuit = (e: Event) => {
      if (done || !hasContent(d)) return;
      e.preventDefault();
      setQuitTo((e as CustomEvent<{ href: string }>).detail.href);
    };
    window.addEventListener(QUIT_REVIEW_EVENT, onQuit);
    return () => window.removeEventListener(QUIT_REVIEW_EVENT, onQuit);
  }, [d, done]);

  // Back to this page with the browser's back button after sending: never a stale form.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && sentRef.current) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));
  };
  const nameHit = useMemo(() => detectNamedPerson(d.pros, d.cons), [d.pros, d.cons]);
  const graduate = d.level === 'GRADUATE';
  const employed = graduate && d.employmentStatus === 'EMPLOYED';
  const jobNameHit = employed && detectNamedPerson(d.jobTitle).found;
  const program = programs.find((p) => p.slug === d.programSlug);
  const withAccount = d.mode === 'account';

  // The main action stays disabled until the step is valid.
  const valid = useMemo(
    () => ({
      1: reviewStep1Checked.safeParse(d).success && !jobNameHit,
      2: reviewStep2.safeParse(d).success && !nameHit.found,
      3: reviewStep3.safeParse(d).success,
    }),
    [d, nameHit.found, jobNameHit],
  );
  const blocked = !valid[step as 1 | 2 | 3];

  const next = () => {
    if (blocked) return;
    if (step < 3) {
      setDir('nm-fwd');
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setServerError(null);
    start(async () => {
      const turnstileToken = await turnstile.getToken();
      const r = await submitReview({
        ...d,
        title: '',
        cohortYear: Number(d.cohortYear),
        turnstileToken,
      });
      turnstile.reset();
      if (r.ok) {
        sentRef.current = true;
        clearDraft();
        setBanner(false);
        setDone(r);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setServerError(r.message ?? 'Une erreur est survenue.');
        setErrors(r.fieldErrors ?? {});
        if (
          r.fieldErrors?.programSlug ||
          r.fieldErrors?.employmentStatus ||
          r.fieldErrors?.jobTitle
        )
          setStep(1);
        else if (r.fieldErrors?.pros || r.fieldErrors?.cons || r.fieldErrors?.overallRating)
          setStep(2);
      }
    });
  };

  if (done) {
    const account = done.mode === 'account';
    const afterLogin = done.wantsBadge
      ? `/espace/verification?parcours=${encodeURIComponent(d.programSlug)}`
      : '/espace';
    return (
      <section
        role="status"
        className="nm-thanks flex flex-col items-start gap-4 rounded-[32px] bg-lime-400 p-10 text-on-lime"
      >
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-[20px] bg-night text-lime-400"
        >
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="nm-check-draw" pathLength={1} d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <h1 className="m-0 font-display text-[42px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Merci, c’est envoyé !
        </h1>
        <p className="m-0 text-[17px] leading-[1.5]">
          {confirmed
            ? confirmed === 'published'
              ? 'C’est confirmé : ton avis est publié.'
              : 'C’est confirmé : ton avis passe en relecture (48 h maximum). Tu recevras un mail quand il sera publié.'
            : account
              ? `Ton avis est en relecture (48 h maximum).${done.loggedIn ? '' : ' Saisis le code reçu par mail pour ouvrir ton espace.'}${done.wantsBadge ? ' Depuis ton espace, tu pourras prouver ton parcours pour obtenir le badge.' : ''}`
              : `Confirme ton avis avec le code envoyé à ${done.email}. Il passe ensuite en relecture (48 h maximum) et sera publié sans badge « Parcours vérifié ».${done.acceptsQuestions ? ' Les questions des étudiant·es t’arriveront par mail.' : ''}`}
        </p>
        {!confirmed && !(account && done.loggedIn) && (
          <div className="w-full max-w-[460px] rounded-[20px] bg-surface-0 p-5 text-ink">
            <CodeEntry
              compact
              email={done.email}
              turnstileForm={account ? 'login' : 'review'}
              submitLabel={account ? 'Ouvrir mon espace' : 'Confirmer mon avis'}
              verify={async (code) => {
                if (account) return verifyLoginCode(done.email, code);
                const r = await confirmReviewByCode(done.email, d.programSlug, code);
                if ('error' in r) return r;
                setConfirmed(r.published ? 'published' : 'pending');
              }}
              resend={async (token) => {
                if (!account) return resendReviewCode(done.email, d.programSlug, token);
                const fd = new FormData();
                fd.set('email', done.email);
                fd.set('next', afterLogin);
                if (token) fd.set('cf-turnstile-response', token);
                const r = await requestLoginCode({ status: 'idle' }, fd);
                return r.status === 'error' ? (r.message ?? 'Envoi impossible.') : null;
              }}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          {account && done.loggedIn && (
            <Link
              href={
                done.wantsBadge
                  ? `/espace/verification?parcours=${encodeURIComponent(d.programSlug)}`
                  : '/espace'
              }
              className={buttonClasses('night', 'form')}
            >
              {done.wantsBadge ? 'Faire vérifier mon parcours' : 'Voir mon espace'}
            </Link>
          )}
          <Link href="/explorer" className={buttonClasses('outline', 'form', 'text-on-lime')}>
            Explorer d’autres masters
          </Link>
        </div>
      </section>
    );
  }

  const prosHint = lengthHint(d.pros);
  const consHint = lengthHint(d.cons);
  const levelLabel = d.level === 'GRADUATE' ? 'Diplômé·e' : d.level;
  const badgePending = withAccount && d.wantsBadge;

  if (other)
    return (
      <section
        aria-labelledby="draft-ask"
        className="flex flex-col items-start gap-4 rounded-[28px] border border-border bg-surface-0 p-8 max-sm:p-5"
      >
        <h1
          id="draft-ask"
          className="m-0 font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em]"
        >
          Tu as un brouillon pour {other.option?.title ?? other.program}. Le reprendre ?
        </h1>
        <p className="m-0 text-[16px] text-ink-muted">
          Tu as ouvert le formulaire pour{' '}
          <strong>
            {programs.find((o) => o.slug === initialProgram)?.title ?? initialProgram}
          </strong>
          .
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button
            size="form"
            onClick={() => {
              const x = other;
              setOther(null);
              fromDraft(x);
              const url = new URL(window.location.href);
              url.searchParams.set('parcours', x.program);
              window.history.replaceState(window.history.state, '', url);
            }}
          >
            Reprendre
          </Button>
          <Button
            variant="outline"
            size="form"
            onClick={() => {
              // Starting another master: the other draft goes (one draft at a time).
              removeDraft(owner.current, other.program);
              setOther(null);
            }}
          >
            Commencer pour {programs.find((o) => o.slug === initialProgram)?.title ?? 'ce master'}
          </Button>
        </div>
      </section>
    );

  return (
    <div className="flex flex-col gap-5.5">
      {banner && (
        <p
          role="status"
          className="m-0 flex flex-wrap items-center gap-x-2 rounded-pill bg-violet-100 px-4 py-2.5 text-[14px] font-semibold text-violet-700 dark:text-ink"
        >
          Brouillon restauré ·
          <button
            type="button"
            onClick={startOver}
            className="min-h-6 cursor-pointer border-0 bg-transparent p-0 font-semibold text-inherit underline"
          >
            Effacer
          </button>
        </p>
      )}
      <Modal open={!!quitTo} onClose={() => setQuitTo(null)} labelledBy="quit-title">
        <div className="flex flex-col gap-4">
          <h2 id="quit-title" className="m-0 font-display text-[24px] font-extrabold">
            Garder ton brouillon ?
          </h2>
          <p className="m-0 text-[15px] text-ink-muted">
            Il reste sur cet appareil pendant 24 heures, pour toi seul·e.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button size="form" onClick={() => router.push(quitTo!)}>
              Garder le brouillon
            </Button>
            <Button
              variant="outline"
              size="form"
              onClick={() => {
                clearDraft();
                router.push(quitTo!);
              }}
            >
              Effacer
            </Button>
          </div>
        </div>
      </Modal>
      <div className="flex flex-col gap-2.5">
        <Stepper current={step} total={3} title={TITLES[step - 1]} />
        <StepTitle>{TITLES[step - 1]}</StepTitle>
      </div>

      <FormCard>
        {serverError && <Notice tone="danger">{serverError}</Notice>}

        <div key={step} className={cn('nm-stepin flex flex-col gap-5', dir)} data-step={step}>
          {step === 1 && (
            <>
              <MasterAutocomplete
                value={d.programSlug}
                onChange={(slug) => set('programSlug', slug)}
                onPick={(o) =>
                  setPrograms((xs) => (xs.some((x) => x.slug === o.slug) ? xs : [...xs, o]))
                }
                programs={programs}
                error={errors.programSlug}
                inputRef={masterInput}
              />
              <ChoiceGroup
                legend="Tu es…"
                options={LEVELS}
                value={d.level}
                onChange={(v) => set('level', v)}
                error={errors.level}
              />
              {graduate && (
                <div className="nm-unfold">
                  <div className="flex flex-col gap-3.5 rounded-[18px] bg-surface-50 p-4.5">
                    <ChoiceGroup
                      legend="Et aujourd’hui ?"
                      variant="situation"
                      options={EMPLOYMENT_STATUSES.map((s) => ({
                        value: s,
                        label: EMPLOYMENT_LABEL[s],
                      }))}
                      value={d.employmentStatus}
                      onChange={(v) => set('employmentStatus', v)}
                      error={errors.employmentStatus}
                    />
                    {employed && (
                      <div className="nm-unfold">
                        <Field
                          label="Ton poste"
                          id="jobtitle"
                          hint={JOB_TITLE_HELP}
                          error={
                            errors.jobTitle ||
                            (jobNameHit
                              ? 'Ne cite personne : un intitulé et un type de structure suffisent.'
                              : undefined)
                          }
                        >
                          {(a) => (
                            <Input
                              {...a}
                              maxLength={JOB_TITLE_MAX}
                              value={d.jobTitle}
                              onChange={(e) => set('jobTitle', e.target.value)}
                              placeholder="Ex. Chargée de médiation, musée municipal"
                            />
                          )}
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Field
                label="Entré·e en"
                id="promo"
                className="max-w-[260px]"
                error={errors.cohortYear}
              >
                {(a) => (
                  <NativeSelect
                    {...a}
                    value={d.cohortYear}
                    onChange={(e) => set('cohortYear', e.target.value)}
                    placeholder="Année…"
                    options={[
                      ...YEARS.map((y) => ({ value: String(y), label: String(y) })),
                      { value: String(CURRENT_YEAR - 5), label: `${CURRENT_YEAR - 5} ou avant` },
                    ]}
                  />
                )}
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-col gap-2">
                <GradePicker
                  label="Ta note globale"
                  value={d.overallRating}
                  onChange={(v) => set('overallRating', v)}
                  help
                  invalid={!!errors.overallRating}
                />
                <FieldError>{errors.overallRating}</FieldError>
              </div>
              <Field
                label="Ce que tu as aimé"
                id="plus"
                hint={prosHint.text}
                hintTone={prosHint.tone}
                error={errors.pros}
              >
                {(a) => (
                  <Textarea
                    {...a}
                    value={d.pros}
                    onChange={(e) => set('pros', e.target.value)}
                    placeholder="Les cours, les stages, l’ambiance…"
                  />
                )}
              </Field>
              <Field
                label="Ce qui pourrait être mieux"
                id="minus"
                hint={consHint.text}
                hintTone={consHint.tone}
                error={errors.cons}
              >
                {(a) => (
                  <Textarea
                    {...a}
                    value={d.cons}
                    onChange={(e) => set('cons', e.target.value)}
                    placeholder="L’organisation, la charge de travail…"
                  />
                )}
              </Field>
              {nameHit.found && (
                <div
                  role="alert"
                  className="rounded-[14px] bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
                >
                  Ton texte semble citer une personne (« {nameHit.matches[0]} »). Parle plutôt du
                  cours ou de l’organisation.
                </div>
              )}
              <div className="flex flex-col gap-2 border-t border-border pt-3.5">
                <button
                  type="button"
                  aria-expanded={detailOpen}
                  aria-controls="criteria"
                  onClick={() => setDetailOpen((o) => !o)}
                  className="min-h-tap cursor-pointer self-start border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-violet-500"
                >
                  {detailOpen
                    ? '− Masquer les notes détaillées'
                    : '+ Ajouter des notes détaillées (facultatif)'}
                </button>
                <div
                  id="criteria"
                  className="nm-collapse data-[open=false]:-mt-2"
                  data-open={detailOpen}
                >
                  <div className="flex flex-col">
                    {CRITERIA.map((c) => (
                      <div
                        key={c}
                        className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                      >
                        <span className="text-[15px] font-medium">{CRITERION_LABEL[c]}</span>
                        <GradePicker
                          ariaLabel={CRITERION_LABEL[c]}
                          size="m"
                          hideWord
                          value={d.scores[c] ?? 0}
                          onChange={(v) => set('scores', { ...d.scores, [c]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4.5">
              {accountEmail ? (
                <Notice tone="info" title="Tu es connecté·e">
                  Ton avis sera rattaché à ton espace ({accountEmail.replace(/^(.).*@/, '$1•••@')}).
                  Tu pourras le modifier ou le supprimer.
                </Notice>
              ) : (
                <ChoiceGroup
                  ariaLabel="Façon de publier"
                  variant="mode"
                  value={d.mode}
                  onChange={(v) => set('mode', v)}
                  error={errors.mode}
                  options={[
                    {
                      value: 'none',
                      label: 'Sans compte',
                      description:
                        'Le plus rapide. Tu ne pourras pas modifier ton avis toi-même ensuite.',
                      tag: (
                        <span
                          className={cn(
                            'self-start rounded-pill bg-surface-100 px-2.5 py-1 text-[12px] font-bold',
                            INK_SOFT,
                          )}
                        >
                          Publié sans badge
                        </span>
                      ),
                    },
                    {
                      value: 'account',
                      label: 'Avec mon espace',
                      description:
                        'Pour modifier ou supprimer ton avis plus tard, avec n’importe quelle adresse mail.',
                      tag: (
                        <span className="self-start rounded-pill bg-lime-100 px-2.5 py-1 text-[12px] font-bold text-lime-800">
                          Badge « Parcours vérifié » possible
                        </span>
                      ),
                    },
                  ]}
                />
              )}

              {!accountEmail && (
                <Field
                  label="Ton adresse mail (perso ou universitaire)"
                  id="mail"
                  error={errors.email}
                  hint={
                    withAccount
                      ? 'Pour te connecter par un lien, sans mot de passe. Jamais affichée.'
                      : 'Pour confirmer ton avis d’un clic et te prévenir de sa publication. Jamais affichée.'
                  }
                >
                  {(a) => (
                    <Input
                      {...a}
                      type="email"
                      autoComplete="email"
                      value={d.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="ton.adresse@mail.fr"
                    />
                  )}
                </Field>
              )}

              <CheckboxCard
                checked={d.acceptsQuestions}
                onChange={(e) => set('acceptsQuestions', e.target.checked)}
                title="Accepter que des étudiant·es me posent des questions"
              >
                {withAccount
                  ? 'Un bouton « Poser une question » apparaît sous ton avis. Tu reçois une notification par mail et dans ton espace ; personne ne voit ton adresse. Tu peux arrêter quand tu veux.'
                  : 'Un bouton « Poser une question » apparaît sous ton avis. Tu reçois les questions par mail et tu réponds via un lien sécurisé ; personne ne voit ton adresse.'}
              </CheckboxCard>

              {withAccount && (
                <CheckboxCard
                  variant="tint"
                  checked={d.wantsBadge}
                  onChange={(e) => set('wantsBadge', e.target.checked)}
                  title="Obtenir le badge « Parcours vérifié »"
                >
                  Après l’envoi, prouve que tu as suivi ce master : une adresse mail de son
                  université, ou un justificatif qui le mentionne (diplôme, relevé de notes,
                  certificat de scolarité). Si ce master est déjà vérifié dans ton espace, le badge
                  s’applique directement. Le justificatif est supprimé dès qu’on l’a vérifié.
                </CheckboxCard>
              )}

              <FormPreview>
                <span className="text-[13px] text-ink-muted">Ton avis apparaîtra ainsi</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">
                    Anonyme · {levelLabel} · promo {d.cohortYear}
                  </span>
                  {graduate && d.employmentStatus && (
                    <span className={cn('text-[14px]', INK_SOFT)}>
                      {employed
                        ? `En poste · ${d.jobTitle.trim()}`
                        : EMPLOYMENT_LABEL[d.employmentStatus]}
                    </span>
                  )}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold',
                      badgePending ? 'bg-success-bg text-success' : cn('bg-surface-100', INK_SOFT),
                    )}
                  >
                    {badgePending
                      ? 'Parcours vérifié (après vérification)'
                      : 'Non vérifié · relu par l’équipe'}
                  </span>
                  {d.acceptsQuestions && (
                    <span className="rounded-pill bg-violet-100 px-2.5 py-1 text-[12px] font-bold text-violet-700">
                      Ouvert aux questions
                    </span>
                  )}
                </span>
                <span className={cn('text-[14px]', INK_SOFT)}>
                  {program?.title} · {d.overallRating} / 5
                </span>
              </FormPreview>

              <div className="flex flex-col gap-2">
                <CheckboxCard
                  variant="plain"
                  checked={d.charter}
                  onChange={(e) => set('charter', e.target.checked)}
                  aria-invalid={errors.charter ? true : undefined}
                >
                  Je parle de ma propre expérience et je respecte la{' '}
                  <Link href="/legal/charte" target="_blank">
                    charte
                  </Link>
                  .
                </CheckboxCard>
                <FieldError>{errors.charter}</FieldError>
              </div>
              {turnstile.field}
              <TurnstileNotice />
            </div>
          )}
        </div>

        <FormNav>
          <Button
            variant="outline"
            size="form"
            disabled={step === 1 || pending}
            onClick={() => {
              setDir('nm-bwd');
              setStep(Math.max(1, step - 1));
            }}
          >
            Retour
          </Button>
          <Button variant="primary" size="form" onClick={next} disabled={blocked || pending}>
            {pending ? 'Envoi…' : step === 3 ? 'Envoyer mon avis' : 'Continuer'}
          </Button>
        </FormNav>
      </FormCard>
      <p className="m-0 text-center text-[13px] text-ink-muted">
        Chaque avis est relu par l’équipe avant publication (48 h maximum).
      </p>
    </div>
  );
}
