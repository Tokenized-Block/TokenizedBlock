/* test-wallet-audf-20261026.mjs — LE SWAP DU WALLET LISTE AUDF (et cbBTC / WETH) QUAND LE WALLET LES DETIENT, JAMAIS EURC.
 *
 * game54 : AUDF, le pivot fiat mesure qui remplace EURC, n etait JAMAIS dans « You pay » : le Wallet ne lisait pas les soldes des
 *   devises pivot (ni JETONS_CONNUS, ni /api/avoirs). Correctif : majWallet lit chaque pivot de la table du serveur
 *   (devisesPivotVersBloc, EURC deja retire) par lireJeton, UNE fois par compte et par page (lirePivotWallet), et « You pay » range
 *   USDC d abord, puis les monnaies fiat, puis le reste dans l ordre lu.
 *
 * CE BANC EXECUTE LES VRAIES FONCTIONS DE app.html (majWallet, lireJeton, lirePivotWallet, oublierPivotsDuCompte, wsEstBlock, wsRang,
 *   wsPeindreDe), extraites du texte, avec les VRAIS modules (entree-vers-bloc.js, plan-franchissement.js, paires.js, montants.js).
 *   Faux : le noeud (rpc), /api/avoirs (fetch), les scans de blocks (vides), le DOM (objets). Les adresses AUDF / EURC sont LUES dans
 *   plan-franchissement.js, jamais tapees.
 *   R1 AUDF detenu -> liste ; R2 non detenu -> absent ; R3 EURC detenu (rendu par /api/avoirs) -> dans le Wallet, JAMAIS dans « You pay » ;
 *   R4 ordre USDC, AUDF, puis le reste (ETH, cbBTC) ; R5 un balanceOf par pivot par compte sur deux relectures, relu apres une tx confirmee ;
 *   R6 un pivot illisible se DIT (note), n est pas liste ; R7 AUDF n est pas un block (pas de « son propre marche ») ; R8 chaque regle
 *   tue son mutant (copies EN MEMOIRE).
 * ⚠️ NE PROUVE PAS : qu un echange AUDF aboutisse (rien n est signe), ni le chemin bcProposerSwap (epingle par test-wallet-swap-20261025).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { devisesPivotVersBloc } = await imp('entree-vers-bloc.js');
const { POOLS_PIVOTS_AERODROME, DEVISES_BANNIES } = await imp('plan-franchissement.js');
const { DEVISES_BASE } = await imp('paires.js');
const { formaterUnites } = await imp('montants.js');
/* argument optionnel : une autre app.html (le RED : la page d avant le correctif) */
const brut = fs.readFileSync(process.argv[2] || path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const pivotDe = (sym) => { for (const [k, v] of POOLS_PIVOTS_AERODROME) if (v.symbole === 'USDC/' + sym) return k.split('|').find((t) => t !== USDC); return null; };
const AUDF = pivotDe('AUDF');
const CBBTC = pivotDe('cbBTC');
const EURC = [...DEVISES_BANNIES].find(([, s]) => s === 'EURC')?.[0];
const MOI = '0x' + 'a1'.repeat(20);

async function verifier(html) {
  const ko = [];
  const exige = (c, m) => { if (!c) ko.push(m); };
  const corps = (sig) => { const i = html.indexOf(sig); if (i < 0) return null; const m = /\n\}\n/.exec(html.slice(i)); return m ? html.slice(i, i + m.index + 2) : null; };
  const ligne = (re) => (re.exec(html) || [])[0] || null;
  exige(/^0x[0-9a-f]{40}$/.test(AUDF || '') && /^0x[0-9a-f]{40}$/.test(EURC || '') && /^0x[0-9a-f]{40}$/.test(CBBTC || ''), 'R0 TEMOIN : AUDF / EURC / cbBTC introuvables dans plan-franchissement.js');
  const sigs = ['async function majWallet(', 'async function lireJeton(', 'async function lirePivotWallet(', 'function oublierPivotsDuCompte(',
    'function wsEstBlock(', 'function wsRang(', 'function wsPeindreDe(', 'function abrege('];
  const srcs = sigs.map(corps);
  const cst = [/const ETH_ADR = '0x0{40}';/, /const soldesPivots = new Map\(\);/, /const soldesPivotsDemandes = new Set\(\);/,
    /const wsPivotsWallet = \(\) => [^\n]+/, /const WS_PIVOTS_FIAT = [^\n]+/, /const pivotsWalletLus = new Map\(\);/, /const WALLET_RECU_ATTENTE_MS = \d+;/].map(ligne);
  exige(srcs.every(Boolean) && cst.every(Boolean), 'R0 TEMOIN : fonctions ou constantes introuvables : '
    + sigs.filter((_, i) => !srcs[i]).concat(cst.map((c, i) => (c ? null : 'cst#' + i)).filter(Boolean)).join(', '));
  if (!srcs.every(Boolean) || !cst.every(Boolean)) return ko;

  /* le monde : le noeud (compte des lectures), /api/avoirs, le DOM */
  const monde = (soldes, { panne = new Set() } = {}) => {
    const appels = [];
    const rpc = async (m, p) => {
      if (m === 'eth_getBalance') return '0x0';
      if (m !== 'eth_call') throw new Error('rpc inattendu ' + m);
      const to = String(p[0].to).toLowerCase(), data = String(p[0].data);
      appels.push([to, data.slice(0, 10)]);
      if (panne.has(to)) throw new Error('noeud : refuse');
      if (data === '0x313ce567') return '0x' + (to === CBBTC ? 8 : 6).toString(16);
      if (data.startsWith('0x70a08231')) return '0x' + (soldes[to] || 0n).toString(16);
      throw new Error('selecteur inattendu ' + data);
    };
    const els = new Map();
    const $ = (s) => { if (!els.has(s)) els.set(s, { hidden: false, textContent: '', innerHTML: '', title: '', value: '', dataset: {}, options: [],
      replaceChildren(...o) { this.options = o; this.value = o.length ? o[0].value : ''; } }); return els.get(s); };
    const avoirs = Object.entries(soldes).filter(([a, s]) => s > 0n && [USDC, EURC, CBBTC].includes(a) && a !== USDC).map(([a]) => ({ adr: a, symbole: a === EURC ? 'EURC' : 'cbBTC' }));
    const fetch = async (u) => { if (!String(u).startsWith('/api/avoirs')) throw new Error('fetch inattendu ' + u); return { json: async () => ({ etat: 'LU', avoirs }) }; };
    return { rpc, $, fetch, appels };
  };
  const fabriquer = (w) => new Function('rpc', '$', 'fetch', 'devisesPivotVersBloc', 'DEVISES_BANNIES', 'DEVISES_BASE', 'formaterUnites', 'USDC_BASE', 'MOI',
    'Option', 'AbortSignal',
    cst.join('\n') + '\nlet actifs = [], compte = MOI, walletLuA = 0, jetonLecture = 0; const walletRecus = new Map();\n'
    + 'const CHAINE = 8453, RESEAUX = { 8453: { nom: "Base" } }, JETONS_CONNUS = { 8453: [{ adr: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", nom: "USDC", ic: "$" }] };\n'
    + 'const ACTIONS_PAR_ADR = new Map(), SELECTEUR_MULTIPLIER = "0x0", SELECTEUR_UI_MULTIPLIER = "0x0";\n'
    + 'const dormir = async () => {}, court = (a) => a.slice(0, 6) + "…" + a.slice(-4), selecteur = (s) => ({ "decimals()": "313ce567", "balanceOf(address)": "70a08231" })[s];\n'
    + 'const peindreActifs = () => {}, remplirChoixActif = () => {}, wsPeindreVers = () => {}, nomJetonWallet = async (a, s) => s || court(a);\n'
    + 'const mesCreations = async () => ({ r: { fenetresRatees: [] }, gardees: [], nonResolues: [] }), mesFrappes = async () => ({ blocks: [], fenetresRatees: [] });\n'
    + srcs.join('\n') + '\nreturn { majWallet, wsPeindreDe, wsEstBlock, oublierPivotsDuCompte, get actifs() { return actifs; } };')(
    w.rpc, w.$, w.fetch, devisesPivotVersBloc, DEVISES_BANNIES, DEVISES_BASE, formaterUnites, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', MOI,
    function Option(t, v) { return { text: t, value: v }; }, { timeout: () => null });
  const youPay = async (soldes, opt) => {
    const w = monde(soldes, opt), app = fabriquer(w);
    await app.majWallet(); app.wsPeindreDe();
    return { w, app, opts: w.$('#wsDe').options.map((o) => o.value), note: w.$('#wActifsNote').textContent };
  };
  const bal = (w, a) => w.appels.filter(([to, s]) => to === a && s === '0x70a08231').length;

  try {
    /* R1 / R3 / R4 : USDC, AUDF, cbBTC et EURC detenus */
    const A = await youPay({ [USDC]: 5000000n, [AUDF]: 12340000n, [CBBTC]: 1000n, [EURC]: 7000000n });
    exige(A.opts.includes(AUDF), 'R1 AUDF detenu n est pas dans « You pay » : ' + JSON.stringify(A.opts));
    exige(!A.opts.includes(EURC), 'R3 EURC (banni) est offert a payer : ' + JSON.stringify(A.opts));
    exige(A.app.actifs.some((a) => a.adr === EURC), 'R3 TEMOIN : EURC detenu n est pas dans le Wallet (le temoin du filtre ne prouve rien)');
    exige(JSON.stringify(A.opts) === JSON.stringify([USDC, AUDF, 'ETH', CBBTC]), 'R4 ordre de « You pay » : ' + JSON.stringify(A.opts) + ' (attendu USDC, AUDF, ETH, cbBTC)');
    const audf = A.app.actifs.find((a) => a.adr === AUDF);
    exige(audf && audf.nom === 'AUDF' && audf.decimales === 6 && audf.solde === 12340000n && audf.etat === 'LU', 'R1 la ligne AUDF ne porte pas le solde LU : ' + JSON.stringify(audf, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
    /* R5 : deux relectures, un seul balanceOf par pivot ; apres une tx confirmee, relu */
    const balAvant = bal(A.w, AUDF);
    await A.app.majWallet();
    exige(balAvant === 1 && bal(A.w, AUDF) === 1, 'R5 AUDF : ' + balAvant + ' puis ' + bal(A.w, AUDF) + ' balanceOf sur deux relectures (attendu 1 puis 1)');
    A.app.oublierPivotsDuCompte(MOI); await A.app.majWallet();
    exige(bal(A.w, AUDF) === 2, 'R5 apres une tx confirmee, AUDF n est pas relu (' + bal(A.w, AUDF) + ' balanceOf)');
    /* R2 : AUDF non detenu */
    const B = await youPay({ [USDC]: 5000000n });
    exige(!B.opts.includes(AUDF) && !B.app.actifs.some((a) => a.adr === AUDF), 'R2 AUDF a zero est liste : ' + JSON.stringify(B.opts));
    exige(bal(B.w, AUDF) === 1, 'R2 TEMOIN : AUDF pas lu du tout (' + bal(B.w, AUDF) + ')');
    /* R6 : AUDF illisible */
    const C = await youPay({ [USDC]: 5000000n, [AUDF]: 1n }, { panne: new Set([AUDF]) });
    exige(!C.opts.includes(AUDF) && /not read/.test(C.note) && /AUDF/.test(C.note), 'R6 un AUDF illisible n est pas dit (note : ' + C.note.slice(0, 120) + ')');
    /* R7 */
    exige(A.app.wsEstBlock(AUDF) === false && A.app.wsEstBlock(EURC) === false && A.app.wsEstBlock('0x' + 'b2'.repeat(20)) === true, 'R7 AUDF / EURC pris pour un block (ou un block plus pris pour un block)');
  } catch (e) { exige(false, 'R* a leve : ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
  return ko;
}

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const vraie = await verifier(brut);
ok(vraie.length === 0, 'la page : R1-R7 tiennent' + (vraie.length ? '\n      ' + vraie.join('\n      ') : ''));

const remplace = (de, vers) => (h) => { if (h.split(de).length !== 2) throw new Error('cible du mutant absente ou non unique : ' + de.slice(0, 60)); return h.replace(de, vers); };
const MUTANTS = [
  ['M1 « You pay » liste EURC (filtre banni retire)', remplace("&& !DEVISES_BANNIES.has(String(a.adr || '').toLowerCase()))\n    .map(", ')\n    .map(')],
  ['M2 la lecture des pivots retiree', remplace('for (const p of wsPivotsWallet()) {', 'for (const p of []) {')],
  ['M3 plus de rang (ordre lu)', remplace('.sort(([x, i], [y, j]) => wsRang(x) - wsRang(y) || i - j)', '.sort(([x, i], [y, j]) => i - j)')],
  ['M4 AUDF plus range comme fiat', remplace("const WS_PIVOTS_FIAT = new Set(['AUDF']);", 'const WS_PIVOTS_FIAT = new Set([]);')],
  ['M5 plus de cache (relu a chaque relecture)', remplace('if (pivotsWalletLus.has(k)) return pivotsWalletLus.get(k);', '')],
  ['M6 un pivot a zero est liste', remplace('if (lu.solde === 0n) continue;', '')],
  ['M7 un pivot illisible tu', remplace('if (!lu) { pivotsNonLus++; continue; }', 'if (!lu) { continue; }')],
  ['M8 AUDF pris pour un block', remplace('&& !wsPivotsWallet().some((p) => p.adr === a) && !DEVISES_BANNIES.has(a);', ';')],
  ['M9 le cache ne s oublie pas apres une tx', remplace("if (k.startsWith(moi + '|')) m.delete(k);", '{}')],
];
for (const [nom, muter] of MUTANTS) {
  let copie;
  try { copie = muter(brut); } catch (e) { ok(false, nom + ' — ' + e.message); continue; }
  const v = await verifier(copie);
  ok(v.length > 0, nom + ' : tue (' + (v[0] || 'SURVIT').slice(0, 100) + ')');
}
console.log(n + ' assertions, ' + ko + ' KO — ' + MUTANTS.length + ' mutants');
console.log('⚠️ NE PROUVE PAS qu un echange AUDF aboutisse (rien n est signe) ; bcProposerSwap est garde par test-wallet-swap-20261025.');
process.exit(ko ? 1 : 0);
