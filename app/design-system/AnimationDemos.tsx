'use client';

import { useState } from 'react';
import { FollowButton } from '@/components/public/FollowButton';
import {
  Button,
  Chip,
  CountUp,
  CtaArrow,
  ctaClasses,
  GradePicker,
  HelpfulButton,
  ProgressBar,
  ScoreBar,
  SelectivityMeter,
  Skeleton,
  Stepper,
  Toast,
} from '@/components/ui';

const row = 'flex flex-wrap items-center gap-4';

/** Every animation of the site, live (docs/animations.md lists them with their source). */
export function AnimationDemos() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [vote, setVote] = useState({ count: 14, on: false, party: false });
  const [count, setCount] = useState(3);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(0);
  const [progress, setProgress] = useState(30);
  return (
    <div className="flex flex-col gap-6">
      <div className={row}>
        <a href="#" className={ctaClasses('night', 'm')}>
          Donner mon avis
          <CtaArrow />
        </a>
        <Button loading={loading} onClick={() => setLoading(true)}>
          {loading ? 'Envoi…' : 'Bouton (cliquer : chargement)'}
        </Button>
        {loading && (
          <Button variant="ghost" onClick={() => setLoading(false)}>
            Arrêter
          </Button>
        )}
      </div>
      <div className={row}>
        <span className="rounded-lg bg-violet-500 p-3">
          <FollowButton programId="demo" title="Démo" initial={false} loggedIn demo />
        </span>
        <FollowButton variant="icon" programId="demo2" title="Démo" initial={false} loggedIn demo />
        <HelpfulButton
          count={vote.count}
          pressed={vote.on}
          celebrate={vote.party}
          onClick={() =>
            setVote((v) => ({ count: v.count + (v.on ? -1 : 1), on: !v.on, party: !v.on }))
          }
        />
        <Chip count={count} onClick={() => setCount((c) => c + 1)}>
          Compteur qui change
        </Chip>
      </div>
      <div className="flex max-w-[520px] flex-col gap-3">
        <Stepper current={step} total={3} title={`Étape ${step}`} />
        <span className={row}>
          <Button variant="outline" size="s" onClick={() => setStep((s) => Math.max(1, s - 1))}>
            Retour
          </Button>
          <Button size="s" onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Continuer
          </Button>
        </span>
        <GradePicker label="Note (couleur, rebond)" help />
      </div>
      <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-0 p-5">
          <ScoreBar label="Encadrement" value={4.2} />
          <ProgressBar label="Récupération" value={progress} />
          <Button
            size="s"
            variant="outline"
            onClick={() => setProgress((p) => (p >= 100 ? 10 : p + 30))}
          >
            Avancer la barre
          </Button>
        </div>
        <SelectivityMeter offers={47} applications={320} source="Démo" />
        <div className="flex flex-col gap-1 rounded-lg bg-lime-400 p-5 text-on-lime">
          <span className="text-[14px] font-semibold">Chiffre clé</span>
          <span className="font-display text-[44px] leading-none font-extrabold">
            <CountUp value={348} />
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20" />
        </div>
      </div>
      <div className="flex max-w-[520px] flex-col gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-tap cursor-pointer items-center gap-2 self-start border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-violet-500"
        >
          Section repliable
          <svg
            className="nm-chevron"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="nm-collapse" data-open={open}>
          <div className="rounded-md bg-surface-100 p-4 text-[15px]">
            Contenu déplié en hauteur (grid-template-rows 0fr → 1fr) avec un fondu.
          </div>
        </div>
        <Button
          size="s"
          variant="night"
          onClick={() => setToast((t) => t + 1)}
          className="self-start"
        >
          Afficher un toast (4 s)
        </Button>
        {toast > 0 && (
          <Toast key={toast} message="Action enregistrée." onDone={() => setToast(0)} />
        )}
      </div>
      <p className="m-0 max-w-[680px] text-[14px] text-ink-muted">
        Aussi en place sur le site : résultats qui tombent (accueil), palette ⌘K (fiches),
        autocomplétion et glissement des étapes (formulaire d’avis), cartes qui montent au survol,
        modales et feuille mobile, messages qui arrivent, menu mobile, fondu entre pages, thème.
        Tout est coupé ou réduit à un fondu sous « réduire les animations ».
      </p>
    </div>
  );
}
