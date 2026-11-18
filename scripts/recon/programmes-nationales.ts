/* eslint-disable @typescript-eslint/no-explicit-any -- script de reconnaissance ponctuel, JSON non typé */
/**
 * Reconnaissance (lecture seule) des deux sources nationales de contenu des programmes, sans rien
 * intégrer : API ouverte « Catalogue Apprentissage » du Réseau des Carif-Oref, et Onisep
 * Idéo-Fiches formations. Client poli du projet (robots.txt, 2 s par hôte, notre User-Agent).
 *
 * Usage (dans le worker) : tsx scripts/recon/programmes-nationales.ts <uais.txt> <dossier-sortie>
 * uais.txt : un UAI d'établissement public par ligne. Résultats bruts : jamais versionnés.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoliteHttpClient, MemoryHostStore, crawlerUserAgent, MB } from '@/lib/data/http';

const [uaiFile, outDir] = process.argv.slice(2) as [string, string];
if (!uaiFile || !outDir) throw new Error('usage : programmes-nationales.ts <uais.txt> <dossier>');
mkdirSync(outDir, { recursive: true });
const uais = new Set(readFileSync(uaiFile, 'utf8').trim().split('\n'));
const client = new PoliteHttpClient({
  userAgent: crawlerUserAgent(),
  allowedDomains: ['data.gouv.fr', 'onisep.fr', 'intercariforef.org'],
  store: new MemoryHostStore(),
  maxRetries: 1,
});

async function json(url: string, maxBytes = 30 * MB) {
  const r = await client.get(url, { accept: ['json'], maxBytes });
  if (r.kind !== 'response') throw new Error(`${url} : ${'reason' in r ? r.reason : r.kind}`);
  return JSON.parse(r.body!.toString('utf8'));
}

async function carif() {
  // API publiée sur data.gouv.fr par le Réseau des Carif-Oref (dataservices de l'organisation).
  const org = await json('https://www.data.gouv.fr/api/1/organizations/reseau-des-carif-oref/');
  const ds = await json(
    `https://www.data.gouv.fr/api/1/dataservices/?organization=${org.id}&page_size=20`,
  );
  const services = ds.data.map((d: any) => ({
    title: d.title,
    access: d.access_type,
    license: d.license ?? null,
    doc: d.machine_documentation_url,
  }));
  const B = 'https://catalogue-apprentissage.intercariforef.org/api/v1/entity/formations';
  const query = encodeURIComponent(
    JSON.stringify({ diplome: { $regex: '^MASTER', $options: 'i' }, published: true }),
  );
  const select = encodeURIComponent(
    JSON.stringify({
      diplome: 1,
      intitule_long: 1,
      objectif: 1,
      contenu: 1,
      capacite: 1,
      niveau_entree_obligatoire: 1,
      etablissement_gestionnaire_uai: 1,
      etablissement_formateur_uai: 1,
      rncp_code: 1,
      cfd: 1,
      duree: 1,
    }),
  );
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const j = await json(`${B}?query=${query}&limit=500&page=${page}&select=${select}`);
    all.push(...j.formations);
    if (page >= j.pagination.nombre_de_page) break;
  }
  const filled = (k: string) => all.filter((f) => String(f[k] ?? '').trim().length > 20).length;
  const ours = all.filter(
    (f) => uais.has(f.etablissement_gestionnaire_uai) || uais.has(f.etablissement_formateur_uai),
  );
  return {
    services,
    masters: all.length,
    objectif: filled('objectif'),
    contenu: filled('contenu'),
    conditions: {
      capacite: all.filter((f) => f.capacite).length,
      niveauEntree: all.filter((f) => f.niveau_entree_obligatoire).length,
    },
    ours: ours.length,
    oursPairs: new Set(
      ours.map(
        (f) =>
          `${uais.has(f.etablissement_gestionnaire_uai) ? f.etablissement_gestionnaire_uai : f.etablissement_formateur_uai}|${f.intitule_long}`,
      ),
    ).size,
  };
}

async function onisep() {
  const d = await json('https://www.data.gouv.fr/api/1/datasets/ideo-fiches-formations/');
  return {
    license: d.license,
    modified: d.last_modified,
    resources: d.resources.map((r: any) => [r.title, r.format, r.url]),
  };
  // Le zip (XML) se lit ensuite hors ligne : fiches `type_formation_libelle = master`, balises remplies.
}

(async () => {
  const out = { carif: await carif(), onisep: await onisep() };
  writeFileSync(join(outDir, 'nationales.json'), JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      { ...out, carif: { ...out.carif, services: out.carif.services.length } },
      null,
      1,
    ),
  );
})();
