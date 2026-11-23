import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/public/ContactForm';
import { appUrl } from '@/emails/Layout';
import { Container } from '@/components/public/PageShell';
import { seoMetadata } from '@/lib/seo/meta';
import { BrandName, withBrand } from '@/components/ui/BrandName';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { CopyButton } from '@/components/public/CopyButton';
import { crawlerContactEmail } from '@/lib/contact';
import { crawlerUserAgent } from '@/lib/data/http';
import {
  cadenceLabel,
  effectiveMinDelaySeconds,
  HOST_PAUSE_HOURS,
  MAIL_EXCLUSION_HOURS,
  MAX_FAILURES,
  ROBOTS_CACHE_HOURS,
  ROBOTS_EXCLUSION,
} from '@/lib/data/robot-policy';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';

export function generateMetadata(): Metadata {
  return seoMetadata({
    title: 'À propos : sources, modération et contact | notetonmaster',
    description:
      'Qui fait notetonmaster, d’où viennent les données (Mon Master, France compétences, sites des universités), comment un avis est relu, et comment nous écrire.',
    canonical: '/a-propos',
  });
}

/**
 * Where the data comes from. The frequencies are those of the robot, read from the schedule of
 * the sources (DataSource.schedule, prisma/fixtures/sources.json): « Notre robot » shows the same.
 */
const SOURCES = [
  {
    name: 'Mon Master',
    text: 'Catalogue des masters et admission : candidatures, propositions et origine des admis. Données ouvertes du ministère.',
    keys: ['monmaster-opendata', 'monmaster-fiches'],
  },
  {
    name: 'France Compétences',
    text: 'Fiches RNCP : numéro, niveau et intitulé officiel de chaque mention, universités habilitées.',
    keys: ['rncp'],
  },
  {
    name: 'Sites des universités',
    text: 'Programmes, livrets pédagogiques, brochures. Lus uniquement quand les sites l’autorisent.',
    keys: ['univ-sites'],
    // Read every night, but a page is only downloaded again when it changed (ETag, Last-Modified).
    note: 'seules les pages modifiées sont relues',
  },
] as const;

/** What the robot reads, where, and how often (lib/connectors). */
const ROBOT_SOURCES = [
  {
    name: 'Mon Master',
    domain: 'monmaster.gouv.fr',
    text: 'La fiche détaillée de chaque parcours.',
    keys: ['monmaster-fiches'],
  },
  {
    name: 'Données du ministère',
    domain: 'data.enseignementsup-recherche.gouv.fr',
    text: 'Catalogue et admission Mon Master, établissements, insertion des diplômé·es, diplômes préparés.',
    keys: ['monmaster-opendata', 'esr-etablissements', 'insersup', 'sise-diplomes'],
  },
  {
    name: 'France compétences',
    domain: 'data.gouv.fr',
    text: 'Le fichier d’export des fiches RNCP, publié en données ouvertes.',
    keys: ['rncp'],
  },
  {
    name: 'Sites des universités',
    domain: 'pages publiques du catalogue',
    text: 'Présentation, programme, admission. Une page qui n’a pas changé n’est pas retéléchargée.',
    keys: ['univ-sites'],
  },
] as const;

const CARD = 'flex flex-col rounded-lg border border-border bg-surface-0 p-6 max-sm:p-5';
const H3 = 'm-0 font-display text-[22px] font-bold';

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
  const [minDelaySetting, sources] = await Promise.all([
    getSetting('collect.minDelaySeconds'),
    prisma.dataSource.findMany({ where: { enabled: true }, select: { key: true, schedule: true } }),
  ]);
  const minDelay = effectiveMinDelaySeconds(minDelaySetting);
  const schedule = new Map(sources.map((x) => [x.key, x.schedule]));
  const cadence = (keys: readonly string[]) =>
    cadenceLabel(keys.filter((k) => schedule.has(k)).map((k) => schedule.get(k)));
  const robotContact = crawlerContactEmail();
  const userAgent = crawlerUserAgent();
  const exclusionMail = `mailto:${robotContact}?subject=${encodeURIComponent('Exclure notre site')}`;
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
            {SOURCES.map((x) => {
              const when = cadence(x.keys);
              return (
                <li
                  key={x.name}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-5.5"
                >
                  <span className="font-display text-[20px] font-bold">{x.name}</span>
                  <span className="text-[15px] leading-[1.5]">{x.text}</span>
                  {when && (
                    <span className="mt-auto text-[13px] font-semibold text-ink-muted">
                      Mise à jour : {when.toLowerCase()}
                      {'note' in x ? `, ${x.note}` : ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-[15px] text-ink-muted">
            Chaque chiffre du site indique sa source et son année. Quand une donnée manque, on
            l’écrit plutôt que de l’inventer. Ces données sont lues par{' '}
            <Link href="#notre-robot">notre robot</Link>.
          </p>
        </section>

        <section
          id="notre-robot"
          aria-labelledby="notre-robot-titre"
          className="flex scroll-mt-24 flex-col gap-4.5"
        >
          <div className="flex max-w-[760px] flex-col gap-2">
            <h2
              id="notre-robot-titre"
              className="m-0 font-display text-[36px] font-extrabold tracking-[-0.03em]"
            >
              Notre robot
            </h2>
            <p className="m-0 text-[17px] leading-[1.55]">
              Un robot lit les données publiques des formations pour garder les fiches à jour. Il va
              lentement, respecte les règles de chaque site et ne garde aucune donnée personnelle.
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-stretch gap-3.5">
            <div className={cn(CARD, 'gap-1')}>
              <h3 className={cn(H3, 'mb-2')}>Ce qu’il lit</h3>
              <ul className="m-0 list-none p-0">
                {ROBOT_SOURCES.map((x) => {
                  const when = cadence(x.keys);
                  return (
                    <li
                      key={x.name}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-2 border-t border-border py-3.5 max-sm:grid-cols-1"
                    >
                      <span className="flex min-w-0 flex-col gap-0.75">
                        <span className="text-[16px] font-bold">{x.name}</span>
                        <span className="font-mono text-[12px] text-ink-muted [overflow-wrap:anywhere]">
                          {x.domain}
                        </span>
                        <span className="text-[14px] leading-[1.45]">{x.text}</span>
                      </span>
                      {when && (
                        <span className="self-start justify-self-start rounded-pill bg-surface-100 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-ink">
                          {when}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className={cn(CARD, 'gap-4')}>
              <h3 className={H3}>Comment il se comporte</h3>
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {(
                  [
                    [
                      'file',
                      'Respecte robots.txt',
                      <>
                        Relu au moins une fois toutes les {ROBOTS_CACHE_HOURS} h. Les réserves de
                        fouille de textes et de données (TDMRep) sont aussi respectées, sauf pour
                        l’export RNCP de data.gouv.fr.
                      </>,
                    ],
                    [
                      'clock',
                      'Une requête à la fois',
                      <>
                        Par site, avec au moins {minDelay} secondes d’écart. Plus, si le site fixe
                        un <code className="text-[13px] whitespace-nowrap">Crawl-delay</code>.
                      </>,
                    ],
                    [
                      'alert',
                      'Se retire en cas d’erreur',
                      <>
                        Après {MAX_FAILURES} erreurs d’affilée, il laisse le site tranquille pendant{' '}
                        {HOST_PAUSE_HOURS} heures.
                      </>,
                    ],
                    [
                      'lock',
                      'Aucune donnée personnelle',
                      <>
                        Jamais d’espace connecté ni de page personnelle. Adresses mail, téléphones
                        et noms des responsables sont retirés avant tout enregistrement.
                      </>,
                    ],
                  ] as const
                ).map(([icon, title, text]) => (
                  <li key={title} className="flex items-start gap-3.5">
                    <span
                      aria-hidden="true"
                      className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-violet-100 text-violet-700"
                    >
                      <Icon name={icon} size={20} />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-[16px] font-bold">{title}</span>
                      <span className="text-[14px] leading-[1.5]">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3.5">
            <div className="flex flex-col gap-3.5 rounded-lg bg-night p-6 text-on-night max-sm:p-5">
              <h3 className={H3}>Le reconnaître dans vos journaux</h3>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold tracking-[.06em] text-on-night-muted uppercase">
                  User-Agent
                </span>
                <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-white/10 px-3.5 py-3">
                  <code
                    data-testid="robot-user-agent"
                    className="min-w-0 flex-[1_1_260px] font-mono text-[13px] leading-[1.5] text-lime-400 [overflow-wrap:anywhere]"
                  >
                    {userAgent}
                  </code>
                  <CopyButton text={userAgent} label="Copier le User-Agent" />
                </div>
              </div>
              <p className="m-0 text-[14px] leading-[1.5]">
                Une question sur son passage ?{' '}
                <a
                  href={`mailto:${robotContact}`}
                  data-testid="robot-contact"
                  className="font-bold text-lime-400 [overflow-wrap:anywhere]"
                >
                  {robotContact}
                </a>
              </p>
            </div>

            <div className="flex flex-col gap-3.5 rounded-lg bg-lime-400 p-6 text-on-lime max-sm:p-5">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold tracking-[.06em] uppercase opacity-80">
                  Vous gérez le site d’une université ?
                </span>
                <h3 className={H3}>Exclure votre site</h3>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[14px] font-bold">
                  Option 1 · Dans votre robots.txt{' '}
                  <span className="font-medium">
                    (pris en compte sous {ROBOTS_CACHE_HOURS} h au plus)
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-night px-3.5 py-3">
                  <pre className="m-0 min-w-0 flex-[1_1_200px] font-mono text-[13px] leading-[1.6] whitespace-pre-wrap text-lime-400">
                    {ROBOTS_EXCLUSION}
                  </pre>
                  <CopyButton text={ROBOTS_EXCLUSION} label="Copier les lignes de robots.txt" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[14px] font-bold">
                  Option 2 · Par mail{' '}
                  <span className="font-medium">
                    (retiré de la collecte sous {MAIL_EXCLUSION_HOURS} h)
                  </span>
                </span>
                <a
                  href={exclusionMail}
                  className="inline-flex min-h-11 max-w-full items-center rounded-pill bg-night px-5 text-[15px] font-bold text-on-night no-underline [overflow-wrap:anywhere]"
                >
                  Écrire à {robotContact}
                </a>
              </div>
            </div>
          </div>
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
