'use client';

import { useEffect, useState } from 'react';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { FICHE_TAB_EVENT } from './ReviewsSummaryButton';

/** Tabs of the program page. Panels are rendered on the server and only shown/hidden here. */
export function ParcoursTabs({
  panels,
  questions,
  initial = 'avis',
}: {
  panels: Record<string, React.ReactNode>;
  /** Published public questions: « Questions (n) ». */
  questions: number;
  /** « questions » when the URL asks for a sort or a page of the questions. */
  initial?: string;
}) {
  const ITEMS = [
    { id: 'avis', label: 'Avis' },
    { id: 'questions', label: `Questions (${questions})` },
    { id: 'programme', label: 'Programme' },
    { id: 'admission', label: 'Admission' },
  ];
  const [tab, setTab] = useState(initial);
  // a link to « …#questions » (mail of an answer, digest), « …#avis » or « …#cursus » opens the tab; the
  // reviews summary of the hero asks for « avis » by an event
  useEffect(() => {
    // « #cursus » (the cursus chip of the hero, « Voir les cursus »): Admission, at its cursus.
    const toCursus = () => {
      setTab('admission');
      requestAnimationFrame(() => document.getElementById('cursus')?.scrollIntoView({ block: 'start' }));
    };
    const open = () => {
      if (window.location.hash === '#questions') setTab('questions');
      else if (window.location.hash === '#avis') setTab('avis');
      else if (window.location.hash === '#cursus') toCursus();
    };
    // A second click on a « #cursus » link changes no hash: handled here.
    const click = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('a[href="#cursus"]') && window.location.hash === '#cursus')
        toCursus();
    };
    const ask = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string') setTab(id);
    };
    open();
    window.addEventListener('hashchange', open);
    window.addEventListener(FICHE_TAB_EVENT, ask);
    document.addEventListener('click', click);
    return () => {
      document.removeEventListener('click', click);
      window.removeEventListener('hashchange', open);
      window.removeEventListener(FICHE_TAB_EVENT, ask);
    };
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <Tabs
        idPrefix="fiche"
        label="Sections de la fiche"
        items={ITEMS}
        value={tab}
        onChange={setTab}
        className="self-start"
      />
      {ITEMS.map((t) => (
        <TabPanel
          key={t.id}
          idPrefix="fiche"
          id={t.id}
          hidden={t.id !== tab}
          className="focus-visible:outline-offset-8"
        >
          {panels[t.id]}
        </TabPanel>
      ))}
    </div>
  );
}
