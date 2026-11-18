import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/public/ContactForm';
import { appUrl } from '@/emails/Layout';
import { Container } from '@/components/public/PageShell';
import { seoMetadata } from '@/lib/seo/meta';
import { BrandName, Icon, withBrand } from '@/components/ui';

export function generateMetadata(): Metadata {
  return seoMetadata({
    title: 'À propos : sources, modération et contact | notetonmaster',
    description:
      'Qui fait notetonmaster, d’où viennent les données (Mon Master, France compétences, sites des universités), comment un avis est relu, et comment nous écrire.',
    canonical: '/a-propos',
  });
}

const SOURCES = [
  [
    'Mon Master',
    'Catalogue des masters et admission : candidatures, propositions et origine des admis. Données ouvertes du ministère.',
    'Mise à jour : chaque session',
  ],
  [
    'France Compétences',
    'Fiches RNCP : numéro, niveau et intitulé officiel de chaque mention, universités habilitées.',
    'Mise à jour : quotidienne',
  ],
  [
    'Sites des universités',
    'Programmes, livrets pédagogiques, brochures. Lus uniquement quand les sites l’autorisent.',
    'Mise à jour : mensuelle',
  ],
] as const;

const STEPS = [
  [
    '1',
    'Envoi',
    'Avec ou sans compte. Ton nom et ton adresse ne sont jamais affichés.',
    'bg-lime-400 text-on-lime',
  ],
  [
    '2',
    'Relecture',
    'Une personne de l’équipe relit l’avis sous 48 h, selon la charte.',
    'bg-coral-300 text-on-lime',
  ],
  [
    '3',
    'Publication',
    'L’avis apparaît, anonyme. Il porte le badge « Parcours vérifié » si l’auteur a prouvé son parcours (mail universitaire ou justificatif).',
    'bg-violet-100 text-ink',
  ],
] as const;

const FAQ = [
  [
    'Mon nom apparaît-il quelque part ?',
    'Non. Ton avis s’affiche avec ton niveau (M1, M2, diplômé·e) et ta promo. Ton adresse mail, si tu en donnes une, n’est jamais affichée.',
  ],
  [
    'Je n’ai plus accès à mon mail universitaire, je peux donner mon avis ?',
    'Oui. Tu peux publier sans compte, ou créer un espace avec ton mail perso. Pour obtenir le badge « Parcours vérifié », envoie un justificatif (diplôme, attestation de réussite, certificat de scolarité) : on le vérifie, puis on le supprime.',
  ],
  [
    'Une université peut-elle faire retirer un avis négatif ?',
    'Pas parce qu’il est négatif. Un avis n’est retiré que s’il enfreint la charte (il vise une personne, il est injurieux…) ou s’il est illicite. Chaque décision est motivée.',
  ],
  [
    'Pourquoi certaines données sont « n.c. » ?',
    'La source officielle ne les publie pas pour ce parcours, ou pas encore. On préfère l’écrire plutôt que d’afficher une estimation.',
  ],
  [
    'Ma formation n’est pas sur le site, que faire ?',
    'Écris-nous avec le formulaire ci-dessous en choisissant « Une formation manque ». On l’ajoute depuis le catalogue Mon Master.',
  ],
  [
    'Combien coûte notetonmaster ?',
    'Rien. Le site est gratuit, sans publicité et sans classement payant.',
  ],
] as const;

export default async function AProposPage({
  searchParams,
}: {
  searchParams: Promise<{ sujet?: string; parcours?: string }>;
}) {
  // « Le programme a changé ? Signale-le » / « Complétez la fiche » (fiche parcours) prefill the form
  const { sujet, parcours } = await searchParams;
  const subject =
    sujet === 'programme' || sujet === 'univ' || sujet === 'error' ? sujet : undefined;
  const link =
    parcours && /^[a-z0-9-]{1,120}$/.test(parcours)
      ? `${appUrl()}/parcours/${parcours}`
      : undefined;
  return (
    <main>
      <Container className="flex flex-col gap-14 pt-8 pb-20">
        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-xl bg-violet-500 px-10 py-11 text-on-violet max-sm:px-6">
          <div
            aria-hidden="true"
            className="absolute -right-12.5 -bottom-17.5 size-60 rounded-pill bg-lime-400"
          />
          <h1 className="relative m-0 max-w-[760px] font-display text-[clamp(36px,5vw,60px)] leading-none font-extrabold tracking-[-0.035em]">
            Choisir un master avec autre chose qu’une plaquette.
          </h1>
          <p className="relative m-0 max-w-[700px] text-[18px] leading-[1.5]">
            <BrandName /> rassemble les données publiques de chaque parcours et les retours de
            celles et ceux qui l’ont suivi. Le site est indépendant : aucune université ne paie pour
            y figurer ni pour changer ce qui s’affiche.
          </p>
        </section>

        <section id="sources" className="flex scroll-mt-24 flex-col gap-4.5">
          <h2 className="m-0 font-display text-[36px] font-extrabold tracking-[-0.03em]">
            D’où viennent les données
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-3.5">
            {SOURCES.map(([t, d, u]) => (
              <li
                key={t}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-5.5"
              >
                <span className="font-display text-[20px] font-bold">{t}</span>
                <span className="text-[15px] leading-[1.5]">{d}</span>
                <span className="mt-auto text-[13px] font-semibold text-ink-muted">{u}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[15px] text-ink-muted">
            Chaque chiffre du site indique sa source et son année. Quand une donnée manque, on
            l’écrit plutôt que de l’inventer.
          </p>
        </section>

        <section className="flex flex-col gap-4.5">
          <h2 className="m-0 font-display text-[36px] font-extrabold tracking-[-0.03em]">
            Comment un avis est publié
          </h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-3.5">
            {STEPS.map(([n, t, d, c]) => (
              <li key={n} className={`flex flex-col gap-2 rounded-lg p-5.5 ${c}`}>
                <span
                  aria-hidden="true"
                  className="font-display text-[40px] leading-none font-extrabold"
                >
                  {n}
                </span>
                <span className="font-display text-[22px] font-bold">{t}</span>
                <span className="text-[15px] leading-[1.5]">{d}</span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-[15px]">
            Tous les détails sont dans la <Link href="/legal/charte">charte de modération</Link>.
          </p>
        </section>

        <section className="flex flex-col gap-3.5">
          <h2 className="m-0 font-display text-[36px] font-extrabold tracking-[-0.03em]">
            Questions fréquentes
          </h2>
          <div className="flex flex-col gap-2.5">
            {FAQ.map(([q, a], i) => (
              <details
                key={q}
                open={i === 0}
                className="nm-faq group rounded-lg border border-border bg-surface-0"
              >
                <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{withBrand(q)}</span>
                  {/* « + » closed, « − » open. */}
                  {/* show/hide on wrappers: Icon's own inline-block would beat `hidden` */}
                  <span className="flex flex-none group-open:hidden">
                    <Icon name="plus" size={20} />
                  </span>
                  <span className="hidden flex-none group-open:flex">
                    <Icon name="minus" size={20} />
                  </span>
                </summary>
                <p className="m-0 px-5 pb-5 text-[16px] leading-[1.6] text-ink-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className="flex scroll-mt-24 flex-wrap items-start gap-6">
          <div className="flex flex-[1_1_320px] flex-col gap-3">
            <h2 className="m-0 font-display text-[36px] font-extrabold tracking-[-0.03em]">
              Nous écrire
            </h2>
            <p className="m-0 text-[16px] leading-[1.55] text-ink-muted">
              Une formation manque, une donnée est fausse, tu veux nous aider ? Réponse sous
              quelques jours. Pour un avis problématique, passe plutôt par{' '}
              <Link href="/signaler">Signaler un contenu</Link>.
            </p>
          </div>
          <div className="min-w-0 flex-[1_1_420px]">
            <ContactForm initialSubject={subject} initialLink={link} />
          </div>
        </section>
      </Container>
    </main>
  );
}
