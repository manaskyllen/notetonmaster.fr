import type { Metadata } from 'next';
import { AnimationDemos } from './AnimationDemos';
import { notFound } from 'next/navigation';
import { isInsecureLocalProd } from '@/lib/env';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ChatBubble } from '@/components/ui/ChatBubble';
import { Code, DataTable } from '@/components/ui/DataTable';
import { DomainTile } from '@/components/ui/DomainTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Grade } from '@/components/ui/Grade';
import { GradePicker } from '@/components/ui/GradePicker';
import { Icon, ICON_NAMES } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Logo } from '@/components/ui/Logo';
import { Notice } from '@/components/ui/Notice';
import { PageSummary, Pagination, PerPageChoice } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultRow } from '@/components/ui/ResultRow';
import { ReviewCard } from '@/components/ui/ReviewCard';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { Select } from '@/components/ui/Select';
import { SelectivityMeter } from '@/components/ui/SelectivityMeter';
import { StatCard } from '@/components/ui/StatCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { Stepper } from '@/components/ui/Stepper';
import { Tag } from '@/components/ui/Tag';
import { TextField } from '@/components/ui/TextField';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { TopNav } from '@/components/ui/TopNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { InteractiveDemos } from './InteractiveDemos';
import { ProgramCard, type ProgramCardData } from '@/components/catalog/ProgramCard';
import { BrandName } from '@/components/ui/BrandName';

const DEMO_CARD: Omit<ProgramCardData, 'programId' | 'slug' | 'title'> = {
  universityId: 'demo-nantes',
  universityShort: 'Nantes Université',
  universityName: 'Nantes Université',
  cityName: 'Nantes',
  modalities: ['presentiel'],
  entryLevel: 'M1',
  durationYears: 2,
  isPublicSector: true,
  avgRating: 4.1,
  reviewCount: 12,
  recommendShare: 83,
};
const DEMO_CARDS: ProgramCardData[] = [
  {
    ...DEMO_CARD,
    programId: 'd1',
    slug: 'valorisation-des-nouveaux-patrimoines',
    title: 'Valorisation des nouveaux patrimoines',
  },
  {
    ...DEMO_CARD,
    programId: 'd2',
    slug: 'evenementiel-mediation-des-arts-et-des-sciences',
    title: 'Événementiel, médiation des arts et des sciences',
    universityShort: 'Paris-Saclay',
    cityName: 'Versailles',
    modalities: ['alternance'],
    entryLevel: 'M2',
    avgRating: 3.2,
    reviewCount: 4,
    recommendShare: 50,
  },
  {
    ...DEMO_CARD,
    programId: 'd3',
    slug: 'musees-bibliotheques-archives',
    title: 'Musées, bibliothèques, archives',
    universityShort: 'URCA',
    cityName: 'Troyes',
    modalities: ['presentiel', 'continue'],
    avgRating: null,
    reviewCount: 0,
    recommendShare: null,
  },
];

export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <h2 className="font-display text-[28px] font-extrabold tracking-[-0.03em]">{title}</h2>
      {children}
    </section>
  );
}

const row = 'flex flex-wrap items-center gap-3';

export default function DesignPage() {
  // Development, and the local production builds with the demo data (CI end-to-end tests:
  // tests/e2e/11-reduced-motion.spec.ts); never a real deployment (APP_URL must be local).
  if (process.env.NODE_ENV === 'production' && !isInsecureLocalProd()) notFound();

  return (
    <>
      <TopNav
        links={[
          { label: 'Explorer', href: '/explorer' },
          { label: 'Comparer', href: '/comparer' },
          { label: 'Mon espace', href: '/espace', badge: 2 },
        ]}
        active="/explorer"
      />
      <main className="mx-auto flex max-w-page flex-col gap-10 px-6 py-10 max-sm:px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-display-l max-sm:text-[40px]">Design system</h1>
            <p className="text-ink-muted">
              Tous les composants de /components/ui, dans leurs états. Page de développement.
            </p>
          </div>
          <ThemeSwitcher />
        </div>

        <Section title="Logo">
          <div className={row}>
            <span className="max-w-full overflow-x-auto">
              <Logo size="xl" />
            </span>
          </div>
          <div className={row}>
            <Logo size="l" />
            <Logo size="m" />
            <Logo size="s" />
          </div>
          <div className={row}>
            <span className="rounded-lg bg-night p-5">
              <Logo tone="dark" size="m" />
            </span>
            <span className="rounded-lg bg-violet-500 p-5">
              <Logo tone="dark" size="m" />
            </span>
            <span className="rounded-lg bg-coral-300 p-5">
              <Logo tone="coral" size="m" />
            </span>
            <span className="rounded-lg bg-surface-0 p-5">
              <Logo tone="mono" size="m" />
            </span>
            <span className="rounded-lg bg-surface-0 p-5">
              <Logo tone="outline" size="m" />
            </span>
          </div>
          <div className={row}>
            <Logo iconOnly size="l" />
            <Logo iconOnly size="m" />
            <Logo iconOnly size="s" />
            <Logo iconOnly size="xs" />
            <span className="rounded-md bg-night p-4">
              <Logo tone="dark" size="s" />
              <span className="mt-1 block text-[13px] text-on-night-muted">Administration</span>
            </span>
          </div>
        </Section>

        <Section title="Notes (Grade, GradePicker)">
          <p className="text-ink-muted">
            Jamais d’étoiles : le chiffre dans un bloc incliné dont le fond va du rouge (1) au vert
            (5), interpolé pour une moyenne.
          </p>
          <div className={row}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Grade key={n} value={n} />
            ))}
            <Grade value={4.1} size="l" />
            <Grade value={2.6} size="s" />
          </div>
          <GradePicker label="Ta note globale" defaultValue={4} help />
          <GradePicker ariaLabel="Encadrement" size="m" hideWord defaultValue={3} />
        </Section>

        <Section title="Icônes">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
            {ICON_NAMES.map((n) => (
              <span
                key={n}
                className="flex flex-col items-center gap-2 rounded-md bg-surface-0 p-3 text-[12px] text-ink-muted"
              >
                <Icon name={n} size={24} className="text-ink" />
                {n}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Boutons">
          {(['l', 'm', 's'] as const).map((s) => (
            <div key={s} className={row}>
              <Button size={s}>Donner mon avis</Button>
              <Button size={s} variant="night">
                Explorer
              </Button>
              <Button size={s} variant="lime" icon="plus">
                Ajouter
              </Button>
              <Button size={s} variant="outline" iconRight="arrow">
                Comparer
              </Button>
              <Button size={s} variant="ghost">
                Annuler
              </Button>
              <Button size={s} variant="danger" icon="trash">
                Supprimer
              </Button>
              <Button size={s} disabled>
                Désactivé
              </Button>
            </div>
          ))}
          <div className={row}>
            <Button href="/explorer" iconRight="arrow">
              Lien en bouton
            </Button>
            <IconButton icon="close" label="Fermer" />
            <IconButton icon="refresh" label="Relancer" variant="night" />
          </div>
        </Section>

        <Section title="Recherche, filtres, onglets, interrupteur, fichier, avis (interactifs)">
          <InteractiveDemos />
        </Section>

        <Section title="Champs">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Ton adresse mail"
              type="email"
              placeholder="ton.adresse@mail.fr"
              hint="On ne l’affiche jamais."
            />
            <TextField
              label="Adresse mail"
              type="email"
              defaultValue="pas-un-mail"
              error="Cette adresse ne semble pas valide."
            />
            <TextField
              label="Ce que tu as aimé"
              multiline
              placeholder="Les cours, les stages, l’ambiance…"
              hint="30 caractères minimum."
            />
            <Select
              label="Université"
              options={[
                { value: '', label: 'Toutes les universités' },
                { value: 'nantes', label: 'Nantes Université' },
                { value: 'saclay', label: 'Université Paris-Saclay' },
              ]}
            />
          </div>
        </Section>

        <Section title="Badges, tags, statuts">
          <div className={row}>
            <Badge kind="parcours" />
            <Badge kind="mention" />
            <Badge kind="universite" />
            <Badge>Brouillon</Badge>
          </div>
          <div className={row}>
            <Tag icon="pin">Nantes</Tag>
            <Tag>Présentiel</Tag>
            <Tag fill>Alternance</Tag>
          </div>
          <div className={row}>
            {(['ok', 'running', 'warning', 'stale', 'error', 'draft'] as const).map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </div>
        </Section>

        <Section title="Chiffres">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Places" value="19" hint="18 prises" />
            <StatCard label="Candidatures" value="320" tone="night" />
            <StatCard label="Propositions" value="47" tone="brand" />
            <StatCard label="Note moyenne" value="4,3" tone="lime" hint="sur 6 avis" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectivityMeter
              offers={47}
              applications={320}
              source={
                <>
                  Source : Mon Master, rentrée 2025. Calcul <BrandName />.
                </>
              }
            />
            <SelectivityMeter
              offers={null}
              applications={null}
              fallback="Taux d’accès 43 % (rentrée 2024)"
              source="Source : brochure URCA 2025."
            />
          </div>
          <div className="flex max-w-xl flex-col gap-3">
            <ScoreBar label="Contenu des cours" value={4.4} />
            <ScoreBar label="Stages" value={3.6} />
            <ScoreBar label="Débouchés" value={null} />
            <ProgressBar label="Récupération Mon Master" value={64} />
            <ProgressBar
              label="Programme publié"
              value={5}
              max={7}
              valueLabel="5 / 7"
              tone="success"
            />
            <ProgressBar label="Insertion" value={1} max={7} valueLabel="1 / 7" tone="warning" />
            <ProgressBar label="Erreurs" value={30} tone="danger" />
            <Stepper current={2} total={3} />
          </div>
        </Section>

        <Section title="Résultats et cartes">
          <ResultRow
            kind="parcours"
            title="Valorisation des nouveaux patrimoines"
            subtitle="Nantes Université · Nantes"
            href="/parcours/valorisation-des-nouveaux-patrimoines"
          />
          <ResultRow
            kind="mention"
            title="Culture, patrimoine et médiation"
            subtitle="7 parcours dans 3 universités"
            href="/mentions/culture-patrimoine-et-mediation"
          />
          <ResultRow
            kind="universite"
            title="Nantes Université"
            subtitle="Nantes · 4 parcours"
            href="/universites/nantes-universite"
          />
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_CARDS.map((p, i) => (
              <ProgramCard key={p.programId} p={p} index={i} />
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DomainTile title="Arts, lettres, langues" tone="violet" icon="book" href="#" />
            <DomainTile title="Droit, économie, gestion" tone="lime" icon="scale" href="#" />
            <DomainTile title="Sciences humaines et sociales" tone="coral" icon="users" href="#" />
            <DomainTile
              title="Sciences, technologies, santé"
              tone="night"
              icon="database"
              href="#"
            />
          </div>
          <ReviewCard
            level="M1"
            who="M1 · promo 2025"
            date="janvier 2026"
            rating={3}
            title="Programme dense, promo soudée"
            plus="Une promo petite et soudée, des intervenant·es du métier."
            minus="Beaucoup de cours en même temps au premier semestre, peu de temps pour le mémoire."
            verified={false}
          />
        </Section>

        <Section title="Messages, encarts, états vides">
          <div className="flex max-w-xl flex-col gap-3 rounded-lg bg-surface-100 p-4">
            <ChatBubble mine={false} time="il y a 2 h" from="Étudiant·e anonyme #4F2">
              Le stage de M2 est-il facile à trouver quand on ne connaît pas la région ?
            </ChatBubble>
            <ChatBubble mine time="à l’instant" from="Toi" masked>
              Oui, l’équipe aide beaucoup. Écris-moi à [coordonnées masquées].
            </ChatBubble>
          </div>
          <Notice tone="info" title="Comment lire ces chiffres">
            La sélectivité est un calcul <BrandName />, pas un taux officiel.
          </Notice>
          <Notice tone="warning" title="Programme ancien">
            Livret pédagogique 2022-2023.
          </Notice>
          <Notice tone="danger" title="Erreur">
            La récupération a échoué.
          </Notice>
          <Notice tone="success" title="Enregistré">
            Tes réglages sont à jour.
          </Notice>
          <Notice tone="example" title="Exemple">
            Ces avis sont fictifs.
          </Notice>
          <EmptyState
            title="Aucun avis pour l’instant"
            action={<Button href="/avis/nouveau">Donner le premier avis</Button>}
          >
            Tu es passé·e par ce parcours ? Ton retour aidera les prochain·es.
          </EmptyState>
        </Section>

        <Section title="Pagination">
          <p className="text-ink-muted">
            Liens réels (?page=6), courant en violet avec aria-current, ellipses (2 pages de chaque
            côté, la première et la dernière). Sous 640 px : « Précédent · Page 6 sur 42 · Suivant
            ».
          </p>
          <PageSummary page={6} perPage={20} total={837} noun="parcours" plural="parcours" />
          <Pagination pathname="/design-system" params={{}} page={6} perPage={20} total={837} />
          <Pagination pathname="/design-system" params={{}} page={1} perPage={20} total={95} />
          <PerPageChoice
            pathname="/design-system"
            params={{}}
            perPage={24}
            choices={[24, 48, 96]}
            defaultPerPage={24}
          />
        </Section>

        <Section title="Animations">
          <AnimationDemos />
        </Section>

        <Section title="Navigation et tableau">
          <Breadcrumb
            items={[
              { label: 'Accueil', href: '/' },
              { label: 'Culture, patrimoine et médiation', href: '#' },
              { label: 'Valorisation des nouveaux patrimoines' },
            ]}
          />
          <DataTable
            caption="Fiches"
            columns={[
              { key: 'name', label: 'Fiche' },
              { key: 'code', label: 'N° Mon Master', type: 'code' },
              { key: 'places', label: 'Places', align: 'right' },
              { key: 'status', label: 'Statut', type: 'status' },
            ]}
            rows={[
              {
                id: '1',
                name: 'Valorisation des nouveaux patrimoines',
                code: '2500101KDKQN',
                places: 19,
                status: 'stale',
              },
              { id: '2', name: 'EMAS', code: '2000144GANLI', places: 22, status: 'warning' },
              {
                id: '3',
                name: 'Musées, bibliothèques, archives',
                code: <Code>n.c.</Code>,
                places: 15,
                status: 'error',
              },
            ]}
          />
        </Section>
      </main>
      <section aria-label="Pied de page (SiteFooter)" className="flex flex-col">
        <h2 className="mx-auto w-full max-w-page px-6 font-display text-[28px] font-extrabold tracking-[-0.03em] max-sm:px-4">
          Pied de page (SiteFooter)
        </h2>
        <SiteFooter />
      </section>
    </>
  );
}
