'use client';

import { useState } from 'react';
import {
  Chip,
  FileInput,
  HelpfulButton,
  ReportLink,
  ReviewCard,
  SearchBar,
  Switch,
  TabPanel,
  Tabs,
} from '@/components/ui';

export function InteractiveDemos() {
  const [tab, setTab] = useState('avis');
  const [chip, setChip] = useState('tous');
  const [on, setOn] = useState(true);
  const [voted, setVoted] = useState(false);
  const [q, setQ] = useState('');

  return (
    <div className="flex flex-col gap-6">
      <SearchBar value={q} onChange={setQ} />
      <SearchBar size="m" placeholder="Chercher dans cette université…" />
      <div className="flex flex-wrap gap-2">
        {[
          ['tous', 'Tout', 12],
          ['parcours', 'Parcours', 7],
          ['mention', 'Mentions', 1],
          ['universite', 'Universités', 3],
        ].map(([id, label, n]) => (
          <Chip
            key={id}
            selected={chip === id}
            count={n as number}
            onClick={() => setChip(id as string)}
          >
            {label}
          </Chip>
        ))}
        <Chip variant="suggest">patrimoine nantes</Chip>
      </div>
      <Tabs
        idPrefix="demo"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'avis', label: 'Avis' },
          { id: 'questions', label: 'Questions (3)' },
          { id: 'programme', label: 'Programme' },
          { id: 'admission', label: 'Admission' },
        ]}
      />
      <TabPanel idPrefix="demo" id={tab}>
        <p className="text-ink-muted">Panneau « {tab} ».</p>
      </TabPanel>
      <div className="flex items-center gap-3">
        <Switch checked={on} onChange={setOn} label="Accepter les questions" />
        <span>Accepter les questions : {on ? 'oui' : 'non'}</span>
        <Switch checked={false} disabled label="Verrouillé" />
        <span className="text-ink-muted">verrouillé</span>
      </div>
      <FileInput
        name="doc"
        label="Justificatif (PDF ou image, 10 Mo max.)"
        hint="Certificat de scolarité, carte d’étudiant·e…"
        accept=".pdf,image/*"
        maxBytes={10 * 1024 * 1024}
      />
      <ReviewCard
        level="M2"
        who="M2 · promo 2025"
        date="mars 2026"
        rating={5}
        title="Le terrain avant tout"
        plus="Beaucoup de projets concrets avec des collectivités, et un voyage d’étude qui ouvre des portes."
        minus="Le second semestre est très chargé : stage et mémoire en même temps."
        verified
        openToQuestions
        actions={
          <>
            <HelpfulButton
              count={12 + (voted ? 1 : 0)}
              pressed={voted}
              onClick={() => setVoted((v) => !v)}
            />
            <ReportLink href="/signaler" />
          </>
        }
      />
    </div>
  );
}
