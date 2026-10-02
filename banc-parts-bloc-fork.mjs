/* BANC FORK — SPLIT DU BLOCK (Raksha 10:21) : 0,10 % = 0,07 % a6cf + 0,03 % createur (sous son minimum : au collateral), AU WEI.
 *   Drapeau OFF : le 0,09 % en vigueur, inchange.
 *
 *   PORT_FORK=8600 node banc-parts-bloc-fork.mjs [/workspace/mp-data/graphe.json]
 *
 * ⛔⛔ FORK UNIQUEMENT (chainId 8453 + anvil_nodeInfo), expediteur = adresse vierge usurpee, JAMAIS a6cf.
 * ⛔ Le drapeau du code reste OFF (RACHAT_DETENTEURS_ACTIVE = false) : le banc passe `actif: true` EXPLICITEMENT
 *   pour les cas ON, et prouve aussi le cas OFF.
 * Juge (chaque swap) :
 *   P1 status 0x1 ;
 *   P2 m = solde du routeur dans l action au noeud = somme des Transfer de l action VERS le routeur dans la tx
 *      + poussiere d avant (LOGS, aucun devis) ;
 *   P3 a6cf : UN Transfer routeur -> a6cf, en l action, == floor(m x 700 / 1e6) drapeau ON, floor(m x 900 / 1e6) OFF ;
 *   P4 createur : == floor(m x 300 / 1e6) s il tient >= minimum, sinon 0 (et aucun Transfer vers lui) ;
 *   P5 collateral : == floor(m x 300 / 1e6) si createur sous le minimum, sinon 0 ;
 *   P6 aucun Transfer d un token de BLOCK vers a6cf / createur / collateral ;
 *   P7 recu == devis (meme etat) et >= minimum ; paye == montant ;
 *   P8 routeur vide sur tous les jetons du chemin. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ADRESSES, devisesFraisAdmises, planifier, construireRoute, assemblerExecute, CMD, decrireChemin, noeud } from './multipool.js';
import { ACTIONS_COINBASE } from './paires.js';
import { selecteur, mot, motAdr } from './pool.js';
import { RACHAT_DETENTEURS_ACTIVE, nouveauRegistre, inscrireBloc, montantsParts, planifierBloc, routeParts } from './parts-bloc.js';

const URL = 'http://127.0.0.1:' + (process.env.PORT_FORK || '8600');
const GRAPHE = process.argv[2] || '/workspace/mp-data/graphe.json';
const USER = '0x7e57000000000000000000000000000000c0ffee';
const CREA_H = '0x7e57000000000000000000000000000000c4ea71'; /* createur AU minimum (egalite = au-dessus) */
const CREA_B = '0x7e57000000000000000000000000000000c4ea70'; /* createur a minimum - 1 */
const A6CF = ADRESSES.FEE_WALLET, R = ADRESSES.ROUTEUR, ETH = ADRESSES.ETH, WETH = ADRESSES.WETH, USDC = ADRESSES.USDC;
for (const x of [USER, CREA_H, CREA_B]) if (x === A6CF) throw new Error('jamais a6cf');
const bas = (a) => String(a || '').toLowerCase();
let id = 0;
async function rpc(method, params = []) {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}
const S = (s) => '0x' + selecteur(s);
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const solde = async (j, q) => (j === ETH ? BigInt(await rpc('eth_getBalance', [q, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: S('balanceOf(address)') + motAdr(q) }, 'latest'])));
async function envoyer(tx, from = USER) {
  const h = await rpc('eth_sendTransaction', [{ from, gas: '0x7a1200', ...tx }]);
  for (let t = 0; t < 60; t += 1) { const rc = await rpc('eth_getTransactionReceipt', [h]); if (rc) return rc; await new Promise((z) => setTimeout(z, 250)); }
  throw new Error('pas de recu');
}
const chainId = Number(await rpc('eth_chainId'));
let info = null; try { info = await rpc('anvil_nodeInfo'); } catch (_) { /* */ }
if (chainId !== 8453 || !info) { console.log('KO : pas un fork anvil de Base'); process.exit(1); }
const g = JSON.parse(readFileSync(GRAPHE, 'utf8'));
if (Number(await rpc('eth_blockNumber')) !== g.bloc) { console.log('KO : fork non vierge (bloc courant != ' + g.bloc + ') — NON MESURE'); process.exit(1); }
for (const x of [USER, CREA_H, CREA_B]) {
  if ((await rpc('eth_getCode', [x, 'latest'])) !== '0x') { console.log('KO : ' + x + ' porte du code'); process.exit(1); }
  await rpc('anvil_impersonateAccount', [x]);
  await rpc('anvil_setBalance', [x, '0x' + (100n * 10n ** 18n).toString(16)]);
}
await rpc('evm_mine', []); /* meme heure pour devis et execution (voir banc-multipool-fork.mjs) */
const aretes = g.aretes.map((e) => ({ ...e, liqUsd: Number(e.liqUsd) || 0 }));
const N = new Map(g.noeuds.map((n) => [n.adr, n]));
const ap = JSON.parse(readFileSync('/workspace/mp-data/actions-pools.json', 'utf8'));
const actions = ap.actions.filter((x) => x.dec !== null && x.dec !== undefined);
for (const x of actions) if (!N.has(x.adr)) N.set(x.adr, { adr: x.adr, sym: x.symbole || x.ticker, classe: 'action', dec: x.dec });
{ const vus = new Set(aretes.map((e) => e.id)); for (const p of ap.pools) if (p.arete && !vus.has(p.id) && p.retenu1000 !== null) { aretes.push({ ...p.arete, liqUsd: p.tvlUsd || 0 }); vus.add(p.id); } }
const BLOCKS = [...N.values()].filter((n) => n.classe === 'block').map((n) => n.adr);
const ADMISES = devisesFraisAdmises([...ACTIONS_COINBASE, ...actions.map((x) => x.adr)], { blocks: BLOCKS });
const estBlock = (a) => BLOCKS.includes(noeud(a));
const sym = (a) => (noeud(a) === ETH ? 'ETH' : (N.get(noeud(a)) || {}).sym || a.slice(0, 10));
const symboles = Object.fromEntries([...N.values()].map((n) => [n.adr, n.sym]));
const SI = '0xb2000000000000000000001eb03f58a18f2add01', NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const BLUEPILL = '0xb2000000000000000000006745009423d9a49401', HIMS = '0xb20000000000000000000043a599976181bcf336';
const E = 10n ** 18n;
const deadline = async () => BigInt(Number((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 3600);
console.log('=== BANC PARTS DU BLOCK — fork ' + URL + ' bloc ' + g.bloc + ' · drapeau du code RACHAT_DETENTEURS_ACTIVE = ' + RACHAT_DETENTEURS_ACTIVE + ' ===');

/* ── mise en place : le swapper achete NVDAc et HIMSc (route 0,09 % ordinaire), les createurs recoivent leur stock ── */
async function swapOrdinaire(de, vers, montant) {
  const p = await planifier({ rpc, aretes, de, vers, montant, destinataire: USER, admises: ADMISES, deadline: await deadline(), sautsMax: 3, max: 16 });
  if (p.etat !== 'PRET') throw new Error('mise en place ' + sym(de) + '->' + sym(vers) + ' : ' + p.pourquoi);
  if (p.tx.approbation) await envoyer({ to: p.tx.approbation.jeton, data: S('approve(address,uint256)') + motAdr(R) + mot(montant) });
  const rc = await envoyer({ to: p.tx.to, data: p.tx.data, value: p.tx.value });
  if (rc.status !== '0x1') throw new Error('mise en place revert');
}
await swapOrdinaire(ETH, NVDA, E / 5n);
await swapOrdinaire(ETH, HIMS, E / 20n);
const MIN_N = (await solde(NVDA, USER)) / 20n, MIN_H = (await solde(HIMS, USER)) / 20n;
const donner = async (j, a, v) => { const rc = await envoyer({ to: j, data: S('transfer(address,uint256)') + motAdr(a) + mot(v) }); if (rc.status !== '0x1') throw new Error('transfer KO'); };
await donner(NVDA, CREA_H, MIN_N); await donner(NVDA, CREA_B, MIN_N - 1n);
await donner(HIMS, CREA_H, MIN_H); await donner(HIMS, CREA_B, MIN_H - 1n);
const regH = nouveauRegistre(), regB = nouveauRegistre();
for (const [reg, c] of [[regH, CREA_H], [regB, CREA_B]]) {
  if (inscrireBloc(reg, { block: SI, action: NVDA, createur: c, minimumCreateur: MIN_N }).etat !== 'OK') throw new Error('inscription');
  if (inscrireBloc(reg, { block: BLUEPILL, action: HIMS, createur: c, minimumCreateur: MIN_H }).etat !== 'OK') throw new Error('inscription');
}
const COLL_SI = regH.get(SI).collateral, COLL_BP = regH.get(BLUEPILL).collateral;
console.log('minimums : NVDAc ' + MIN_N + ' · HIMSc ' + MIN_H + ' · createur H = minimum, createur B = minimum - 1');
console.log('collateral SI ' + COLL_SI + ' (code ' + (await rpc('eth_getCode', [COLL_SI, 'latest'])) + ') · BLUEPILL ' + COLL_BP + ' (code ' + (await rpc('eth_getCode', [COLL_BP, 'latest'])) + ')');
const soldeCreateur = async (c, a) => solde(a, c);

/* ── le juge ── */
async function photo(jetons, qui) { const o = {}; for (const j of jetons) { o[j] = {}; for (const q of qui) o[j][q] = await solde(j, q); } return o; }
async function lancer({ nom, de, vers, montant, reg, actif = true, sautsMax = 3, modifier = null, attenduRevert = false, planDonne = null }) {
  const plan = planDonne || await planifierBloc({ rpc, aretes, de, vers, montant, destinataire: USER, admises: ADMISES, registre: reg, soldeCreateur, actif, deadline: await deadline(), sautsMax, max: 16 });
  if (plan.etat !== 'PRET') { console.log('\n[' + nom + '] ' + plan.etat + ' — ' + plan.pourquoi); return { nom, verdict: plan.etat, pourquoi: plan.pourquoi }; }
  const tx = modifier ? modifier(plan.tx) : plan.tx;
  const pb = plan.partsBloc && plan.partsBloc.etat === 'OK' ? plan.partsBloc : null;
  const entree = pb ? pb.entree : (reg && [...reg.values()].find((e) => [de, vers].map(noeud).includes(e.block)));
  const crea = entree ? entree.createur : CREA_H, coll = entree ? entree.collateral : COLL_SI;
  const ch = plan.meilleur.chemin;
  const jetons = [...new Set([ETH, WETH, ch[0].de, ...ch.map((s) => s.vers)].map((x) => (x === ETH ? ETH : x)))];
  const qui = [USER, A6CF, crea, coll, R];
  if (tx.approbation) await envoyer({ to: tx.approbation.jeton, data: S('approve(address,uint256)') + motAdr(R) + mot(montant) });
  const avant = await photo(jetons, qui);
  let rc;
  try { rc = await envoyer({ to: tx.to, data: tx.data, value: tx.value }); } catch (err) { rc = { status: 'REVERT ' + String(err.message).slice(0, 100), logs: [], gasUsed: '0x0', effectiveGasPrice: '0x0' }; }
  const apres = await photo(jetons, qui);
  const d = (j, q) => apres[j][q] - avant[j][q];
  const lignes = [], ko = [];
  const t = (c, x) => { lignes.push((c ? 'ok ' : 'KO ') + x); if (!c) ko.push(x); };
  const fd = noeud(tx.fraisDevise);
  if (attenduRevert) {
    const rien = qui.filter((q) => q !== USER).every((q) => jetons.every((j) => d(j, q) === 0n || (q === USER)));
    t(rc.status !== '0x1', 'R1 la tx REVERT : ' + rc.status);
    t(rien, 'R2 a6cf, createur, collateral, routeur : 0 sur tous les jetons');
  } else {
    const logs = rc.logs || [];
    const estTr = (l) => l.topics[0] === TRANSFER && l.topics.length === 3;
    const src = (l) => bas('0x' + l.topics[1].slice(26)), dst = (l) => bas('0x' + l.topics[2].slice(26));
    t(rc.status === '0x1', 'P1 status ' + rc.status);
    const m = logs.filter((l) => estTr(l) && bas(l.address) === fd && dst(l) === R).reduce((x, l) => x + BigInt(l.data), 0n) + avant[fd][R];
    const att = montantsParts(m, { actif: !!pb, soldeCreateur: pb ? pb.soldeCreateur : 0n, minimumCreateur: entree ? entree.minimumCreateur : null });
    const vers = (q) => logs.filter((l) => estTr(l) && src(l) === R && dst(l) === q);
    t(m > 0n, 'P2 m au noeud ' + sym(fd) + ' = ' + m + ' (logs) ; devis : ' + (pb ? pb.m : '(0,09 % seul)'));
    t(vers(A6CF).length === 1 && bas(vers(A6CF)[0].address) === fd && d(fd, A6CF) === att.a6cf, 'P3 a6cf +' + d(fd, A6CF) + ' ' + sym(fd) + ' == floor(m x ' + (att.a6cfBps * 100n) + ' / 1e6) = ' + att.a6cf);
    /* le createur PEUT etre le swapper (test anti-farming) : sa part se lit alors sur les LOGS, et on la retire de ses deltas de swap */
    /*   la part = le Transfer routeur -> createur en l action qui SUIT IMMEDIATEMENT celui de a6cf (ordre des commandes 06,05,05) */
    const iA = logs.findIndex((l) => estTr(l) && src(l) === R && dst(l) === A6CF);
    const suiv = iA >= 0 ? logs.slice(iA + 1).find((l) => estTr(l) && src(l) === R) : null;
    const partCrea = suiv && dst(suiv) === crea && bas(suiv.address) === fd ? BigInt(suiv.data) : 0n;
    const dCrea = crea === USER ? partCrea : d(fd, crea);
    t(dCrea === att.createur && (crea === USER || vers(crea).length === (att.createur > 0n ? 1 : 0)), 'P4 createur +' + dCrea + (crea === USER ? ' (createur = swapper, lu sur les logs)' : '') + ' == ' + (att.createurAuDessus ? 'floor(m x 300 / 1e6) = ' : att.createurAuDessus === false ? '0 (sous le minimum) = ' : '0 (drapeau OFF) = ') + att.createur);
    t(d(fd, coll) === att.collateral && vers(coll).length === (att.collateral > 0n ? 1 : 0), 'P5 collateral +' + d(fd, coll) + ' == ' + (att.createurAuDessus === false ? 'floor(m x 300 / 1e6) (createur sous le minimum) = ' : att.createurAuDessus ? '0 (createur au minimum) = ' : '0 (drapeau OFF) = ') + att.collateral);
    t(!logs.some((l) => estTr(l) && estBlock(l.address) && [A6CF, coll, ...(crea === USER ? [] : [crea])].includes(dst(l))), 'P6 aucun token de block vers a6cf / createur / collateral');
    const out = noeud(vers === null ? '' : ch[ch.length - 1].vers);
    const gaz = BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice);
    const recu = d(out, USER) + (out === ETH ? gaz : 0n) - (crea === USER && out === fd ? partCrea : 0n);
    t(recu === plan.meilleur.sortie && recu >= plan.minSortie, 'P7 recu ' + recu + ' == devis ' + plan.meilleur.sortie + ' (min ' + plan.minSortie + ')');
    const inJ = noeud(ch[0].de);
    t(-d(inJ, USER) - (inJ === ETH ? gaz : 0n) + (crea === USER && inJ === fd ? partCrea : 0n) === montant, 'P7b paye == ' + montant);
    t(jetons.every((j) => apres[j][R] === 0n), 'P8 routeur vide');
    var resume = { m: String(m), a6cf: String(d(fd, A6CF)), createur: String(dCrea), collateral: String(d(fd, coll)), attendu: { a6cf: String(att.a6cf), createur: String(att.createur), collateral: String(att.collateral) }, totalPpmEffectif: Number((d(fd, A6CF) + dCrea + d(fd, coll)) * 1000000n * 1000n / m) / 1000 };
  }
  const verdict = ko.length ? 'KO' : 'OK';
  console.log('\n[' + nom + '] ' + decrireChemin(ch, symboles) + ' · noeud ' + tx.fraisIndice + ' en ' + sym(fd) + ' · commandes ' + tx.commandes.join(',') + ' · gaz ' + Number(rc.gasUsed) + ' · tx ' + (rc.transactionHash || '-'));
  for (const l of lignes) console.log('   ' + l);
  console.log('   => ' + verdict);
  return { nom, verdict, ko, chemin: decrireChemin(ch, symboles), noeud: tx.fraisIndice, devise: sym(fd), gaz: Number(rc.gasUsed), tx: rc.transactionHash || null, ...(resume || {}) };
}

const res = [], tem = [];
/* ── ON (explicite) : createur AU minimum ── */
res.push(await lancer({ nom: 'P1 ON ETH -> NVDAc -> SI · createur au minimum · action au noeud INTERMEDIAIRE', de: ETH, vers: SI, montant: E / 50n, reg: regH, sautsMax: 4 }));
res.push(await lancer({ nom: 'P2 ON SI -> NVDAc -> USDC · createur au minimum', de: SI, vers: USDC, montant: (await solde(SI, USER)) / 3n, reg: regH }));
res.push(await lancer({ nom: 'P3 ON NVDAc -> SI · createur au minimum · action au noeud d ENTREE', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH }));
res.push(await lancer({ nom: 'P4 ON HIMSc -> BLUEPILL · createur au minimum · entree', de: HIMS, vers: BLUEPILL, montant: (await solde(HIMS, USER)) / 3n, reg: regH }));
res.push(await lancer({ nom: 'P5 ON BLUEPILL -> HIMSc · createur au minimum · action au noeud de SORTIE', de: BLUEPILL, vers: HIMS, montant: (await solde(BLUEPILL, USER)) / 2n, reg: regH }));
/* ── ON : createur SOUS le minimum (minimum - 1) : sa part va au collateral ── */
res.push(await lancer({ nom: 'B1 ON SI -> NVDAc -> USDC · createur sous le minimum', de: SI, vers: USDC, montant: (await solde(SI, USER)) / 3n, reg: regB }));
res.push(await lancer({ nom: 'B2 ON NVDAc -> SI · createur sous le minimum · entree', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regB }));
res.push(await lancer({ nom: 'B3 ON BLUEPILL -> HIMSc · createur sous le minimum · sortie', de: BLUEPILL, vers: HIMS, montant: await solde(BLUEPILL, USER), reg: regB }));
/* ── OFF : le drapeau du code ── */
const off1 = await lancer({ nom: 'O1 OFF (drapeau du code) NVDAc -> SI : 0,09 % seul, createur 0, collateral 0', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH, actif: RACHAT_DETENTEURS_ACTIVE });
res.push(off1);
tem.push({ nom: 'N3 drapeau OFF : le 0,09 % en vigueur, createur 0, collateral 0', verdict: off1.verdict === 'OK' && off1.createur === '0' && off1.collateral === '0' && off1.a6cf === String(BigInt(off1.m) * 900n / 1000000n) ? 'OK' : 'KO', preuve: off1 });

/* ── TEMOINS NEGATIFS ── */
{
  const mN = (await solde(SI, USER)) / 3n;
  const p = await planifierBloc({ rpc, aretes, de: SI, vers: USDC, montant: mN, destinataire: USER, admises: ADMISES, registre: regH, soldeCreateur, actif: true, deadline: await deadline() });
  if (p.etat !== 'PRET') throw new Error('N1/N2 : plan ' + p.etat + ' ' + p.pourquoi);
  const ch = p.meilleur.chemin, e = regH.get(SI);
  const r1 = construireRoute({ chemin: ch, montant: mN, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: 0, admises: ADMISES, partsFrais: [{ qui: A6CF, bps: 7n }], bpsA6cf: 7n, partsExactes: [{ qui: e.createur, montant: 1n }] });
  console.log('\nN1 parts prises en SI (block, noeud 0) : ' + r1.etat + ' — ' + r1.pourquoi);
  tem.push({ nom: 'N1 parts en token de block refusees', verdict: r1.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
  const r2 = construireRoute({ chemin: ch, montant: mN, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: p.meilleur.fraisIndice, admises: ADMISES, partsFrais: [{ qui: A6CF, bps: 6n }], bpsA6cf: 7n, partsExactes: [{ qui: e.createur, montant: 1n }] });
  console.log('N2a a6cf rogne a 6 bps (declare 7) + part createur : ' + r2.etat + ' — ' + r2.pourquoi);
  tem.push({ nom: 'N2a part qui rogne a6cf sous ses 0,07 % refusee', verdict: r2.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
  const r2b = construireRoute({ chemin: ch, montant: mN, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: p.meilleur.fraisIndice, admises: ADMISES, partsFrais: [{ qui: A6CF, bps: 7n }], bpsA6cf: 7n });
  console.log('N2b a6cf a 7 bps SANS part createur/collateral : ' + r2b.etat + ' — ' + r2b.pourquoi);
  tem.push({ nom: 'N2b 7 bps sans la part createur/collateral refuse (pas de baisse du 0,09 % en douce)', verdict: r2b.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
  const r2c = construireRoute({ chemin: ch, montant: mN, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: p.meilleur.fraisIndice, admises: ADMISES, partsFrais: [{ qui: A6CF, bps: 5n }], bpsA6cf: 5n, partsExactes: [{ qui: e.createur, montant: 1n }] });
  tem.push({ nom: 'N2c taux a6cf hors {9, 7} refuse', verdict: r2c.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
}
const minPlus = (delta) => (tx) => { const c = [...tx.commandes], i = [...tx.entrees]; const k = c.lastIndexOf(CMD.SWEEP); const h = i[k]; i[k] = h.slice(0, 128) + mot(delta(BigInt('0x' + h.slice(128)))); return { ...tx, entrees: i, data: assemblerExecute(c, i, 1n << 40n) }; };
{
  /* N4a : minimum = sortie nette (apres les 3 parts) + 1 => revert, personne ne touche rien */
  const p = await planifierBloc({ rpc, aretes, de: NVDA, vers: SI, montant: MIN_N / 4n, destinataire: USER, admises: ADMISES, registre: regH, soldeCreateur, actif: true, deadline: await deadline() });
  const r = await lancer({ nom: 'N4a minimum = sortie nette + 1', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH, planDonne: p, modifier: minPlus(() => p.meilleur.sortie + 1n), attenduRevert: true });
  tem.push({ nom: 'N4a minimum verifie APRES les parts (net + 1 => revert)', verdict: r.verdict === 'OK' ? 'OK (revert)' : 'KO' });
  /* N4b : minimum calcule sur la sortie a 0,09 % SEUL (en oubliant les 0,03 %) => revert : le minimum mord APRES les parts */
  const p9 = await planifier({ rpc, aretes, de: NVDA, vers: SI, montant: MIN_N / 4n, destinataire: USER, admises: ADMISES, deadline: await deadline() });
  const r2 = await lancer({ nom: 'N4b minimum = sortie du devis a 0,09 % seul (' + p9.meilleur.sortie + ')', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH, planDonne: p, modifier: minPlus(() => p9.meilleur.sortie), attenduRevert: true });
  tem.push({ nom: 'N4b minimum = devis du 0,09 % en vigueur => revert (le 0,10 % est bien retire avant le minimum)', verdict: r2.verdict === 'OK' && p9.meilleur.sortie > p.meilleur.sortie ? 'OK (revert)' : 'KO', devis009: String(p9.meilleur.sortie), devis012: String(p.meilleur.sortie) });
  /* N5 : double prelevement avec le minimum honnete => revert */
  const double = (cmd) => (tx) => { const c = [], i = []; tx.commandes.forEach((x, k) => { c.push(x); i.push(tx.entrees[k]); if (x === cmd) { c.push(x); i.push(tx.entrees[k]); } }); return { ...tx, commandes: c, entrees: i, data: assemblerExecute(c, i, 1n << 40n) }; };
  const p5 = await planifierBloc({ rpc, aretes, de: NVDA, vers: SI, montant: MIN_N / 4n, destinataire: USER, admises: ADMISES, registre: regH, soldeCreateur, actif: true, deadline: await deadline(), toleranceBps: 0n });
  const r5 = await lancer({ nom: 'N5a DEUX PAY_PORTION a6cf, minimum honnete (tolerance 0)', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH, planDonne: p5, modifier: double(CMD.PAY_PORTION), attenduRevert: true });
  tem.push({ nom: 'N5a double prelevement a6cf => revert', verdict: r5.verdict === 'OK' ? 'OK (revert)' : 'KO' });
  const r6 = await lancer({ nom: 'N5b TRANSFER createur en double, minimum honnete (tolerance 0)', de: NVDA, vers: SI, montant: MIN_N / 4n, reg: regH, planDonne: p5, modifier: double(CMD.TRANSFER), attenduRevert: true });
  tem.push({ nom: 'N5b double prelevement createur => revert', verdict: r6.verdict === 'OK' ? 'OK (revert)' : 'KO' });
  const r7 = construireRoute({ chemin: p5.meilleur.chemin, montant: MIN_N / 4n, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: p5.meilleur.fraisIndice, admises: ADMISES, partsExactes: [{ qui: CREA_H, montant: 1n }, { qui: CREA_H, montant: 1n }] });
  tem.push({ nom: 'N5c meme destinataire deux fois refuse a l assemblage', verdict: r7.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
}

/* ── ANTI-FARMING : le CREATEUR lui-meme fait un aller-retour NVDAc -> SI -> NVDAc. Il touche sa part
 *   de 0,03 % sur ses propres swaps ; il paie 0,10 % + frais LP + prix. ── */
const farm = [];
{
  const regF = nouveauRegistre();
  inscrireBloc(regF, { block: SI, action: NVDA, createur: USER, minimumCreateur: 1n });
  const x0 = await solde(NVDA, USER), s0 = await solde(SI, USER);
  const M = x0 / 4n;
  const a = await lancer({ nom: 'F1a wash : createur NVDAc -> SI', de: NVDA, vers: SI, montant: M, reg: regF });
  const s1 = await solde(SI, USER);
  const b = await lancer({ nom: 'F1b wash : createur SI -> NVDAc (tout ce qu il a recu)', de: SI, vers: NVDA, montant: s1 - s0, reg: regF });
  const x1 = await solde(NVDA, USER);
  const part = BigInt(a.createur || 0) + BigInt(b.createur || 0);
  const perte = x0 - x1; /* NET, part createur deja recue dans la meme tx incluse */
  const prix = (N.get(NVDA).ligne || {}).prixUsd || null, dec = Number(N.get(NVDA).dec ?? 18);
  const usd = (u) => (prix ? Number(u) / 10 ** dec * prix : null);
  const ok = a.verdict === 'OK' && b.verdict === 'OK' && perte > 0n && perte > part;
  console.log('\nF1 wash du createur : mise ' + M + ' NVDAc · part createur recue ' + part + ' · perte NETTE ' + perte + ' (' + (Number(perte * 1000000n / M) / 100) + ' bps de la mise, ~' + (usd(perte) && usd(perte).toFixed(4)) + ' $) · part/perte = ' + (Number(part * 10000n / (perte || 1n)) / 100) + ' % => ' + (ok ? 'OK (perd plus qu il ne gagne)' : 'KO'));
  farm.push({ nom: 'F1 wash du createur NVDAc -> SI -> NVDAc', verdict: ok ? 'OK' : 'KO', mise: String(M), partCreateur: String(part), perteNette: String(perte), perteBps: Number(perte * 1000000n / M) / 100, partSurPerte: Number(part * 10000n / (perte || 1n)) / 100, usdPerte: usd(perte), usdPart: usd(part) });
}

console.log('\n=== BILAN ===');
for (const r of res) console.log(r.verdict.padEnd(3) + ' ' + r.nom + (r.verdict === 'OK' ? ' · m ' + r.m + ' · a6cf ' + r.a6cf + ' · createur ' + r.createur + ' · collateral ' + r.collateral + ' · ' + r.totalPpmEffectif + ' ppm · gaz ' + r.gaz : ' ' + (r.pourquoi || r.ko.join(' | '))));
for (const t of tem) console.log('TEMOIN ' + t.verdict + ' · ' + t.nom);
for (const f of farm) console.log('FARMING ' + f.verdict + ' · ' + f.nom);
writeFileSync('/workspace/mp-data/banc-parts-bloc.json', JSON.stringify({ bloc: g.bloc, lu: new Date().toISOString(), minimums: { NVDAc: String(MIN_N), HIMSc: String(MIN_H) }, collateral: { SI: COLL_SI, BLUEPILL: COLL_BP }, res, tem, farm }, (_, v) => (typeof v === 'bigint' ? String(v) : v), 1));
const nOk = res.filter((r) => r.verdict === 'OK').length;
console.log(nOk + '/' + res.length + ' swaps OK · temoins ' + tem.filter((t) => t.verdict.startsWith('OK')).length + '/' + tem.length + ' · farming ' + farm.filter((f) => f.verdict === 'OK').length + '/' + farm.length);
void existsSync;
process.exit(nOk === res.length && tem.every((t) => t.verdict.startsWith('OK')) && farm.every((f) => f.verdict === 'OK') ? 0 : 1);
