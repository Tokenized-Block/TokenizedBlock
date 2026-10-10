/* test-hook-7030-non-lu-20261010.mjs — UNE LECTURE RATEE DU HOOK 7030 NE CHOISIT JAMAIS UN AUTRE HOOK.
 *
 * ⛔⛔ LE DEFAUT (HEAD 9e27d93, tokenomics.js `hookCourant`) : quand le 7030 s applique a la devise et que eth_getCode(HOOK_7030)
 *   JETTE, le catch « retombe sur la suite » : V8 si son code se lit, puis V7, V6, et sur mainnet le V5 SANS lecture. Un seul
 *   hoquet de noeud planifiait donc une vraie naissance sur le V8 (liste figee : ETH, TBLOCK + les 12 de DEVISES_ADMISES_V8) au
 *   lieu du 7030 (live depuis le bloc 52 132 476, adminless). Et une reponse null / undefined devenait '' (`String(x || '')`) = « absent » : meme chute.
 * ⛔ LA DECISION (lead, 2026-10-10) :
 *   · le 7030 s applique ET son code lu est non vide        -> HOOK_7030 (inchange) ;
 *   · le 7030 s applique ET la lecture rate (throw, null, undefined, autre chose que du texte, texte non hexa) -> `undefined`,
 *     AUCUN autre hook, et aucun autre code n est meme lu ;
 *   · le 7030 s applique ET son code est VIDE ('0x' ou '')  -> vraiment absent (un fork d avant le deploiement) : l ancienne
 *     echelle, a l identique ;
 *   · la devise n est pas sur sa liste                      -> inchange (le 7030 n est meme pas lu).
 * CAS : (a) throw + V8 lisible -> undefined · (b) reponses illisibles -> undefined · (c) HORS mainnet, '0x' / '' -> l ancienne
 *   echelle (et la garde du V1) · (c2) SUR mainnet, '0x' / '' -> undefined (le 7030 y existe : un code vide n y est pas une absence) ·
 *   (d) code -> 7030 · (e) planNaissance (naissance-api.js) avec le rpc de (a) -> NON_MESURE, rien a signer, une seule lecture,
 *   « try again » · (f) devise hors liste : inchange · (g) app.html : aucun des 4 sites d appel ne fait d `undefined` un hook ·
 *   (h) MUTANTS : chacun doit faire rougir le cas qui le vise ; un temoin (copie sans mutation) doit rester vert.
 * ⛔ PREUVE ROUGE-AVANT : `DIR=<arbre HEAD> node test-hook-7030-non-lu-20261010.mjs` lit les modules de cet arbre-la.
 * ⛔ BORNE : (g) lit du TEXTE — il prouve la forme des gardes, pas l ecran rendu dans un navigateur.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. Aucun reseau. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.DIR || ICI);
const imp = (f, dir) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const lf = (s) => String(s).replace(/\r\n/g, '\n');
const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

/** Un rpc de laboratoire : le 7030 rend `code7030` (une Error = il jette), les autres hooks rendent `codes[adresse]` ou '0x'.
 *  `journal` garde chaque appel : il prouve ce qui a ete LU, pas seulement ce qui a ete rendu. */
function rpcLabo(T, { code7030, codes = {}, autresJettent = false, journal = [] }) {
  return async (m, p) => {
    journal.push(m + ':' + bas(p && p[0] && (p[0].to || p[0])));
    if (m !== 'eth_getCode') throw new Error('appel inattendu : ' + m);
    const a = bas(p[0]);
    if (a === bas(T.HOOK_7030)) { if (code7030 instanceof Error) throw code7030; return code7030; }
    if (autresJettent) throw new Error('noeud injoignable');
    return Object.prototype.hasOwnProperty.call(codes, a) ? codes[a] : '0x';
  };
}

/** Tous les cas, contre les modules d un dossier. Rend { cas: [ { ok, m } ] } — appele sur l arbre, puis sur chaque mutant. */
async function verifier(dir) {
  const T = await imp('tokenomics.js', dir), P = await imp('paires.js', dir), N = await imp('naissance-api.js', dir);
  const html = lf(fs.readFileSync(path.join(dir, 'app.html'), 'utf8'));
  const R = {};
  const c = (cas, cond, m) => { (R[cas] = R[cas] || []).push({ ok: !!cond, m: '(' + cas + ') ' + m }); };
  const parSym = Object.fromEntries(P.pairesProposees(8453).map((p) => [p.symbole, bas(p.adr)]));
  const NVDA = parSym.NVDAc, ARM = parSym.ARMc, TBLOCK = bas(P.TBLOCK_MAINNET);
  const V8 = { [bas(T.HOOK_V8)]: '0x6080604052' };

  /* pre-conditions : ce que le test suppose, ecrit et verifie au lieu d etre cru */
  c('pre', T.HOOK_7030_ACTIF === true && T.HOOK_V9 === null, 'drapeau 7030 allume, V9 non pose (sa branche est inactive)');
  c('pre', P.hookDeLancementPour(ETH, 8453, { h7030: true }) === '7030' && P.hookDeLancementPour(NVDA, 8453, { h7030: true }) === '7030',
    'le 7030 s applique a ETH et a NVDAc');
  c('pre', !!ARM && P.hookDeLancementPour(ARM, 8453, { h7030: true }) === null && P.hookDeLancementPour(TBLOCK, 8453, { h7030: true }) === 'V8',
    'ARMc hors de toute liste, TBLOCK sur la liste du V8 seulement : le 7030 ne s applique a aucun des deux');

  /* (a) le 7030 s applique, son eth_getCode JETTE, le V8 se lit -> undefined, et rien d autre n est lu */
  for (const [nom, o] of [['ETH, hors mainnet', { devise: null }], ['ETH, mainnet', { mainnet: true, devise: null }],
    ['NVDAc, mainnet', { mainnet: true, avecDevise: true, devise: NVDA }], ['ETH, V1 connu deploye', { devise: null, etatV1: 'DEPLOYE' }]]) {
    const journal = [];
    const h = await T.hookCourant({ rpc: rpcLabo(T, { code7030: new Error('header not found'), codes: V8, journal }), ...o });
    c('a', h === undefined, nom + ' : getCode(7030) jette, V8 lisible -> undefined (rendu : ' + h + ')');
    c('a', journal.length === 1 && journal[0] === 'eth_getCode:' + bas(T.HOOK_7030), nom + ' : seul le 7030 a ete lu (' + journal.join(' ') + ')');
  }

  /* (b) le 7030 s applique, la reponse est illisible -> undefined */
  for (const [nom, rep] of [['null', null], ['undefined', undefined], ['un nombre', 42], ['un objet', { code: -32000 }], ['un booleen', true],
    ['du texte', 'oops'], ['un 0x non hexa', '0xzz'], ['un nombre impair de chiffres', '0x123'], ['une espace devant', ' 0x6080'],
    ['« 0x0 » (revue adverse)', '0x0'], ['un prefixe 0X majuscule (revue adverse)', '0X6080']]) {
    const h = await T.hookCourant({ rpc: rpcLabo(T, { code7030: rep, codes: V8 }), mainnet: true, devise: null });
    c('b', h === undefined, 'reponse ' + nom + ' -> undefined (rendu : ' + h + ')');
  }
  c('b', typeof T.hook7030Deploye === 'function'
    && await T.hook7030Deploye({ rpc: rpcLabo(T, { code7030: null }) }) === 'NON_LU'
    && await T.hook7030Deploye({ rpc: rpcLabo(T, { code7030: new Error('x') }) }) === 'NON_LU',
  'hook7030Deploye : null et throw = NON_LU, jamais ABSENT');

  /* (c) HORS MAINNET (Sepolia, fork d avant le deploiement), un code VIDE lu = vraiment absent : l ancienne echelle, a l identique */
  for (const vide of ['0x', '']) {
    c('c', await T.hookCourant({ rpc: rpcLabo(T, { code7030: vide, codes: V8 }), devise: null }) === T.HOOK_V8, 'code ' + JSON.stringify(vide) + ' + V8 lisible, hors mainnet -> V8');
    c('c', await T.hookCourant({ rpc: rpcLabo(T, { code7030: vide, codes: V8 }), avecDevise: true, devise: NVDA }) === T.HOOK_V8,
      'code ' + JSON.stringify(vide) + ', NVDAc, hors mainnet -> V8');
  }
  c('c', await T.hookCourant({ rpc: rpcLabo(T, { code7030: '0x', autresJettent: true }), devise: null, etatV1: 'DEPLOYE' }) === T.HOOK_PREVU,
    '7030 absent hors mainnet, le reste muet, V1 connu deploye -> V1 (comme avant)');
  /* revue adverse (2026-10-10) : l assertion « V1 non lu -> undefined » de test-un-seul-choix passait par le court-circuit du 7030 et ne
   *   touchait plus la garde du V1 ; ce cas-ci l atteint vraiment (7030 absent hors mainnet, tout le reste muet) */
  c('c', await T.hookCourant({ rpc: rpcLabo(T, { code7030: '0x', autresJettent: true }), devise: null, etatV1: 'NON_LU' }) === undefined,
    '7030 absent hors mainnet, le reste muet, V1 NON lu -> undefined (la garde du V1, jamais un V1 suppose)');

  /* (c2) SUR MAINNET un code vide n est PAS une absence (le 7030 y existe depuis le bloc 52 132 476, EIP-6780) : undefined, rien d autre lu */
  for (const vide of ['0x', '']) {
    for (const [nom, o] of [['ETH', { devise: null }], ['NVDAc', { avecDevise: true, devise: NVDA }]]) {
      const journal = [];
      const h = await T.hookCourant({ rpc: rpcLabo(T, { code7030: vide, codes: V8, journal }), mainnet: true, ...o });
      c('c2', h === undefined, nom + ', mainnet, code ' + JSON.stringify(vide) + ' -> undefined, jamais V8 (rendu : ' + h + ')');
      c('c2', journal.length === 1, nom + ', mainnet, code ' + JSON.stringify(vide) + ' : seul le 7030 a ete lu (' + journal.join(' ') + ')');
    }
  }
  {
    const r = await N.planNaissance({ nom: 'Bloc', symbole: 'blc', compte: '0x00000000000000000000000000000000c0ffee77', sel: 's' },
      { rpc: rpcLabo(T, { code7030: '0x', codes: V8 }), prixUsd: async () => 2000 });
    c('c2', r.etat === 'NON_MESURE' && Array.isArray(r.aSigner) && r.aSigner.length === 0, 'planNaissance, 7030 lu « 0x » sur mainnet -> NON_MESURE, rien a signer (' + r.etat + ')');
  }
  c('c', typeof T.hook7030Deploye === 'function' && await T.hook7030Deploye({ rpc: rpcLabo(T, { code7030: '0x' }) }) === 'ABSENT', 'hook7030Deploye : 0x = ABSENT');

  /* (d) code lu -> 7030 */
  for (const [nom, o] of [['ETH', { devise: null }], ['ETH, mainnet', { mainnet: true, devise: null }], ['NVDAc, mainnet', { mainnet: true, avecDevise: true, devise: NVDA }]]) {
    c('d', await T.hookCourant({ rpc: rpcLabo(T, { code7030: '0x6080604052', codes: V8 }), ...o }) === T.HOOK_7030, nom + ' : code lu -> 7030');
  }
  c('d', await T.hookCourant({ rpc: rpcLabo(T, { code7030: '0x' + 'AB'.repeat(4) }), devise: null }) === T.HOOK_7030, 'hexa en majuscules -> 7030');

  /* (e) planNaissance (le serveur, le MCP tblock_plan_birth, la sonde /sante) avec le rpc de (a) */
  {
    const journal = [];
    let prix = 0;
    const r = await N.planNaissance({ nom: 'Bloc', symbole: 'blc', compte: '0x00000000000000000000000000000000c0ffee77', sel: 's' },
      { rpc: rpcLabo(T, { code7030: new Error('header not found'), codes: V8, journal }), prixUsd: async () => { prix += 1; return 2000; } });
    c('e', r.etat === 'NON_MESURE' && r.ok === false && Array.isArray(r.aSigner) && r.aSigner.length === 0, 'NON_MESURE, aSigner vide (' + r.etat + ')');
    c('e', /could not be read/.test(r.pourquoi) && /try again/i.test(r.pourquoi), 'la raison dit « non lu » ET « reessayez » : ' + r.pourquoi);
    c('e', journal.length === 1 && prix === 0, 'une seule lecture (le 7030), aucun prix demande : rien n a ete planifie apres (' + journal.join(' ') + ')');
    c('e', !r.block && !r.cout, 'aucun block ni cout rendu');
  }

  /* (f) devise hors liste du 7030 : inchange, et le 7030 n est meme pas lu */
  for (const [nom, devise] of [['ARMc', ARM], ['TBLOCK', TBLOCK]]) {
    const journal = [];
    const h = await T.hookCourant({ rpc: rpcLabo(T, { code7030: new Error('ne doit pas etre lu'), codes: V8, journal }), mainnet: true, avecDevise: true, devise });
    c('f', h === T.HOOK_V8, nom + ' : V8 comme avant (rendu : ' + h + ')');
    c('f', !journal.includes('eth_getCode:' + bas(T.HOOK_7030)), nom + ' : le 7030 n est pas lu');
  }

  /* (g) app.html — aucun appelant ne fait d `undefined` un hook */
  {
    const sites = [...html.matchAll(/(?:const|let)\s+(hooks?)\s*=\s*await\s+hookCourant\(\{[^}]*\}\);/g)];
    c('g', sites.length === 4 && (html.match(/await\s+hookCourant\s*\(/g) || []).length === 4,
      'exactement 4 appels, tous de la forme « const hook(s) = await hookCourant({...}); » (' + sites.length + ')');
    c('g', !/hookCourant\([^;]*?\)\s*\)?\s*(?:\|\||\?\?)/.test(html), 'aucun « hookCourant(...) || X » ni « ?? X » : pas de hook par defaut');
    for (const m of sites) {
      const v = m[1], apres = html.slice(m.index + m[0].length, m.index + m[0].length + 2500);
      const garde = new RegExp('if \\((?:mainnet && )?!' + v + '\\b|if \\(!estHook7030\\(' + v + '\\)\\)').exec(apres);
      const avant = garde ? apres.slice(0, garde.index).replace(/\/\*[\s\S]*?\*\//g, '') : '';
      const ligne = html.slice(0, m.index).split('\n').length;
      c('g', !!garde && !new RegExp('\\b' + v + '\\b').test(avant),
        'app.html:' + ligne + ' : « ' + v + ' » est teste (vide ?) avant tout usage — ' + (garde ? garde[0] : 'AUCUNE garde'));
    }
    /* site 1 — Launch pas a pas : NON_MESURE (une lecture ratee, pas un refus), et rien ne peut l ecraser ensuite */
    const i1 = html.indexOf('const hooks = await hookCourant(');
    const s1 = i1 > 0 ? html.slice(i1, i1 + 9000) : '';
    const nonLu = /if \(mainnet && !hooks\) \{\s*plan = \{ etat: 'NON_MESURE', hookNonLu: true, pourquoi: '([^']*)' \};/.exec(s1);
    c('g', !!nonLu && /could not be read/.test(nonLu[1]) && /again/.test(nonLu[1]), 'Launch : hook non lu sur mainnet -> NON_MESURE « could not be read … again »');
    const garde1 = s1.indexOf("if (plan && (plan.etat === 'REFUSE' || plan.etat === 'NON_MESURE')) {"), paire = s1.indexOf('} else if (deviseLancement && !hooks) {');
    c('g', garde1 > 0 && paire > garde1, 'Launch : le NON_MESURE n est ni ecrase par « pick ETH » ni suivi d un planLancement');
    c('g', /if \(poolVide && plan && !plan\.refusFraisEnBlock && !plan\.hookNonLu && \(plan\.etat === 'REFUSE' \|\| plan\.etat === 'NON_MESURE'\)\)/.test(html),
      'Launch : la phrase « pool vide » ne remplace pas « hook non lu »');
    /* site 4 — une seule signature : sur Base, hook non lu = STOP (rien n est envoye), jamais le parcours classique */
    /* le site de creerEtVivreUneSignature : le seul de cette forme suivi d un commentaire (celui de la pre-verification est suivi d un if) */
    const i4 = html.search(/const hook = await hookCourant\(\{ rpc, mainnet: Number\(CHAINE\) === 8453, avecDevise: !!devise, devise \}\);\s*\/\*/);
    const s4 = i4 > 0 ? html.slice(i4, i4 + 1200) : '';
    const stop = s4.indexOf("if (!hook && Number(CHAINE) === 8453) { e.className = 'note wKo'; e.textContent = COPIE_NAISSANCE_NON_VERIFIEE; return 'STOP'; }");
    c('g', stop > 0 && stop < s4.indexOf("return 'SANS';"), 'une seule signature : hook non lu sur Base -> STOP avant tout « SANS » (garde DEFENSIVE, inatteignable aujourd hui : texte seulement)');
    /* site 3 — la pre-verification avant createPaid : NON_MESURE, que l appelant transforme en « Try again », rien d encaisse */
    c('g', /const hook = await hookCourant\(\{[^}]*\}\);\n\s+if \(!hook \|\| \/\^0x0\{40\}\$\/i\.test\(String\(hook\)\)\) return \{ etat: 'NON_MESURE'/.test(html)
      && /if \(pre\.etat !== 'ACCEPTE'\) \{[\s\S]{0,120}COPIE_NAISSANCE_NON_VERIFIEE;/.test(html), 'pre-verification : hook non lu -> NON_MESURE -> « Try again », createPaid jamais envoye');
  }
  return R;
}

/* ══ 1. L ARBRE ══════════════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('— arbre : ' + DIR);
const R = await verifier(DIR);
for (const cas of Object.keys(R)) for (const x of R[cas]) ok(x.ok, x.m);

/* ══ 2. MUTANTS — chacun doit faire rougir le cas qui le vise ═══════════════════════════════════════════════════════ */
console.log('— mutants');
const T0 = await imp('tokenomics.js', DIR);
const appelNaissance = 'const hook = await hookCourant({ rpc, mainnet: true, avecDevise: !!devise, devise });';
const MUTANTS = [
  { nom: 'temoin : copie sans mutation', f: null, cas: null },
  { nom: 'le repli d avant : un 7030 non lu retombe sur la suite', f: 'tokenomics.js', de: "    if (etat7030 !== 'ABSENT' || mainnet) return undefined;\n", a: '', cas: 'a' },
  { nom: 'sur mainnet, un code vide redevient une absence (-> V8)', f: 'tokenomics.js', de: "if (etat7030 !== 'ABSENT' || mainnet) return undefined;", a: "if (etat7030 !== 'ABSENT') return undefined;", cas: 'c2' },
  { nom: 'la garde du V1 suppose un V1 non lu', f: 'tokenomics.js', de: "return etatV1 === 'DEPLOYE' ? HOOK_PREVU : undefined;", a: 'return HOOK_PREVU;', cas: 'c' },
  { nom: 'un throw lu comme un code vide', f: 'tokenomics.js', de: "try { code = await rpc('eth_getCode', [HOOK_7030, 'latest']); } catch (_) { return 'NON_LU'; }",
    a: "try { code = await rpc('eth_getCode', [HOOK_7030, 'latest']); } catch (_) { return 'ABSENT'; }", cas: 'a' },
  { nom: 'null lu comme un code vide (l ancien String(x || ""))', f: 'tokenomics.js', de: "if (code === '0x' || code === '') return 'ABSENT';",
    a: "if (code === '0x' || code === '' || code == null) return 'ABSENT';", cas: 'b' },
  { nom: 'tout texte est du code', f: 'tokenomics.js', de: "typeof code === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/.test(code)", a: "typeof code === 'string'", cas: 'b' },
  { nom: 'un nombre impair de chiffres hexa accepte', f: 'tokenomics.js', de: '/^0x(?:[0-9a-fA-F]{2})+$/', a: '/^0x[0-9a-fA-F]+$/', cas: 'b' },
  { nom: 'un code vide lu comme non lu (le fork d avant le deploiement casse)', f: 'tokenomics.js', de: "if (code === '0x' || code === '') return 'ABSENT';", a: '', cas: 'c' },
  { nom: 'le code lu du 7030 ignore', f: 'tokenomics.js', de: "if (etat7030 === 'DEPLOYE') return HOOK_7030;", a: "if (false) return HOOK_7030;", cas: 'd' },
  { nom: 'le 7030 lu pour toute devise (liste ignoree)', f: 'tokenomics.js',
    de: "hookDeLancementPour(devise || '0x0000000000000000000000000000000000000000', 8453, { h7030: true }) === '7030') {", a: 'true) {', cas: 'f' },
  { nom: 'naissance : la raison ne dit plus de reessayer', f: 'naissance-api.js', de: "could not be read on chain — try again in a moment; nothing to sign'", a: "could not be read on chain — nothing to sign'", cas: 'e' },
  { nom: 'naissance : un hook non lu remplace par le V8', f: 'naissance-api.js', de: appelNaissance,
    a: appelNaissance.replace(';', " || '" + T0.HOOK_V8 + "';"), cas: 'e' },
  { nom: 'app : Launch rend REFUSE au lieu de NON_MESURE', f: 'app.html', de: "plan = { etat: 'NON_MESURE', hookNonLu: true, pourquoi:", a: "plan = { etat: 'REFUSE', hookNonLu: true, pourquoi:", cas: 'g' },
  { nom: 'app : la garde de Launch ne voit plus le NON_MESURE (« pick ETH » l ecrase)', f: 'app.html',
    de: "if (plan && (plan.etat === 'REFUSE' || plan.etat === 'NON_MESURE')) {", a: "if (plan && plan.etat === 'REFUSE') {", cas: 'g' },
  { nom: 'app : la pre-verification prend le V8 par defaut', f: 'app.html',
    de: 'const hook = await hookCourant({ rpc, mainnet: Number(CHAINE) === 8453, avecDevise: !!devise, devise });\n    if (!hook',
    a: 'const hook = (await hookCourant({ rpc, mainnet: Number(CHAINE) === 8453, avecDevise: !!devise, devise })) || HOOK_V8;\n    if (!hook', cas: 'g' },
  { nom: 'app : une seule signature retombe sur le parcours classique', f: 'app.html',
    de: "  if (!hook && Number(CHAINE) === 8453) { e.className = 'note wKo'; e.textContent = COPIE_NAISSANCE_NON_VERIFIEE; return 'STOP'; }\n", a: '', cas: 'g' },
  { nom: 'app : « pool vide » ecrase « hook non lu »', f: 'app.html', de: '!plan.refusFraisEnBlock && !plan.hookNonLu && (', a: '!plan.refusFraisEnBlock && (', cas: 'g' },
  { nom: 'app : la note du minimum lit le hook sans garde', f: 'app.html', de: "if (!estHook7030(hook)) { el.hidden = true; return; }", a: "if (!estHook7030(String(hook))) { el.hidden = true; return; }", cas: 'g' },
];
let tues = 0, aTuer = 0;
for (const mu of MUTANTS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h7030-nonlu-'));
  try {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js') || x === 'app.html')) fs.copyFileSync(path.join(DIR, f), path.join(tmp, f));
    if (mu.f) {
      const src = lf(fs.readFileSync(path.join(tmp, mu.f), 'utf8'));
      const fois = src.split(mu.de).length - 1;
      ok(fois === 1, 'mutant « ' + mu.nom + ' » : motif trouve une fois (' + fois + ')');
      if (fois !== 1) continue;
      fs.writeFileSync(path.join(tmp, mu.f), src.replace(mu.de, mu.a));
    }
    let Rm;
    try { Rm = await verifier(tmp); } catch (e) { Rm = { plante: [{ ok: false, m: String(e && e.message) }] }; }
    const rouges = Object.keys(Rm).filter((k) => Rm[k].some((x) => !x.ok));
    if (!mu.cas) { ok(rouges.length === 0, 'TEMOIN : la copie sans mutation est verte (rouges : ' + (rouges.join(',') || 'aucun') + ')'); continue; }
    aTuer += 1;
    const tue = rouges.includes(mu.cas);
    if (tue) tues += 1;
    ok(tue, 'mutant « ' + mu.nom + ' » TUE par le cas (' + mu.cas + ') — rouges : ' + (rouges.join(',') || 'AUCUN'));
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
}
console.log('mutants tues : ' + tues + '/' + aTuer);
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
