# Analyse hors ligne des résultats de scripts/recon/programmes.ts (bibliothèque standard seulement).
# Usage : python3 -I programmes-analyse.py out.json carif.json uai-noms.txt rows.json
import json, sys, collections, re
out = json.load(open(sys.argv[1]))
carif = json.load(open(sys.argv[2]))
uainames = dict(l.split('|', 1) for l in open(sys.argv[3]).read().strip().split('\n') if '|' in l)
name2uai = {v: k for k, v in uainames.items()}
# Carif: distinct (uai, intitulé) per establishment
cpairs = collections.defaultdict(set)
for f in carif:
    for u in (f.get('etablissement_gestionnaire_uai'), f.get('etablissement_formateur_uai')):
        if u in uainames:
            cpairs[u].add(f.get('intitule_long'))
            break

def cmsname(lst):
    s = ' '.join(lst)
    for k in ['Ametys', 'K-Sup', 'Drupal', 'WordPress', 'TYPO3', 'Jahia', 'Liferay', 'Joomla', 'Nuxt', 'Next.js']:
        if k in s: return k
    g = [x for x in lst if x.startswith('generator:')]
    return g[0][10:40] if g else '?'

rows = []
for r in sorted(out, key=lambda r: -r.get('parcours', 0)):
    if 'error' in r and 'robots' not in r:
        rows.append(dict(name=r['name'], parcours=r.get('parcours', 0), err=r['error'][:80])); continue
    home_cms = cmsname(r.get('cmsHome', []))
    cat = []
    e = r.get('entry') or {}
    cat += e.get('cms', []) + (e.get('hop') or {}).get('cms', [])
    for p in r.get('pages', []): cat += p.get('cms') or []
    cat_cms = cmsname(cat) if cat else '—'
    oai = [o for o in r.get('oai', []) if o.get('identify')]
    oai_s = 'non'
    fields = set()
    if oai:
        o = oai[0]
        oai_s = f"oui ({o['host']}, {o.get('prefix')}, {o.get('records', 0)} enr.)"
        fields |= set(o.get('fields') or [])
    else:
        why = {o.get('why', '')[:40] for o in r.get('oai', [])}
        if any('robots' in w for w in why): oai_s = 'non (robots)'
    jl, md = set(), set()
    pages_ok = 0
    hf = collections.Counter()
    for p in r.get('pages', []):
        if p.get('status') == 200: pages_ok += 1
        jl |= set(p.get('jsonld') or []); md |= set(p.get('microdata') or [])
        for f in p.get('htmlFields') or []: hf[f] += 1
    edu = sorted(t for t in jl | md if re.search('Course|Program|Educational', t))
    sd = ', '.join(edu) if edu else ('aucune' + (f" (autres : {', '.join(sorted(jl | md))[:50]})" if jl | md else ''))
    pdf = r.get('pdf', {})
    pdf_s = []
    if pdf.get('catalogOdf'): pdf_s.append(f"catalog.pdf ODF ×{len(pdf['catalogOdf'])}")
    if pdf.get('livrets'): pdf_s.append(f"livrets ×{len(pdf['livrets'])}")
    rb = r.get('robots', {})
    if rb.get('mode') == 'disallow-all' or not rb.get('rootAllowed', True): rob = 'tout interdit' if rb.get('status') not in (None, 0) and rb.get('status', 0) < 500 else f"injoignable ({rb.get('status')})"
    elif rb.get('mode') == 'allow-all': rob = f"absent ({rb.get('status')}) : tout autorisé"
    else:
        d = rb.get('disallowStar') or []
        rob = 'autorisé' + (f" sauf {len(d)} règles" if d else '') + (f", délai {rb['crawlDelay']} s" if rb.get('crawlDelay') else '')
    fh = r.get('formHostRobots')
    if fh and fh.get('mode') == 'disallow-all': rob += f" ; {fh['host']} injoignable"
    elif fh and '/' in (fh.get('disallowStar') or []): rob += f" ; {fh['host']} : Disallow /"
    if not fields:
        fields = {k for k, v in hf.items() if v >= 1}
    uai = name2uai.get(r['name'])
    rows.append(dict(name=r['name'], parcours=r['parcours'], cms_home=home_cms, cms_cat=cat_cms, oai=oai_s, sd=sd, pdf=', '.join(pdf_s) or 'non vu',
                     rob=rob, fields=sorted(fields), sitemap=r.get('sitemap', {}).get('programUrls', 0), pages_ok=pages_ok,
                     pages=len(r.get('pages', [])), from_=r.get('pagesFrom', ''), home=r.get('home', {}), carif=len(cpairs.get(uai, ())),
                     entry=e.get('url'), subs=r.get('subdomains', [])[:0], oai_raw=r.get('oai'), robots_raw=rb))
json.dump(rows, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
for x in rows:
    print(json.dumps({k: v for k, v in x.items() if k not in ('oai_raw', 'robots_raw', 'subs')}, ensure_ascii=False))
