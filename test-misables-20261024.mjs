/* test-misables-20261024.mjs — LA REGLE « MISABLE » ET LE PLAN « PAYER UN JEU AVEC UN AUTRE JETON » (misables.js), SUR DES DEVIS REELS.
 * Les donnees : mesures/misables-20261024.json (231 jetons, bloc 53 031 600, lecture seule) et deux devis RELEVES sur le fork du banc
 * banc-misables-fork-20261024 (bloc 53 032 139 : 0,5005 USDC <- 237 059 NVDAc bruts ; <- 213 553 955 192 571 wei).
 * AFFIRME : (1) les selecteurs du routeur sont ceux lus dans son bytecode, les adresses celles des modules qui les ont mesurees ;
 *   (2) la regle rejoue la mesure : 21 / 20 / 19 misables a 0,50 / 5 / 10 USDC, et chaque cas type a SON code (ECART, PEU_PROFONDE,
 *   SOUS_LE_MARCHE, ROUTE_NON_CONSTRUITE, ROUTE_INJOIGNABLE, SANS_ROUTE, TAILLE_NON_MESUREE) ; rouge/vert sur le seuil (HSAIc 95 bps) ;
 *   (3) les ecarts du JSON se recalculent depuis sqrtPriceX96 + montantIn ; (4) le plan : approve EXACT du max-in (jamais illimite), swap
 *   exact-output dont l USDC va AU JOUEUR (directement, ou balaye vers lui avec le frais), allowance remise a 0, puis les appels du jeu
 *   IDENTIQUES a ceux de son module ; l ETH natif en value, refundETH ; (5) les refus : devis perime (30 ok / 31 refuse), futur, non
 *   eligible, route injoignable, destinataire = routeur, montant du devis different, tolerance hors bornes, mise > 10 USDC ;
 *   (6) 2026-10-25 : la LISTE SERVIE est rejouee sur mesures/misables-live-20261025.json (bloc 53 048 993) et comparee a un ORACLE
 *   independant de misables.js ; un candidat absent d un enregistrement = « not measured in this recording », jamais misable.
 * MISABLES_MODULE : le chemin d une COPIE mutee (muter-misables-20261024.mjs). ⛔ PORTABLE : process.exitCode. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const M = await import(pathToFileURL(process.env.MISABLES_MODULE || path.join(ICI, 'misables.js')).href);
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const CA = await import(pathToFileURL(path.join(ICI, 'calldata-aerodrome.js')).href);
const { QUOTEUR_AERODROME_CL } = await import(pathToFileURL(path.join(ICI, 'rolls-en-action.js')).href);
const { USDC_BASE, FEE_WALLET } = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const { ACTIONS_COINBASE } = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const BR = await import(pathToFileURL(path.join(ICI, 'blockrolls-plan.js')).href);
const SL = await import(pathToFileURL(path.join(ICI, 'slots-plan.js')).href);
const TP = await import(pathToFileURL(path.join(ICI, 'ticketpot-plan.js')).href);
const DU = await import(pathToFileURL(path.join(ICI, 'duels-plan-app.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const { SLOTS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'slots-deploiement.js')).href);
const { TICKETPOT_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'ticketpot-deploiement.js')).href);
const { DUELS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'duels-deploiement.js')).href);

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (x) => String(x || '').toLowerCase();
/* J = l enregistrement du 24/10 : c est MESURE_REFERENCE, celui qui JUSTIFIE la regle (seuil, profondeur) — les sections (1) a (3) le
 *   rejouent tel quel (il ne change pas : c est une mesure datee). J25 = l enregistrement du 25/10 (meme script relance, bloc 53 048 993) :
 *   la LISTE SERVIE depend des candidats (SANc / SEc / NOKc / LIc et ULc entres le 25/10), elle est rejouee sur lui (fin du fichier). */
const J = JSON.parse(readFileSync(path.join(ICI, 'mesures', 'misables-20261024.json'), 'utf8'));
const J25 = JSON.parse(readFileSync(path.join(ICI, 'mesures', 'misables-live-20261025.json'), 'utf8'));
const ROUTEUR = CA.ROUTEUR_AERODROME_CL, VIEILLE = CA.FACTORY_AERODROME_CL;
const JOUEUR = '0x5a1e0329309d77777777777777777777777777a1';
const ROLLS = bas(BLOCKROLLS_DEPLOIEMENT.adresse), SLOTS = bas(SLOTS_DEPLOIEMENT.adresse);
const MAX = (1n << 256n) - 1n;

/* ── (1) selecteurs et adresses ─────────────────────────────────────────────────────────────────────────── */
ok(selecteur(M.SIG.exactOutputSingle) === '0xc714e838', 'exactOutputSingle = 0xc714e838 (present dans le bytecode du routeur, sonde du jour)');
ok(selecteur(M.SIG.sweepTokenWithFee) === CA.SELECTEURS.sweepTokenWithFee && selecteur(M.SIG.multicall) === CA.SELECTEURS.multicall && selecteur(M.SIG.refundETH) === CA.SELECTEURS.refundETH && selecteur(M.SIG.approve) === CA.SELECTEURS.approve,
  'sweepTokenWithFee / multicall / refundETH / approve = les selecteurs LUS de calldata-aerodrome');
ok(M.QUOTEUR_CL === bas(QUOTEUR_AERODROME_CL) && M.USDC === bas(USDC_BASE), 'quoter CL et USDC = ceux des modules qui les ont mesures');
ok(readFileSync(path.join(ICI, 'routage.js'), 'utf8').includes(M.FACTORY_NOUVELLE_INJOIGNABLE) && M.FACTORY_NOUVELLE_INJOIGNABLE !== VIEILLE, 'la factory injoignable est celle que routage.js nomme, et pas celle du routeur');
ok(J.temoins.factoryDuQuoteurCl === VIEILLE && J.temoins.factoryDuRouteur === VIEILLE && J.temoins.codeFactoryNouvelleOctets > 0, 'la mesure a relu factory() du quoter et du routeur (= ' + VIEILLE + ') et le code de la nouvelle factory');
const registre = new Set(ACTIONS_COINBASE.map((a) => bas(a.adr)));
const actions = M.CANDIDATS_CL.filter((c) => c.famille === 'action');
ok(actions.length >= 20 && actions.every((c) => registre.has(c.jeton)), actions.length + ' candidats actions, TOUS dans le registre de l emetteur (paires.js)');
const poolsWethMesurees = J.table.find((t) => t.jeton === M.ETH).routes.filter((r) => r.route === 'aerodrome-cl');
ok(M.POOLS_WETH_USDC.length === 2 && M.POOLS_WETH_USDC.every((p) => poolsWethMesurees.some((r) => r.pool === p.pool && r.tickSpacing === p.tickSpacing && BigInt(r.usdcPool) >= M.PROFONDEUR_MIN_USDC)),
  'les pools WETH/USDC candidates sont celles rendues par getPool dans la mesure, au-dessus de la profondeur minimum');
/* 2026-10-25 : le 24/10 ULc etait exclu PARCE QU il etait hors du registre de l emetteur. Il y est entre (paires.js, 5 actions prouvees
 *   sur la chaine) et sa pool est dans POOLS_ACTIONS_AERODROME : il est candidat PAR LA MEME REGLE (« candidat <=> registre »). */
const ul = M.CANDIDATS_CL.find((c) => c.symbole === 'ULc');
ok(!!ul && registre.has(ul.jeton), 'ULc est candidat parce qu il est maintenant dans le registre de l emetteur (paires.js) — la raison de son exclusion du 24/10 ne tient plus');
ok(J25.temoins.factoryDuQuoteurCl === VIEILLE && J25.temoins.factoryDuRouteur === VIEILLE && J25.temoins.codeFactoryNouvelleOctets > 0, 'l enregistrement du 25/10 a relu les memes temoins (factory du quoter et du routeur, code de la nouvelle factory)');

/* ── (2) la regle rejoue la mesure ──────────────────────────────────────────────────────────────────────── */
const elig = (t, r, usdc, o = {}) => M.eligibilite({ jeton: t.jeton, route: r.route, factory: r.factory || null, usdcPool: r.usdcPool, ecartReferenceBps: r.ecartReferenceBps, devis: r.devis }, { usdc, ...o });
const misablesA = (usdc) => J.table.filter((t) => t.routes.some((r) => elig(t, r, usdc).ok)).length;
const comptes = M.TAILLES_USDC.map(misablesA);
ok(comptes.join('/') === M.MESURE_REFERENCE.misables.join('/') && comptes.join('/') === '21/20/19', 'misables au bloc ' + J.bloc + ' : ' + comptes.join(' / ') + ' a 0,50 / 5 / 10 USDC (MESURE_REFERENCE)');
ok(J.bloc === M.MESURE_REFERENCE.bloc && J.table.length === M.MESURE_REFERENCE.jetons, 'la mesure lue est celle que cite le module (bloc, ' + J.table.length + ' jetons)');
const route = (sym, pred = () => true) => { const t = J.table.find((x) => x.symbole === sym); return { t, r: t && t.routes.find(pred) }; };
const cas = (sym, pred, usdc, code, msg) => { const { t, r } = route(sym, pred); const e = t && r ? elig(t, r, usdc) : null; ok(e && (code === 'MISABLE' ? e.ok === true : e.code === code), sym + ' ' + msg + ' -> ' + (e && (e.ok ? 'MISABLE' : e.code))); };
const cl = (ts) => (r) => r.route === 'aerodrome-cl' && r.tickSpacing === ts;
cas('NVDAc', cl(10), 10000000n, 'MISABLE', 'pool ts 10 (ecart 5 bps, 205 k USDC) a 10 USDC');
cas('BILIc', cl(1), 500000n, 'ECART', 'pool ts 1 de 25 397 USDC dont la liquidite n est pas au prix (14,01 %)');
cas('NFLXc', cl(10), 500000n, 'PEU_PROFONDE', 'ecart 5 bps mais 1 212 USDC dans la pool');
cas('INFYc', cl(10), 500000n, 'SOUS_LE_MARCHE', 'ecart 56 bps mais la pool est 2,47 % sous la reference');
cas('INFYc', cl(1), 10000000n, 'ECART', 'ts 1 a 10 USDC (170 bps)');
cas('MSTRc', (r) => r.route === 'v4', 500000n, 'ROUTE_NON_CONSTRUITE', 'pool v4 USDC (frais 3 %)');
cas('UNIT', (r) => r.route === 'v4', 500000n, 'ROUTE_NON_CONSTRUITE', 'pool v4 ETH/UNIT (hook 7030), devis 10 bps a 0,50');
cas('HSAIc', cl(1), 500000n, 'MISABLE', 'a 0,50 USDC (95 bps)');
cas('HSAIc', cl(1), 5000000n, 'ECART', 'a 5 USDC (1 018 bps)');
cas('NVDAc', cl(10), 20000000n, 'TAILLE_NON_MESUREE', 'a 20 USDC (rien n est mesure au-dela de 10)');
const hs = route('HSAIc', cl(1));
ok(elig(hs.t, hs.r, 500000n, { seuilBps: 100 }).ok && !elig(hs.t, hs.r, 500000n, { seuilBps: 90 }).ok, 'rouge/vert : HSAIc a 95 bps passe a 1 %, pas a 0,90 %');
const nouvelle = J.table.filter((t) => t.marche && t.marche.injoignable);
ok(nouvelle.length === 21 && nouvelle.every((t) => M.eligibilite({ jeton: t.jeton, route: 'aero-nouvelle', factory: t.marche.factory, usdcPool: t.marche.usdcPool, devis: [{ usdc: '500000', ok: true, montantIn: '1', ecartBps: 0 }] }).code === 'ROUTE_INJOIGNABLE'),
  nouvelle.length + ' pools du Market sur la nouvelle factory : toutes ROUTE_INJOIGNABLE, meme avec un devis parfait');
ok(M.eligibilite({ jeton: '0x' + '1'.repeat(40), route: 'aerodrome-cl', factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd', usdcPool: '99999999999', devis: [{ usdc: '500000', ok: true, montantIn: '1', ecartBps: 0 }] }).code === 'ROUTE_INJOIGNABLE',
  'une pool CL d une AUTRE factory (Uniswap v3, lue dans la mesure) est injoignable, meme profonde et au prix');
ok(M.eligibilite({ jeton: '0x' + '1'.repeat(40), route: 'aucune' }).code === 'SANS_ROUTE' && M.eligibilite({ jeton: M.USDC }).ok, 'sans route : SANS_ROUTE ; USDC : paye directement');
const v4 = J.table.flatMap((t) => t.routes.filter((r) => r.route === 'v4' && r.feePpm >= 30000 && r.devis.some((d) => d.ok)));
ok(v4.length >= 5 && v4.every((r) => r.devis.filter((d) => d.ok).every((d) => d.ecartBps > M.SEUIL_ECART_BPS)), v4.length + ' pools v4 USDC/action cotees (frais 3..8 %) : toutes au-dessus de 1 % (min ' + Math.min(...v4.flatMap((r) => r.devis.filter((d) => d.ok).map((d) => d.ecartBps))) + ' bps)');

/* ── (3) les ecarts du JSON se recalculent ────────────────────────────────────────────────────────────────── */
let recalc = 0, faux = 0;
for (const t of J.table) for (const r of t.routes) if (r.route === 'aerodrome-cl' && r.devis) for (const d of r.devis) if (d.ok) {
  recalc += 1; if (M.ecartAuMoyen({ tokenIn: r.jetonIn, tokenOut: M.USDC, sortie: d.usdc, montantIn: d.montantIn, sqrtPriceX96: r.sqrtPriceX96 }) !== d.ecartBps) faux += 1;
}
ok(recalc > 100 && faux === 0, recalc + ' ecarts CL du JSON recalcules depuis sqrtPriceX96 + montantIn : ' + faux + ' different');
let refs = 0, refsFaux = 0;
for (const t of J.table) for (const r of t.routes) if (r.route === 'aerodrome-cl' && r.ecartReferenceBps !== null && r.pool !== t.marche.poolAdr) {
  refs += 1; if (M.ecartAReference({ jeton: r.jetonIn, sqrtNous: r.sqrtPriceX96, sqrtRef: t.marche.sqrtPriceX96 }) !== r.ecartReferenceBps) refsFaux += 1;
}
ok(refs > 20 && refsFaux === 0, refs + ' ecarts a la reference recalcules : ' + refsFaux + ' different');
ok(M.coutVsReference({ ecartBps: 56, ecartReferenceBps: -247 }) === 311 && M.coutVsReference({ ecartBps: 5, ecartReferenceBps: null }) === null, 'cout contre la reference : (1+e)/(1+r)-1 (INFYc ts 10 : 10 056 / 9 753 -> 3,11 %) ; reference absente = non jugee');

/* ── (4) le plan ─────────────────────────────────────────────────────────────────────────────────────────── */
ok(M.usdcAViser({ besoin: 500000n }) === 500500n && M.usdcAViser({ besoin: 500000n, fraisBps: 0 }) === 500000n, 'sortie visee : 0,5005 USDC pour 0,50 au joueur apres 0,1 % (le fork a recu EXACTEMENT 500 000) ; 0,50 sans frais');
let rondOk = true;
for (const b of [1n, 7n, 999n, 500000n, 5000000n, 10000000n, 123456789n]) for (const f of [1n, 10n, 30n, 100n]) {
  const x = M.usdcAViser({ besoin: b, fraisBps: f });
  if (!(x - (x * f) / 10000n >= b) || ((x - 1n) - ((x - 1n) * f) / 10000n >= b)) rondOk = false;
}
ok(rondOk, 'usdcAViser rend le PLUS PETIT X avec X - floor(X x bps / 10000) >= besoin (28 cas)');
ok(M.maxEntree(237059n, 50n) === 238245n && M.maxEntree(1n, 301n) === null && M.maxEntree(0n) === null, 'max-in = ceil(devis x 1,005) : 238 245 pour 237 059 (le fork) ; tolerance > 3 % ou devis nul refuses');

/* les devis RELEVES sur le fork (bloc 53 032 139) */
const NV = M.CANDIDATS_CL.find((c) => c.symbole === 'NVDAc'), W50 = M.CANDIDATS_CL.find((c) => c.natif && c.tickSpacing === 50);
const BQ = 53032139;
const devisNv = { etat: 'PRET', jeton: NV.jeton, jetonIn: NV.jetonIn, natif: false, symbole: 'NVDAc', famille: 'action', route: 'aerodrome-cl', factory: VIEILLE, pool: NV.pool, tickSpacing: 10,
  usdcSortie: 500500n, montantIn: 237059n, usdcPool: 205691362506n, ecartBps: 5, ecartReferenceBps: null, bloc: BQ };
const devisEth = { ...devisNv, jeton: M.ETH, jetonIn: M.WETH, natif: true, symbole: 'ETH', famille: 'eth', pool: W50.pool, tickSpacing: 50, montantIn: 213553955192571n, usdcPool: 750678797655n, ecartBps: 3 };
const TS = 1792852000;
const jeuRoll = { genre: 'rolls', contrat: ROLLS, guesses: [[1, 2, 3, 1, 2]], rollPrice: 500000n };
const p = M.planPayerEnJeton({ devis: devisNv, compte: JOUEUR, jeu: jeuRoll, blocActuel: BQ + 2, maintenant: TS });
ok(p.etat === 'PRET' && p.appels.length === 5, 'NVDAc -> 1 roll : PRET, 5 appels (' + p.etat + ' ' + (p.pourquoi || '') + ')');
const mots = (data, debut) => { const h = String(data).slice(debut); const r = []; for (let i = 0; i + 64 <= h.length; i += 64) r.push(h.slice(i, i + 64)); return r; };
const adr = (w) => '0x' + w.slice(24);
const big = (w) => BigInt('0x' + w);
if (p.etat === 'PRET') {
  const [a0, a1, a2, ...jeu] = p.appels;
  const w0 = mots(a0.data, 10);
  ok(bas(a0.to) === NV.jeton && a0.data.startsWith(CA.SELECTEURS.approve) && adr(w0[0]) === ROUTEUR && big(w0[1]) === 238245n && big(w0[1]) !== MAX,
    'appel 1 : approve(NVDAc -> routeur, 238 245) EXACT = max-in, jamais illimite');
  ok(bas(a1.to) === ROUTEUR && a1.data.startsWith(CA.SELECTEURS.multicall) && a1.value === '0x0', 'appel 2 : multicall du routeur, sans valeur');
  /* le multicall : [exactOutputSingle, sweepTokenWithFee] */
  const w1 = mots(a1.data, 10);
  const nEl = Number(big(w1[1]));
  const el = (k) => { const off = Number(big(w1[2 + k])) / 32; const len = Number(big(w1[2 + off])); return '0x' + w1.slice(3 + off).join('').slice(0, len * 2); };
  const eo = el(0), sw = el(1);
  const we = mots(eo, 10), ws = mots(sw, 10);
  ok(nEl === 2 && eo.startsWith('0xc714e838') && sw.startsWith(CA.SELECTEURS.sweepTokenWithFee), 'le multicall porte 2 appels : exactOutputSingle puis sweepTokenWithFee');
  ok(adr(we[0]) === NV.jeton && adr(we[1]) === M.USDC && big(we[2]) === 10n && adr(we[3]) === ROUTEUR && big(we[4]) === BigInt(TS + M.DELAI_S) && big(we[5]) === 500500n && big(we[6]) === 238245n && big(we[7]) === 0n,
    'exactOutputSingle(NVDAc, USDC, ts 10, routeur, deadline +' + M.DELAI_S + ' s, sortie EXACTE 500 500, max-in 238 245, 0)');
  ok(adr(ws[0]) === M.USDC && big(ws[1]) === 500000n && adr(ws[2]) === JOUEUR && big(ws[3]) === 10n && adr(ws[4]) === bas(FEE_WALLET), 'sweepTokenWithFee(USDC, au moins 500 000, LE JOUEUR, 10 bps, wallet des frais)');
  const w2 = mots(a2.data, 10);
  ok(bas(a2.to) === NV.jeton && a2.data.startsWith(CA.SELECTEURS.approve) && adr(w2[0]) === ROUTEUR && big(w2[1]) === 0n, 'appel 3 : approve(NVDAc -> routeur, 0) — l allocation restante remise a zero');
  const pr = BR.planRolls({ contrat: ROLLS, usdc: M.USDC, guesses: jeuRoll.guesses, rollPrice: 500000n });
  ok(jeu.length === pr.appels.length && jeu.every((a, i) => a.to === pr.appels[i].to && a.data === pr.appels[i].data), 'appels 4-5 : IDENTIQUES a planRolls (blockrolls-plan.js), approve USDC exact + roll');
  ok(p.resume.maxEntree === 238245n && p.resume.usdcSortie === 500500n && p.resume.usdcRecuAuMoins === 500000n && p.resume.destinataireUsdc === JOUEUR && /at most 238245 raw NVDAc/.test(p.resume.phrase),
    'le resume dit avant la signature : max-in, sortie USDC, recu au moins, destinataire');
  ok(p.exigeAtomique === false && p.atomiquePrefere === true, 'pas d atomicite exigee (l USDC arrive au joueur), un lot atomique prefere');
}
/* frais 0 : l USDC va DIRECTEMENT au joueur */
const p0 = M.planPayerEnJeton({ devis: { ...devisNv, usdcSortie: 500000n }, compte: JOUEUR, jeu: jeuRoll, blocActuel: BQ, maintenant: TS, fraisBps: 0 });
const we0 = p0.etat === 'PRET' ? mots(p0.appels[1].data, 10) : [];
ok(p0.etat === 'PRET' && p0.appels[1].data.startsWith('0xc714e838') && adr(we0[3]) === JOUEUR && big(we0[5]) === 500000n, 'frais 0 : exactOutputSingle seul, destinataire = LE JOUEUR, sortie 500 000');
/* l ETH natif */
const jeuSpin = { genre: 'spins', contrat: SLOTS, n: 1, spinPrice: 500000n };
const pe = M.planPayerEnJeton({ devis: devisEth, compte: JOUEUR, jeu: jeuSpin, blocActuel: BQ, maintenant: TS });
ok(pe.etat === 'PRET' && pe.appels.length === 3 && BigInt(pe.appels[0].value) === M.maxEntree(213553955192571n) && pe.appels[0].data.startsWith(CA.SELECTEURS.multicall),
  'ETH -> 1 spin : 3 appels, aucun approve, value = max-in (' + (pe.appels[0] && BigInt(pe.appels[0].value)) + ')');
if (pe.etat === 'PRET') {
  ok(pe.appels[0].data.endsWith(CA.SELECTEURS.refundETH.slice(2) + '0'.repeat(56)) && pe.appels[0].data.includes(M.WETH.slice(2)), 'le multicall natif finit par refundETH et paie en WETH');
  const ps = SL.planSpins({ contrat: SLOTS, usdc: M.USDC, n: 1, spinPrice: 500000n });
  ok(pe.appels.slice(1).every((a, i) => a.to === ps.appels[i].to && a.data === ps.appels[i].data), 'appels 2-3 : IDENTIQUES a Slots.planSpins');
}
/* les autres jeux, par LEURS builders */
const day = TP.jourDe(TS);
const jeux = [
  ['pass', { genre: 'pass', contrat: ROLLS, passPrice: 10000000n, maintenant: TS }, BR.planPass({ contrat: ROLLS, usdc: M.USDC, passPrice: 10000000n, maintenant: TS })],
  ['ticketpot', { genre: 'ticketpot', contrat: bas(TICKETPOT_DEPLOIEMENT.adresse), day, montant: 5000000n, maintenant: TS }, TP.planFund({ contrat: bas(TICKETPOT_DEPLOIEMENT.adresse), usdc: M.USDC, day, montant: 5000000n, maintenant: TS })],
  ['duel-create', { genre: 'duel-create', contrat: bas(DUELS_DEPLOIEMENT.adresse), stake: 5000000n, guess: [1, 1, 1, 1, 1], expiresIn: 3600 }, DU.planCreate({ contrat: bas(DUELS_DEPLOIEMENT.adresse), token: M.USDC, stake: 5000000n, guess: [1, 1, 1, 1, 1], expiresIn: 3600 })],
];
for (const [nom, jeu, attendu] of jeux) {
  const besoin = M.besoinDuJeu(attendu, jeu.contrat);
  const d = { ...devisNv, usdcSortie: M.usdcAViser({ besoin }), montantIn: 4741180n };
  const pj = M.planPayerEnJeton({ devis: d, compte: JOUEUR, jeu, blocActuel: BQ, maintenant: TS });
  ok(pj.etat === 'PRET' && pj.appels.slice(3).every((a, i) => a.data === attendu.appels[i].data && a.to === attendu.appels[i].to), nom + ' : besoin ' + besoin + ', les appels du jeu sont ceux de SON module (' + pj.etat + ' ' + (pj.pourquoi || '') + ')');
}
const duelJeton = { genre: 'duel-join', contrat: bas(DUELS_DEPLOIEMENT.adresse), duel: { token: NV.jeton, stake: '5000000' }, guess: [1, 1, 1, 1, 1], moi: JOUEUR, maintenant: TS };
ok(M.planPayerEnJeton({ devis: devisNv, compte: JOUEUR, jeu: duelJeton, blocActuel: BQ, maintenant: TS }).code === 'JEU', 'rejoindre un duel mise dans un autre jeton que l USDC : refuse');
const usdcDirect = M.planPayerEnJeton({ devis: { jeton: M.USDC }, compte: JOUEUR, jeu: jeuRoll, blocActuel: BQ, maintenant: TS });
ok(usdcDirect.etat === 'PRET' && usdcDirect.appels.length === 2 && usdcDirect.resume.swap === null, 'payer en USDC : le plan du jeu tel quel, aucun swap');

/* ── (5) les refus ──────────────────────────────────────────────────────────────────────────────────────── */
const plan = (o) => M.planPayerEnJeton({ devis: devisNv, compte: JOUEUR, jeu: jeuRoll, blocActuel: BQ, maintenant: TS, ...o });
ok(plan({ blocActuel: BQ + M.DEVIS_BLOCS_MAX }).etat === 'PRET' && plan({ blocActuel: BQ + M.DEVIS_BLOCS_MAX + 1 }).code === 'DEVIS_PERIME', 'devis de ' + M.DEVIS_BLOCS_MAX + ' blocs : PRET ; de ' + (M.DEVIS_BLOCS_MAX + 1) + ' : DEVIS_PERIME');
ok(plan({ blocActuel: BQ - 1 }).code === 'DEVIS_PERIME' && plan({ blocActuel: null }).code === 'DEVIS_PERIME', 'devis d un bloc futur, ou tete inconnue : refuse');
const bili = route('BILIc', cl(1));
ok(plan({ devis: { ...devisNv, jeton: bili.t.jeton, jetonIn: bili.t.jeton, symbole: 'BILIc', pool: bili.r.pool, tickSpacing: 1, usdcPool: BigInt(bili.r.usdcPool), ecartBps: 1401 } }).code === 'ECART', 'BILIc (ecart reel 1 401 bps) : ECART');
ok(plan({ devis: { ...devisNv, usdcPool: 1212440964n } }).code === 'PEU_PROFONDE', 'pool de 1 212 USDC (NFLXc mesuree) : PEU_PROFONDE');
ok(plan({ devis: { ...devisNv, factory: M.FACTORY_NOUVELLE_INJOIGNABLE } }).code === 'ROUTE_INJOIGNABLE', 'devis dont la pool est sur la nouvelle factory : ROUTE_INJOIGNABLE');
ok(plan({ devis: { ...devisNv, route: 'v4' } }).code === 'ROUTE_NON_CONSTRUITE' && plan({ devis: { ...devisNv, route: 'aero-nouvelle' } }).code === 'ROUTE_INJOIGNABLE', 'route v4 ou aero-nouvelle : refusee');
ok(plan({ devis: { ...devisNv, ecartReferenceBps: -247 } }).code === 'SOUS_LE_MARCHE', 'pool 2,47 % sous la reference : SOUS_LE_MARCHE');
ok(plan({ compte: ROUTEUR }).code === 'DESTINATAIRE' && plan({ compte: '0x' + '0'.repeat(40) }).code === 'COMPTE', 'le routeur ou l adresse nulle comme joueur : refuse');
ok(plan({ devis: { ...devisNv, usdcSortie: 500000n } }).code === 'DEVIS_MONTANT', 'devis de 500 000 quand le jeu + frais demandent 500 500 : DEVIS_MONTANT');
ok(plan({ toleranceBps: 0n }).code === 'TOLERANCE' && plan({ toleranceBps: 301n }).code === 'TOLERANCE', 'tolerance 0 ou > 3 % : refusee');
ok(plan({ fraisBps: 101n }).code === 'FRAIS', 'frais > 1 % : refuse (borne de calldata-aerodrome)');
ok(plan({ devis: { ...devisNv, natif: true } }).code === 'DEVIS', 'un devis natif qui n est pas l ETH : refuse');
ok(plan({ maintenant: null }).code === 'HORLOGE', 'sans heure, pas de deadline : refuse');
const gros = M.planPayerEnJeton({ devis: { ...devisNv, usdcSortie: M.usdcAViser({ besoin: 20000000n }) }, compte: JOUEUR, jeu: { genre: 'ticketpot', contrat: bas(TICKETPOT_DEPLOIEMENT.adresse), day, montant: 20000000n, maintenant: TS }, blocActuel: BQ, maintenant: TS });
ok(gros.code === 'TAILLE_NON_MESUREE', 'une mise de 20 USDC (au-dela de la plus grande taille mesuree) : refusee');
ok(plan({ devis: null }).code === 'SANS_DEVIS', 'sans devis : rien n est bati');
let jete = false; try { M.calldataExactOutputSingleCL({ tokenIn: NV.jeton, tokenOut: M.USDC, tickSpacing: 10, recipient: JOUEUR, deadline: 1, amountOut: 1, amountInMaximum: MAX }); } catch (_) { jete = true; }
ok(jete, 'exactOutputSingle avec un max-in illimite : refuse a l encodage');
ok(M.besoinDuJeu({ appels: [{ to: M.USDC, data: CA.calldataApprove({ token: M.USDC, montant: 5n, beneficiaire: SLOTS }).data }] }, ROLLS) === null, 'un approve USDC vers un AUTRE contrat que le jeu : besoin illisible');

/* listeMisables : une ligne par jeton, la meilleure pool */
/* 2026-10-25 : cotDe lit UN enregistrement donne ; un candidat dont la pool n y est pas (SANc / SEc / NOKc / LIc dans celui du 24/10)
 *   rend NON_MESURE « not measured in this recording » — jamais un crash (le 24/10 : t.routes sur undefined), jamais misable. */
const NON_ENREGISTRE = 'not measured in this recording';
const cotDe = (c, E = J25) => { const t = E.table.find((x) => x.jeton === c.jeton); const r = t && t.routes.find((x) => x.route === 'aerodrome-cl' && x.pool === c.pool);
  if (!r) return { etat: 'NON_MESURE', pourquoi: NON_ENREGISTRE + ' (block ' + E.bloc + ')' };
  return { etat: 'PRET', factory: VIEILLE, usdcPool: BigInt(r.usdcPool), ecartReferenceBps: r.ecartReferenceBps, referencePool: null, bloc: E.bloc,
    devis: r.devis.map((d) => ({ usdc: d.usdc, usdcSortie: BigInt(d.usdc), ok: d.ok, montantIn: d.ok ? BigInt(d.montantIn) : null, ecartBps: d.ok ? d.ecartBps : null })) }; };
/* L ATTENDU, DERIVE de l enregistrement par un ORACLE qui n utilise PAS misables.js (sinon un mutant de la regle passerait des deux cotes) :
 *   les nombres de la consigne — ecart <= 100 bps, USDC de la pool >= 10 000 USDC, factory = celle du routeur (calldata-aerodrome),
 *   cout contre la reference (1+e)/(1+r)-1 <= 100 bps quand elle est enregistree. Par jeton candidat : misable si UNE de ses pools l est.
 *   ⛔ La regle de l aller-retour (pools-actions-aerodrome.js ALLER_RETOUR_REFUSES) N EST PAS appliquee par misables.js a ce jour : l oracle
 *   ne l applique pas non plus (il decrit ce que le module sert, pas ce qu il devrait servir). */
const oracle = (E) => {
  const parJeton = new Map(), absents = [];
  for (const c of M.CANDIDATS_CL) {
    const t = E.table.find((x) => x.jeton === c.jeton);
    const r = t && t.routes.find((x) => x.route === 'aerodrome-cl' && x.pool === c.pool);
    if (!r) absents.push(c.symbole);
    const k = [0, 1, 2].map((i) => {
      const d = r && r.devis && r.devis[i];
      if (!d || d.ok !== true || bas(r.factory) !== VIEILLE || !(Number(d.ecartBps) <= 100) || BigInt(r.usdcPool || 0) < 10000000000n) return false;
      const ref = r.ecartReferenceBps;
      return ref === null || ref === undefined || Math.round(((10000 + d.ecartBps) * 10000) / (10000 + ref) - 10000) <= 100;
    });
    parJeton.set(c.jeton, (parJeton.get(c.jeton) || [false, false, false]).map((v, i) => v || k[i]));
  }
  return { parJeton, absents, comptes: [0, 1, 2].map((i) => [...parJeton.values()].filter((v) => v[i]).length) };
};
const servieSur = (E) => M.listeMisables(M.CANDIDATS_CL.map((c) => M.ligneMisable(c, cotDe(c, E))));
const comptesDe = (ls) => [0, 1, 2].map((i) => ls.filter((l) => l.tailles[i].misable).length);
const O25 = oracle(J25);
const liste = servieSur(J25);
const servis = liste.filter((l) => l.misable).length;
ok(J25.table.length > 0 && O25.absents.length === 0, 'enregistrement du 25/10 (bloc ' + J25.bloc + ', ' + J25.table.length + ' jetons) : chaque pool candidate y est cotee (' + O25.absents.length + ' absente)');
ok(comptesDe(liste).join('/') === O25.comptes.join('/') && liste.length === O25.parJeton.size && liste.find((l) => l.jeton === M.ETH).tickSpacing === 1 && new Set(liste.map((l) => l.jeton)).size === liste.length,
  'liste servie sur l enregistrement du 25/10 : ' + comptesDe(liste).join(' / ') + ' misables a 0,50 / 5 / 10 = l oracle (' + O25.comptes.join(' / ') + '), ' + liste.length + ' lignes, une par jeton, ETH sur sa pool ts 1');
const diff25 = liste.filter((l) => l.tailles.some((t, i) => t.misable !== O25.parJeton.get(l.jeton)[i])).map((l) => l.symbole);
ok(diff25.length === 0, 'chaque ligne, a chaque taille, = l oracle (' + diff25.length + ' differente(s) ' + diff25.join(' ') + ')');
/* l enregistrement du 24/10 rejoue avec les candidats d AUJOURD HUI : les pools qu il n a pas cotees sont NON_MESURE, pas un crash */
const O24 = oracle(J);
const liste24 = servieSur(J);
const absents24 = liste24.filter((l) => l.tailles.every((t) => t.code === 'NON_MESURE' && String(t.raison).startsWith(NON_ENREGISTRE)));
ok(O24.absents.length > 0 && absents24.length === O24.absents.length && absents24.every((l) => !l.misable && l.tailles.every((t) => !t.misable)) && comptesDe(liste24).join('/') === O24.comptes.join('/'),
  'sur l enregistrement du 24/10 : ' + absents24.map((l) => l.symbole).join(' ') + ' « ' + NON_ENREGISTRE + ' », jamais misables ; ' + comptesDe(liste24).join(' / ') + ' = l oracle');
const lNouvelle = M.ligneMisable(NV, { ...cotDe(NV), factory: M.FACTORY_NOUVELLE_INJOIGNABLE });
ok(!lNouvelle.misable && lNouvelle.tailles.every((t) => t.code === 'ROUTE_INJOIGNABLE'), 'une ligne dont la pool LUE repond la nouvelle factory : ROUTE_INJOIGNABLE aux 3 tailles');
ok(M.listeMisables([M.ligneMisable(NV, { ...cotDe(NV), usdcPool: 1n }), M.ligneMisable(NV, cotDe(NV))])[0].misable === true, 'deux pools pour un jeton : la liste garde celle qui est misable');

/* ── (7) 2026-10-25 : LA REFERENCE NON LUE N EST PAS UNE REFERENCE ABSENTE ─────────────────────────────────────────────────────────
 *   Prod, /api/misables au bloc 53 064 731 : SONYc NON_MESURE, « You reached Public endpoint rate limit » (publicnode refuse sous la
 *   charge). La MEME panne sur le SEUL slot0 de la pool de reference du Market etait avalee (catch -> rr = null -> ecartReferenceBps
 *   null -> « non jugee ») : la ligne sortait MISABLE sans que le cout contre le marche soit connu, et le plan payait de meme.
 *   Une reference ABSENTE (le Market n en montre pas) ou SANS PRIX (slot0 lu = 0) reste non jugee ; une reference DEMANDEE et NON LUE
 *   (appel refuse, ou `0x`) rend REFERENCE_NON_LUE, jamais misable. */
{
  const t = J25.table.find((x) => x.jeton === NV.jeton), r = t && t.routes.find((x) => x.route === 'aerodrome-cl' && x.pool === NV.pool);
  const REF = '0x' + '7e'.repeat(20);
  const S = { q: selecteur(M.SIG.quoteExactOutputSingle), slot0: selecteur('slot0()'), factory: selecteur('factory()'), bal: selecteur('balanceOf(address)') };
  const motH = (x) => BigInt(x).toString(16).padStart(64, '0');
  const faux = (refRepond) => async (methode, params) => {
    if (methode === 'eth_blockNumber') return '0x' + J25.bloc.toString(16);
    const to = bas(params[0].to), data = String(params[0].data), s = data.slice(0, 10);
    if (to === REF && s === S.slot0) return refRepond();
    if (to === NV.pool && s === S.slot0) return '0x' + motH(r.sqrtPriceX96) + motH(0).repeat(6);
    if (to === NV.pool && s === S.factory) return '0x' + motH(VIEILLE);
    if (to === M.USDC && s === S.bal) return '0x' + motH(r.usdcPool);
    if (to === M.QUOTEUR_CL && s === S.q) { const out = BigInt('0x' + data.slice(10 + 2 * 64, 10 + 3 * 64)); const d = r.devis.find((x) => BigInt(x.usdc) === out) || { ok: true, usdc: out, montantIn: (BigInt(r.devis[0].montantIn) * out + BigInt(r.devis[0].usdc) - 1n) / BigInt(r.devis[0].usdc) }; if (d && d.ok) return '0x' + motH(d.montantIn) + motH(0).repeat(3); }
    throw new Error('execution reverted');
  };
  const ligne = async (refRepond) => M.ligneMisable(NV, await M.coterMisableTailles({ rpc: faux(refRepond), candidat: NV, reference: { pool: REF }, bloc: J25.bloc }));
  const limite = () => Promise.reject(new Error('You reached Public endpoint rate limit, please upgrade to paid plan'));
  const lA = await ligne(limite), lB = await ligne(() => '0x');
  const lC = await ligne(() => '0x' + motH(r.sqrtPriceX96) + motH(0).repeat(6)), lD = await ligne(() => '0x' + motH(0).repeat(7));
  ok(!!r && r.devis.every((d) => d.ok && d.ecartBps <= 100) && BigInt(r.usdcPool) >= M.PROFONDEUR_MIN_USDC, '(7) temoin : la pool NVDAc enregistree le 25/10 passe la regle aux 3 tailles (sinon ce qui suit ne prouve rien)');
  ok(!lA.misable && lA.tailles.every((x) => !x.misable && x.code === 'REFERENCE_NON_LUE'), '(7) slot0 de la reference REFUSE (rate limit) : REFERENCE_NON_LUE aux 3 tailles, jamais misable -> ' + lA.tailles.map((x) => x.code).join(','));
  ok(!lB.misable && lB.tailles.every((x) => !x.misable && x.code === 'REFERENCE_NON_LUE'), '(7) slot0 de la reference = `0x` (non lu) : REFERENCE_NON_LUE aux 3 tailles -> ' + lB.tailles.map((x) => x.code).join(','));
  ok(lC.misable && lC.tailles.every((x) => x.misable && x.coutReferenceBps === x.ecartBps), '(7) reference LUE au meme prix : misable, cout contre le marche = l ecart -> ' + lC.tailles.map((x) => x.code + '/' + x.coutReferenceBps).join(','));
  ok(lD.misable && lD.tailles.every((x) => x.misable && x.coutReferenceBps === null), '(7) reference lue SANS prix (slot0 = 0) : non jugee, comme avant -> ' + lD.tailles.map((x) => x.code).join(','));
  /* le PLAN (la mise elle-meme re-cote avec la reference) : meme regle */
  const dA = await M.coterMisable({ rpc: faux(limite), candidat: NV, usdcSortie: 500500n, reference: { pool: REF } });
  const pA = dA.etat === 'PRET' ? M.planPayerEnJeton({ devis: dA, compte: JOUEUR, jeu: jeuRoll, blocActuel: J25.bloc + 2, maintenant: TS }) : dA;
  const dC = await M.coterMisable({ rpc: faux(() => '0x' + motH(r.sqrtPriceX96) + motH(0).repeat(6)), candidat: NV, usdcSortie: 500500n, reference: { pool: REF } });
  const pC = dC.etat === 'PRET' ? M.planPayerEnJeton({ devis: dC, compte: JOUEUR, jeu: jeuRoll, blocActuel: J25.bloc + 2, maintenant: TS }) : dC;
  ok(pA.etat === 'REFUSE' && pA.code === 'REFERENCE_NON_LUE' && pA.appels.length === 0, '(7) plan dont la reference est refusee : REFUSE REFERENCE_NON_LUE, 0 appel -> ' + pA.etat + ' ' + pA.code);
  ok(pC.etat === 'PRET', '(7) le meme plan, reference lue : PRET -> ' + pC.etat + ' ' + (pC.pourquoi || ''));
  ok(M.eligibilite({ jeton: NV.jeton, route: 'aerodrome-cl', factory: VIEILLE, usdcPool: r.usdcPool, ecartReferenceBps: null, devis: r.devis }).ok === true, '(7) une mesure SANS champ referenceLue (enregistrements, reference absente) : jugee comme avant');

  /* ── (8) 2026-10-25 : UN DEVIS REFUSE PAR LE DEBIT N EST PAS « PAS DE DEVIS » ───────────────────────────────────────────────────
   *   Prod, bloc 53 066 483 : NOKc a 0,50 et SEc a 5/10 servis SANS_DEVIS « You reached Public endpoint rate limit » — le jeton quittait
   *   le menu a cette taille et n etait jamais relu (le serveur ne relit que NON_MESURE). Seuls un REVERT (rpcRails : `definitif`) et un
   *   devis LU a 0 sont SANS_DEVIS ; un refus de transport ou une reponse `0x` = NON_MESURE. */
  const fauxDevis = (devis05) => async (methode, params) => {
    const s = String(params && params[0] && params[0].data || '').slice(0, 10), to = bas(params && params[0] && params[0].to);
    if (methode === 'eth_call' && to === M.QUOTEUR_CL && s === S.q && BigInt('0x' + String(params[0].data).slice(10 + 2 * 64, 10 + 3 * 64)) === 500000n) return devis05();
    return faux(() => '0x' + motH(r.sqrtPriceX96) + motH(0).repeat(6))(methode, params);
  };
  const ligne8 = async (devis05) => M.ligneMisable(NV, await M.coterMisableTailles({ rpc: fauxDevis(devis05), candidat: NV, reference: { pool: REF }, bloc: J25.bloc }));
  const revertDef = () => { const e = new Error('execution reverted'); e.definitif = true; return Promise.reject(e); };
  const revertNu = () => Promise.reject(new Error('execution reverted: SPL'));
  const delai = () => Promise.reject(new Error('The operation was aborted due to timeout'));
  const revertSansMot = () => { const e = new Error('invalid opcode: INVALID'); e.definitif = true; return Promise.reject(e); };
  const l8 = { revertSansMot: await ligne8(revertSansMot), limite: await ligne8(limite), delai: await ligne8(delai), vide: await ligne8(() => '0x'), revertDef: await ligne8(revertDef), revertNu: await ligne8(revertNu), zero: await ligne8(() => '0x' + motH(0).repeat(4)) };
  const codes8 = (l) => l.tailles.map((x) => x.code).join(',');
  ok(l8.limite.tailles[0].code === 'NON_MESURE' && !l8.limite.tailles[0].misable && l8.limite.tailles[1].misable && l8.limite.tailles[2].misable, '(8) devis 0,50 refuse (rate limit) : NON_MESURE a 0,50, les autres tailles jugees -> ' + codes8(l8.limite));
  ok(/rate limit/.test(l8.limite.tailles[0].raison), '(8) la raison garde le message du noeud -> ' + l8.limite.tailles[0].raison.slice(0, 90));
  ok(l8.delai.tailles[0].code === 'NON_MESURE', '(8) devis 0,50 en delai depasse : NON_MESURE -> ' + codes8(l8.delai));
  ok(l8.vide.tailles[0].code === 'NON_MESURE', '(8) devis 0,50 = `0x` (non lu) : NON_MESURE -> ' + codes8(l8.vide));
  ok(l8.revertDef.tailles[0].code === 'SANS_DEVIS', '(8) devis 0,50 REVERTE (definitif, comme rpcRails le marque) : SANS_DEVIS -> ' + codes8(l8.revertDef));
  ok(l8.revertNu.tailles[0].code === 'SANS_DEVIS', '(8) devis 0,50 « execution reverted » sans marque : SANS_DEVIS -> ' + codes8(l8.revertNu));
  ok(l8.revertSansMot.tailles[0].code === 'SANS_DEVIS', '(8) refus de la chaine marque definitif sans le mot « revert » : SANS_DEVIS -> ' + codes8(l8.revertSansMot));
  ok(l8.zero.tailles[0].code === 'SANS_DEVIS', '(8) devis 0,50 LU a 0 (devis vide) : SANS_DEVIS -> ' + codes8(l8.zero));
  /* une mesure ENREGISTREE (sans champ nonLu) dont le devis est ok:false : SANS_DEVIS comme avant */
  ok(M.eligibilite({ jeton: NV.jeton, route: 'aerodrome-cl', factory: VIEILLE, usdcPool: r.usdcPool, ecartReferenceBps: null, devis: [{ usdc: '500000', ok: false }] }).code === 'SANS_DEVIS', '(8) une mesure enregistree ok:false sans nonLu : SANS_DEVIS comme avant');
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
