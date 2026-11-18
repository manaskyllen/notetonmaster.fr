/**
 * Matching Mon Master formations to program fiches (decisions 1 and 3).
 * Pure: the caller loads the programs and the decisions.
 *
 * Per formation (`ifc`, all its sessions together):
 * 1. a stored decision wins (LINK / MERGE / NEW / IGNORE);
 * 2. a known `ifc` (MonMasterEntry) links to its program;
 * 3. several `ifc` for the same parcours in the same session (same UAI, `inmp`, places and
 *    modality, the ACPCI case) → each number stays a separate fiche until a human decides, with a
 *    merge proposal towards the first one (never an automatic merge); « recommended » only in a
 *    group of 2 numbers with identical normalised titles, never for an MEEF mention (decision B);
 * 4. same UAI + `inmp` as a program not yet seen in that session → linked (new number, same parcours);
 * 5. score on UAI + normalised title + commune: automatic link only when the UAI and the commune
 *    are the same, the titles are identical and the score ≥ autoLink (0.97); proposal from
 *    `propose` (0.75) — this is how a re-accreditation (Nantes, Troyes) shows up;
 * 6. otherwise a new fiche, but only for formations of the latest session: a formation that only
 *    exists in older sessions is history, it does not create a fiche. A fiche created in this run
 *    has the virtual id `new:<ifc>`, so older numbers of the same parcours can be linked to it.
 */
import { normCity, normProgramTitle, similarity, titleScore } from '@/lib/data/normalize';
import type { Thresholds } from '@/lib/data/match';
import { isMeef, specificPlaces, type MMRecord } from './normalize';

export interface ProgramRef {
  id: string;
  universityId: string;
  titleKey: string;
  cityKey: string;
  workStudy: boolean;
  entries: { ifc: string; inmp: string | null; sessions: number[] }[];
}

export interface Decision {
  decision: 'LINK' | 'NEW' | 'IGNORE' | 'MERGE';
  targetId: string | null;
  author: string;
}

export type FormationMatch =
  | { status: 'LINKED'; programId: string; score: number; reason: string }
  | { status: 'PROPOSED'; programId: string; score: number; reason: string }
  | {
      status: 'NEW';
      score: number;
      reason: string;
      /** Same parcours as another number of the session: a separate fiche, and a merge proposal (decision B). */
      merge?: {
        withIfc: string;
        programId: string | null;
        recommended: boolean;
        groupSize: number;
      };
    }
  | { status: 'IGNORED'; score: number; reason: string };

export interface MatchInput {
  records: MMRecord[]; // every session
  programs: ProgramRef[];
  /** University fiche id for an UAI (null when the university does not exist yet). */
  universityOf: (uai: string, paysage: string | null) => string | null;
  decisions: Map<string, Decision>; // key: `ifc:<ifc>`
  thresholds: Thresholds;
}

const siblingKey = (r: MMRecord) =>
  [
    r.session,
    r.uai,
    r.inmp ?? `∅${r.ifc}`,
    specificPlaces(r)
      .map((p) => `${normCity(p.commune)}:${normProgramTitle(p.label)}`)
      .sort()
      .join('+'),
    r.workStudy ? 'A' : 'P',
  ].join('|');

const communeOf = (r: MMRecord) => normCity(specificPlaces(r)[0]?.commune ?? '');

export function matchFormations(input: MatchInput): Map<string, FormationMatch> {
  const { records, programs, decisions, thresholds: t } = input;
  const latest = Math.max(...records.map((r) => r.session));
  const byIfc = new Map<string, MMRecord[]>();
  for (const r of records) byIfc.set(r.ifc, [...(byIfc.get(r.ifc) ?? []), r]);
  for (const list of byIfc.values()) list.sort((a, b) => b.session - a.session);

  const programById = new Map(programs.map((p) => [p.id, p]));
  const programOfIfc = new Map<string, string>();
  for (const p of programs) for (const e of p.entries) programOfIfc.set(e.ifc, p.id);
  const byUni = new Map<string, ProgramRef[]>();
  for (const p of programs) byUni.set(p.universityId, [...(byUni.get(p.universityId) ?? []), p]);

  // A program "claimed" for a session already has a formation of this batch in that session.
  const claimed = new Map<string, Set<number>>();
  const claim = (programId: string, sessions: number[]) => {
    const s = claimed.get(programId) ?? new Set<number>();
    for (const x of sessions) s.add(x);
    claimed.set(programId, s);
  };
  const isFree = (programId: string, sessions: number[]) =>
    !sessions.some((s) => claimed.get(programId)?.has(s));

  const out = new Map<string, FormationMatch>();
  const sessionsOf = (ifc: string) => byIfc.get(ifc)!.map((r) => r.session);

  // 1-2. decisions and known numbers first: they claim their programs.
  for (const [ifc] of byIfc) {
    const d = decisions.get(`ifc:${ifc}`);
    if (d) {
      if (d.decision === 'MERGE' && d.targetId?.startsWith('ifc:')) continue; // resolved after the others
      if (
        (d.decision === 'LINK' || d.decision === 'MERGE') &&
        d.targetId &&
        programById.has(d.targetId)
      ) {
        out.set(ifc, {
          status: 'LINKED',
          programId: d.targetId,
          score: 1,
          reason: `décision de ${d.author}`,
        });
        claim(d.targetId, sessionsOf(ifc));
      } else if (d.decision === 'NEW')
        out.set(ifc, {
          status: 'NEW',
          score: 0,
          reason: `décision de ${d.author} : nouvelle fiche`,
        });
      else if (d.decision === 'IGNORE')
        out.set(ifc, { status: 'IGNORED', score: 0, reason: `décision de ${d.author} : ignoré` });
      continue;
    }
    const known = programOfIfc.get(ifc);
    if (known) {
      out.set(ifc, {
        status: 'LINKED',
        programId: known,
        score: 1,
        reason: `n° Mon Master ${ifc} déjà connu`,
      });
      claim(known, sessionsOf(ifc));
    }
  }

  // 3. siblings in the latest session (same parcours, several numbers).
  const groups = new Map<string, string[]>();
  for (const [ifc, list] of byIfc) {
    const head = list[0]!;
    if (head.session !== latest) continue;
    const k = siblingKey(head);
    groups.set(k, [...(groups.get(k) ?? []), ifc]);
  }
  const mergeInto = new Map<string, string>(); // sibling ifc → canonical ifc
  const groupSize = new Map<string, number>();
  for (const ifcs of groups.values()) {
    if (ifcs.length < 2) continue;
    // canonical: an already linked one, else the smallest number
    const sorted = [...ifcs].sort();
    const canonical = sorted.find((i) => out.get(i)?.status === 'LINKED') ?? sorted[0]!;
    for (const i of sorted) {
      groupSize.set(i, ifcs.length);
      if (i !== canonical) mergeInto.set(i, canonical);
    }
  }
  // Canonical numbers are matched before their siblings.
  const isSibling = (ifc: string) => mergeInto.has(ifc);

  // 4-6. the others, latest session first (they may create fiches), then history.
  const deferred = [...byIfc.keys()].filter((ifc) =>
    decisions.get(`ifc:${ifc}`)?.targetId?.startsWith('ifc:'),
  );
  const pending = [...byIfc.keys()].filter((ifc) => !out.has(ifc) && !deferred.includes(ifc));
  pending.sort(
    (a, b) =>
      Number(byIfc.get(b)![0]!.session === latest) - Number(byIfc.get(a)![0]!.session === latest) ||
      Number(isSibling(a)) - Number(isSibling(b)) ||
      a.localeCompare(b),
  );
  const addVirtual = (
    ifc: string,
    uni: string,
    r: MMRecord,
    commune: string,
    sessions: number[],
  ) => {
    // The fiche created for this formation can receive the history of older numbers (virtual id).
    const virtual: ProgramRef = {
      id: `new:${ifc}`,
      universityId: uni,
      titleKey: r.titleKey,
      cityKey: commune,
      workStudy: r.workStudy,
      entries: [{ ifc, inmp: r.inmp, sessions }],
    };
    byUni.set(uni, [...(byUni.get(uni) ?? []), virtual]);
    programById.set(virtual.id, virtual);
    claim(virtual.id, sessions);
  };
  for (const ifc of pending) {
    const list = byIfc.get(ifc)!;
    const r = list[0]!;
    const sessions = sessionsOf(ifc);
    const uni = input.universityOf(r.uai, r.paysage) ?? `uai:${r.uai}`;
    const canonical = mergeInto.get(ifc);
    if (canonical) {
      const target = out.get(canonical);
      const canonRec = byIfc.get(canonical)![0]!;
      const score = similarity(r.titleKey, canonRec.titleKey);
      const size = groupSize.get(ifc) ?? 2;
      out.set(ifc, {
        status: 'NEW',
        score,
        reason: `fiche séparée ; fusion proposée avec ${canonical} (même UAI, inmp, lieu et modalité)`,
        merge: {
          withIfc: canonical,
          programId: target?.status === 'LINKED' ? target.programId : null,
          recommended: size === 2 && r.titleKey === canonRec.titleKey && !isMeef(r),
          groupSize: size,
        },
      });
      addVirtual(ifc, uni, r, communeOf(r), sessions);
      continue;
    }
    const candidates = byUni.get(uni) ?? [];
    // 4. same inmp, program not yet seen in these sessions, same modality
    const sameInmp = r.inmp
      ? candidates.find(
          (p) =>
            p.workStudy === r.workStudy &&
            isFree(p.id, sessions) &&
            p.entries.some((e) => e.inmp === r.inmp),
        )
      : undefined;
    if (sameInmp) {
      out.set(ifc, {
        status: 'LINKED',
        programId: sameInmp.id,
        score: 1,
        reason: `même parcours (inmp ${r.inmp}), nouveau n° Mon Master`,
      });
      claim(sameInmp.id, sessions);
      continue;
    }
    // 5. score on title + commune
    const commune = communeOf(r);
    let best: { p: ProgramRef; score: number } | null = null;
    for (const p of candidates) {
      if (p.workStudy !== r.workStudy || !isFree(p.id, sessions)) continue;
      let s = titleScore(r.titleKey, p.titleKey);
      if (commune && p.cityKey && commune !== p.cityKey) s *= 0.85;
      if (!best || s > best.score) best = { p, score: s };
    }
    if (
      best &&
      best.p.titleKey === r.titleKey &&
      best.p.cityKey === commune &&
      best.score >= t.autoLink
    ) {
      out.set(ifc, {
        status: 'LINKED',
        programId: best.p.id,
        score: best.score,
        reason: 'même UAI, même commune, intitulé identique',
      });
      claim(best.p.id, sessions);
      continue;
    }
    if (best && best.score >= t.propose) {
      out.set(ifc, {
        status: 'PROPOSED',
        programId: best.p.id,
        score: best.score,
        reason: `intitulé proche (${Math.round(best.score * 100)} %) : à valider`,
      });
      continue;
    }
    if (r.session !== latest) {
      out.set(ifc, {
        status: 'IGNORED',
        score: best?.score ?? 0,
        reason: `absente de la session ${latest} : historique sans fiche`,
      });
      continue;
    }
    out.set(ifc, {
      status: 'NEW',
      score: best?.score ?? 0,
      reason: uni.startsWith('uai:') ? 'université nouvelle' : 'aucune fiche correspondante',
    });
    addVirtual(ifc, uni, r, commune, sessions);
  }
  // Merge decisions towards a number whose fiche did not exist yet (« Fusionner » before applying).
  for (const ifc of deferred) {
    const d = decisions.get(`ifc:${ifc}`)!;
    const target = out.get(d.targetId!.slice(4));
    const programId =
      target?.status === 'LINKED'
        ? target.programId
        : target?.status === 'NEW'
          ? `new:${d.targetId!.slice(4)}`
          : programOfIfc.get(d.targetId!.slice(4));
    out.set(
      ifc,
      programId
        ? { status: 'LINKED', programId, score: 1, reason: `fusion décidée par ${d.author}` }
        : {
            status: 'IGNORED',
            score: 0,
            reason: `fusion décidée vers ${d.targetId!.slice(4)}, introuvable dans ce fichier`,
          },
    );
  }
  return out;
}

/** Programs having Mon Master numbers, none of them in the latest session (to confirm as not renewed). */
export function notRenewed(programs: ProgramRef[], present: Set<string>): ProgramRef[] {
  return programs.filter((p) => p.entries.length > 0 && !p.entries.some((e) => present.has(e.ifc)));
}
