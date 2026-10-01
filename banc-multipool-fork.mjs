/* BANC FORK — le routeur multi-pools EXECUTE sur un fork Base epingle, frais verifie AU WEI.
 *
 *   PORT_FORK=8599 node banc-multipool-fork.mjs [/workspace/mp-data/graphe.json]
 *
 * ⛔⛔ FORK UNIQUEMENT. Le banc refuse de tourner si le chainId n est pas 8453 ou si le noeud n est
 *   pas un anvil local (anvil_nodeInfo). Expediteur : le compte de test anvil n°1. JAMAIS a6cf.
 * ⛔⛔ LA REGLE DU FRAIS (Raksha, 2026-10-01 22:15) : 9 bps NET vers a6cf, UNE FOIS par swap, en
 *   ETH / USDC / l action ou le B20 apparie, JAMAIS en token de block, pas de remise.
 *   Chaque swap est juge par `juger` :
 *     J1 status 0x1 ;
 *     J2 a6cf bouge dans UN SEUL actif, et c est la devise du frais annoncee ;
 *     J3 cet actif n est pas un block (verrou independant de l assembleur) ;
 *     J4 delta(a6cf) == floor(montant_au_noeud * 9 / 10000) AU WEI, ou montant_au_noeud est
 *        (a) pour un ERC-20 : la somme des Transfer de ce jeton VERS le routeur dans la tx + sa
 *            poussiere d avant — lu sur les LOGS, sans aucun devis ;
 *        (b) pour l ETH natif : msg.value + poussiere a l entree, sinon le devis sur le MEME etat ;
 *        et == le frais du devis (meme etat) ;
 *     J5 exactement UN Transfer ERC-20 vers a6cf (aucun pour un frais natif) ;
 *     J6 recu par l utilisateur == sortie du devis AU WEI, et >= minSortie ;
 *     J7 l utilisateur a paye EXACTEMENT le montant (gaz deduit pour l ETH) ;
 *     J8 le routeur ne garde rien : 0 sur chaque jeton du chemin, en ETH et en WETH.
 *   Les TEMOINS NEGATIFS passent par le MEME juge et doivent etre KO. */
import { readFileSync } from 'node:fs';
import { ADRESSES, devisesFraisAdmises, planifier, construireRoute, assemblerExecute, CMD, decrireChemin, fraisSur, noeud, rangFrais } from './multipool.js';
import { ACTIONS_COINBASE } from './paires.js';
import { selecteur, mot, motAdr } from './pool.js';

const PORT = process.env.PORT_FORK || '8599';
const URL = 'http://127.0.0.1:' + PORT;
const GRAPHE = process.argv[2] || '/workspace/mp-data/graphe.json';
/* ⛔⛔ PAS le compte anvil n°1 (0x7099…79c8) : sa cle est PUBLIQUE et, sur Base, il porte une
 *   delegation EIP-7702 qui REEXPEDIE tout ETH recu vers 0xcc04…3b95 (vu au callTracer du 1er essai).
 *   Un swap vers l ETH y « livrait » 0. On prend une adresse VIERGE, verifiee sans code, USURPEE sur le
 *   fork (anvil_impersonateAccount) et creditee par anvil_setBalance. Aucune cle n existe pour elle. */
const USER = '0x7e57000000000000000000000000000000c0ffee';
const A6CF = ADRESSES.FEE_WALLET, R = ADRESSES.ROUTEUR, ETH = ADRESSES.ETH, WETH = ADRESSES.WETH, USDC = ADRESSES.USDC;
if (USER === A6CF) throw new Error('jamais a6cf comme expediteur');
const bas = (a) => String(a || '').toLowerCase();

let id = 0;
async function rpc(method, params = []) {
  for (let t = 0; t < 4; t += 1) {
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await r.json();
    if (j.error) { if (/rate|429|timeout|header not found/i.test(j.error.message || '') && t < 3) { await new Promise((z) => setTimeout(z, 800 * (t + 1))); continue; } const e = new Error(j.error.message); e.data = j.error.data; throw e; }
    return j.result;
  }
}
const S = (s) => '0x' + selecteur(s);
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
async function solde(jeton, qui) {
  if (jeton === ETH) return BigInt(await rpc('eth_getBalance', [qui, 'latest']));
  return BigInt(await rpc('eth_call', [{ to: jeton, data: S('balanceOf(address)') + motAdr(qui) }, 'latest']));
}
async function envoyer(tx) {
  const h = await rpc('eth_sendTransaction', [{ from: USER, gas: '0x7a1200', ...tx }]);
  for (let t = 0; t < 60; t += 1) {
    const rc = await rpc('eth_getTransactionReceipt', [h]);
    if (rc) return rc;
    await new Promise((z) => setTimeout(z, 250));
  }
  throw new Error('pas de recu pour ' + h);
}

/* ── garde-fous ── */
const chainId = Number(await rpc('eth_chainId'));
let info = null; try { info = await rpc('anvil_nodeInfo'); } catch (_) { /* */ }
if (chainId !== 8453 || !info) { console.log('KO : pas un fork anvil de Base — arret'); process.exit(1); }
{ /* ⛔ temoin B20 : il faut base-anvil --base (un anvil standard rend OpcodeNotFound sur 0xef) */
  let d = null; try { d = await rpc('eth_call', [{ to: '0xb200000000000000000000c2e324d24d7eecd1fb', data: '0x313ce567' }, 'latest']); } catch (e) { d = 'ERR ' + e.message; }
  if (!/^0x[0-9a-f]{64}$/.test(String(d))) { console.log('KO : ce fork n execute pas les B20 (' + String(d).slice(0, 60) + ') — il faut base-anvil --base. NON MESURE'); process.exit(1); }
}
{
  const code = await rpc('eth_getCode', [USER, 'latest']);
  if (code !== '0x') { console.log('KO : le compte de test porte du code (' + code.slice(0, 20) + ') — arret'); process.exit(1); }
  await rpc('anvil_impersonateAccount', [USER]);
  await rpc('anvil_setBalance', [USER, '0x' + (100n * 10n ** 18n).toString(16)]);
}
const g = JSON.parse(readFileSync(GRAPHE, 'utf8'));
console.log('=== BANC MULTIPOOL — fork ' + URL + ' · bloc fork ' + (info.forkConfig && info.forkConfig.forkBlockNumber) + ' · bloc courant ' + Number(await rpc('eth_blockNumber')) + ' · graphe bloc ' + g.bloc + ' ===');
const aretes = g.aretes.map((e) => ({ ...e, liqUsd: Number(e.liqUsd) || 0 }));
const N = new Map(g.noeuds.map((n) => [n.adr, n]));
const sym = (a) => (noeud(a) === ETH ? 'ETH' : (N.get(noeud(a)) && N.get(noeud(a)).sym) || a.slice(0, 10));
const symboles = Object.fromEntries(g.noeuds.map((n) => [n.adr, n.sym || n.adr.slice(0, 8)]));
/* ⛔ LES DEVISES ADMISES POUR LE FRAIS : les 15 actions + OUSD (B20 devise). ETH et USDC sont
 *   implicites. Un block n y est JAMAIS — ni TBLOCK, ni aucun jeton de classe « block ». */
const ADMISES = devisesFraisAdmises(ACTIONS_COINBASE, { blocks: g.noeuds.filter((n) => n.classe === 'block').map((n) => n.adr) });
const estBlock = (a) => { const n = N.get(noeud(a)); return !!n && n.classe === 'block'; };
for (const a of ADMISES) if (estBlock(a)) throw new Error('admise ET block : ' + a);

/* ── le juge ── */
async function photo(jetons) {
  const o = {};
  for (const j of jetons) o[j] = { a6cf: await solde(j, A6CF), routeur: await solde(j, R), user: await solde(j, USER) };
  return o;
}
async function juger({ nom, plan, rc, tx, avant, apres, jetons, montant, de, vers, attenduKo = false }) {
  const lignes = [], ko = [];
  const t = (c, txt) => { lignes.push((c ? 'ok ' : 'KO ') + txt); if (!c) ko.push(txt); };
  t(rc && rc.status === '0x1', 'J1 status ' + (rc && rc.status));
  /* ⛔⛔ LE FRAIS D INTERFACE = ce que le ROUTEUR verse a a6cf (Transfer from=routeur, ou CALL natif
   *   routeur -> a6cf au callTracer). Tout autre versement a a6cf dans la tx (un de NOS hooks qui
   *   preleve son frais de marche) est COMPTE A PART et NOMME : il n est pas le frais d interface,
   *   et il n est pas cache non plus. J9 exige que les deux expliquent le delta de a6cf au wei. */
  const logs = (rc && rc.logs) || [];
  const src = (l) => '0x' + l.topics[1].slice(26);
  const dest = (l) => '0x' + l.topics[2].slice(26);
  const estTr = (l) => l.topics[0] === TRANSFER && l.topics.length === 3;
  let appels = [];
  if (rc && rc.transactionHash && rc.status === '0x1') {
    const tr = await rpc('debug_traceTransaction', [rc.transactionHash, { tracer: 'callTracer' }]);
    const plat = (c) => { if (c.value && BigInt(c.value) > 0n && c.type !== 'DELEGATECALL') appels.push({ de: bas(c.from), vers: bas(c.to), v: BigInt(c.value) }); (c.calls || []).forEach(plat); };
    plat(tr);
  }
  const iface = [
    ...logs.filter((l) => estTr(l) && bas(src(l)) === R && bas(dest(l)) === A6CF).map((l) => ({ jeton: bas(l.address), v: BigInt(l.data) })),
    ...appels.filter((c) => c.de === R && c.vers === A6CF).map((c) => ({ jeton: ETH, v: c.v })),
  ];
  const autresVersA6cf = [
    ...logs.filter((l) => estTr(l) && bas(src(l)) !== R && bas(dest(l)) === A6CF).map((l) => ({ jeton: bas(l.address), v: BigInt(l.data), de: bas(src(l)) })),
    ...appels.filter((c) => c.de !== R && c.vers === A6CF).map((c) => ({ jeton: ETH, v: c.v, de: c.de })),
  ];
  const fd = plan.tx.fraisDevise;
  const fdJeton = iface.length === 1 ? iface[0].jeton : null;
  t(iface.length === 1 && fdJeton === fd, 'J2 le routeur paie a6cf UNE fois : ' + iface.length + ' versement(s) [' + iface.map((x) => sym(x.jeton) + (x.jeton === WETH ? '(WETH)' : '')).join(',') + '] attendu 1 en ' + sym(fd));
  t(!estBlock(fd) && rangFrais(fd, ADMISES) !== null && (!fdJeton || !estBlock(fdJeton)), 'J3 devise du frais ' + sym(fd) + ' n est pas un block');
  const delta = iface.reduce((x, y) => x + y.v, 0n);
  let auNoeud = null, source = '';
  const poussiere = fdJeton ? avant[fdJeton].routeur : 0n;
  if (fdJeton && fdJeton !== ETH) {
    const entrees = logs.filter((l) => estTr(l) && bas(l.address) === fdJeton && bas(dest(l)) === R).reduce((x, l) => x + BigInt(l.data), 0n);
    auNoeud = entrees + poussiere; source = 'logs : ' + entrees + ' entres au routeur + ' + poussiere + ' de poussiere';
  } else if (fdJeton === ETH && noeud(de) === ETH && plan.tx.fraisIndice === 0) {
    auNoeud = montant + poussiere; source = 'msg.value ' + montant + ' + poussiere ' + poussiere;
  } else if (fdJeton === ETH) {
    const entrees = appels.filter((c) => c.vers === R).reduce((x, c) => x + c.v, 0n);
    auNoeud = entrees + poussiere; source = 'callTracer : ' + entrees + ' wei entres au routeur + poussiere ' + poussiere;
  }
  const attendu = auNoeud === null ? null : fraisSur(auNoeud);
  t(attendu !== null && delta === attendu, 'J4 frais d interface ' + delta + ' == floor(' + auNoeud + ' x 9 / 10000) = ' + attendu + ' (' + source + ')');
  t(delta === plan.meilleur.frais || poussiere > 0n, 'J4b == frais du devis meme etat ' + plan.meilleur.frais + (poussiere > 0n ? ' (poussiere : non comparable)' : ''));
  /* J9 : la comptabilite de a6cf, actif par actif */
  const ecarts = [];
  for (const j of jetons) {
    const d = apres[j].a6cf - avant[j].a6cf;
    const explique = [...iface, ...autresVersA6cf].filter((x) => x.jeton === j).reduce((x, y) => x + y.v, 0n);
    if (d !== explique) ecarts.push(sym(j) + (j === WETH ? '(WETH)' : '') + ' delta ' + d + ' explique ' + explique);
  }
  t(ecarts.length === 0, 'J9 delta(a6cf) == frais d interface + frais de marche nommes, au wei : ' + (ecarts.join(' | ') || 'oui'));
  const marche = autresVersA6cf.map((x) => x.v + ' ' + sym(x.jeton) + ' depuis ' + x.de.slice(0, 10)).join(', ');
  lignes.push('-- frais de MARCHE (hook) recus par a6cf dans la meme tx : ' + (marche || 'aucun'));
  const out = noeud(vers);
  const gaz = rc ? BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice) : 0n;
  const recu = apres[out].user - avant[out].user + (out === ETH ? gaz : 0n) + (noeud(de) === ETH ? montant : 0n) * (out === ETH ? 1n : 0n);
  t(recu === plan.meilleur.sortie && recu >= plan.minSortie, 'J6 recu ' + recu + ' == devis ' + plan.meilleur.sortie + ' (min ' + plan.minSortie + ')');
  const inJ = noeud(de);
  const paye = avant[inJ].user - apres[inJ].user - (inJ === ETH ? gaz : 0n);
  t(paye === montant, 'J7 paye ' + paye + ' == montant ' + montant);
  /* sur le chemin : 0 exact ; hors chemin (ETH/WETH non utilises) : pas d augmentation */
  const surChemin = new Set([plan.meilleur.chemin[0].de, ...plan.meilleur.chemin.map((x) => x.vers)].flatMap((x) => (x === ETH ? [ETH, WETH] : [x])));
  const restes = jetons.filter((j) => apres[j].routeur > (surChemin.has(j) ? 0n : avant[j].routeur)).map((j) => sym(j) + (j === WETH ? '(WETH)' : '') + '=' + apres[j].routeur + ' (avant ' + avant[j].routeur + ')');
  t(restes.length === 0, 'J8 routeur vide apres : ' + (restes.join(',') || 'oui'));
  const verdict = ko.length === 0 ? 'OK' : 'KO';
  console.log('\n[' + nom + '] ' + decrireChemin(plan.meilleur.chemin, symboles));
  console.log('   commandes ' + plan.tx.commandes.join(',') + ' · segments ' + plan.tx.segments.join('+') + ' · frais au noeud ' + plan.tx.fraisIndice + ' en ' + sym(fd) + ' · gaz ' + (rc ? Number(rc.gasUsed) : '?') + ' · tx ' + (rc && rc.transactionHash));
  for (const l of lignes) console.log('   ' + l);
  console.log('   => ' + verdict + (attenduKo ? (verdict === 'KO' ? '  (TEMOIN : KO attendu — le juge a dit non)' : '  ⛔ TEMOIN : le juge aurait du dire non') : ''));
  return { nom, verdict, ko, fraisMarche: marche || null, delta: String(delta), attendu: attendu === null ? null : String(attendu), recu: String(recu), sortieDevis: String(plan.meilleur.sortie), gaz: rc ? Number(rc.gasUsed) : null, chemin: decrireChemin(plan.meilleur.chemin, symboles), fraisDevise: sym(fd), commandes: plan.tx.commandes.join(','), tx: rc && rc.transactionHash, signatures: plan.tx.signatures };
}

async function executer({ nom, de, vers, montant, sautsMax = 3, modifier = null, attenduKo = false, planDonne = null }) {
  de = bas(de); vers = bas(vers);
  const deadline = BigInt(Number((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 3600);
  const plan = planDonne || await planifier({ rpc, aretes, de, vers, montant, destinataire: USER, admises: ADMISES, deadline, sautsMax, max: 16 });
  if (plan.etat !== 'PRET') {
    console.log('\n[' + nom + '] ' + sym(de) + ' -> ' + sym(vers) + ' : ' + plan.etat + ' — ' + plan.pourquoi);
    for (const e of (plan.essais || []).slice(0, 6)) console.log('    essai ' + decrireChemin(e.chemin, symboles) + ' : ' + e.etat + ' ' + (e.pourquoi || ''));
    return { nom, verdict: plan.etat, pourquoi: plan.pourquoi };
  }
  const tx = modifier ? modifier(plan.tx) : plan.tx;
  const jetons = [...new Set([ETH, WETH, ...[plan.meilleur.chemin[0].de, ...plan.meilleur.chemin.map((s) => s.vers)].map((x) => (x === ETH ? ETH : x))])];
  if (tx.approbation) {
    const ra = await envoyer({ to: tx.approbation.jeton, data: S('approve(address,uint256)') + motAdr(R) + mot(tx.approbation.montant) });
    if (ra.status !== '0x1') throw new Error('approve KO');
  }
  const avant = await photo(jetons);
  let rc;
  try { rc = await envoyer({ to: tx.to, data: tx.data, value: tx.value }); }
  catch (err) { rc = { status: 'REVERT ' + String(err.message).slice(0, 120), logs: [], gasUsed: '0x0', effectiveGasPrice: '0x0' }; }
  const apres = await photo(jetons);
  return juger({ nom, plan: { ...plan, tx }, rc, tx, avant, apres, jetons, montant, de, vers, attenduKo });
}

/* ── les cas ── */
const adr = (s) => { const n = g.noeuds.find((x) => x.sym === s && x.classe !== 'block') || g.noeuds.find((x) => x.sym === s); return n && n.adr; };
const voisinBlock = (stock) => {
  /* le block le plus liquide dont une pool MESUREE touche `stock` */
  let best = null;
  for (const e of aretes) {
    const [x, y] = e.venue === 'uniswap-v4' ? [noeud(e.cle.currency0), noeud(e.cle.currency1)] : [noeud(e.token0), noeud(e.token1)];
    const autre = x === stock ? y : y === stock ? x : null;
    if (!autre || !estBlock(autre)) continue;
    const ok = e.devis && Object.values(e.devis).some((d) => d.etat === 'OK');
    if (!ok) continue;
    if (!best || e.liqUsd > best.liq) best = { adr: autre, liq: e.liqUsd };
  }
  return best && best.adr;
};
const AAPL = adr('AAPLc'), NVDA = adr('NVDAc'), HIMS = adr('HIMSc'), OUSD = ADRESSES.OUSD, TOSHI = bas('0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4');
const B_HIMS = voisinBlock(HIMS), B_NVDA = voisinBlock(NVDA), B_OUSD = voisinBlock(OUSD), B_ETH = voisinBlock(ETH);
console.log('blocks choisis (le plus liquide par voisin) : HIMSc ' + sym(B_HIMS || '') + ' ' + B_HIMS + ' · NVDAc ' + sym(B_NVDA || '') + ' ' + B_NVDA + ' · OUSD ' + sym(B_OUSD || '') + ' ' + B_OUSD + ' · ETH ' + sym(B_ETH || '') + ' ' + B_ETH);
const moitie = async (j) => (await solde(j, USER)) / 2n;
const res = [];
const E = 10n ** 18n;
res.push(await executer({ nom: 'C1 ETH -> USDC', de: ETH, vers: USDC, montant: E / 10n }));
res.push(await executer({ nom: 'C2 USDC -> AAPLc', de: USDC, vers: AAPL, montant: 100n * 10n ** 6n }));
res.push(await executer({ nom: 'C3 AAPLc -> NVDAc (action -> action)', de: AAPL, vers: NVDA, montant: await moitie(AAPL) }));
res.push(await executer({ nom: 'C4 ETH -> TOSHI (Uniswap V3)', de: ETH, vers: TOSHI, montant: E / 100n }));
res.push(await executer({ nom: 'C5 USDC -> OUSD', de: USDC, vers: OUSD, montant: 40n * 10n ** 6n }));
if (B_HIMS) {
  res.push(await executer({ nom: 'C6 ETH -> block HIMSc (' + sym(B_HIMS) + ')', de: ETH, vers: B_HIMS, montant: E / 50n, sautsMax: 4 }));
  res.push(await executer({ nom: 'C7 block -> son action (' + sym(B_HIMS) + ' -> HIMSc)', de: B_HIMS, vers: HIMS, montant: await moitie(B_HIMS) }));
  if (B_NVDA) res.push(await executer({ nom: 'C8 block -> block via les actions (' + sym(B_HIMS) + ' -> ' + sym(B_NVDA) + ')', de: B_HIMS, vers: B_NVDA, montant: await solde(B_HIMS, USER), sautsMax: 4 }));
}
if (B_OUSD) res.push(await executer({ nom: 'C9 B20 OUSD -> block (' + sym(B_OUSD) + ')', de: OUSD, vers: B_OUSD, montant: await moitie(OUSD) }));
if (B_ETH) {
  res.push(await executer({ nom: 'C10 ETH -> block ETH (' + sym(B_ETH) + ')', de: ETH, vers: B_ETH, montant: E / 100n }));
  res.push(await executer({ nom: 'C11 VENTE block -> ETH (' + sym(B_ETH) + ' -> ETH)', de: B_ETH, vers: ETH, montant: await moitie(B_ETH) }));
  res.push(await executer({ nom: 'C12 VENTE block -> USDC (' + sym(B_ETH) + ' -> USDC)', de: B_ETH, vers: USDC, montant: await solde(B_ETH, USER) }));
}
res.push(await executer({ nom: 'C13 NVDAc -> ETH (action -> ETH)', de: NVDA, vers: ETH, montant: await moitie(NVDA) }));
res.push(await executer({ nom: 'C14 TOSHI -> ETH (V3 rend du WETH : frais en ETH NATIF apres UNWRAP)', de: TOSHI, vers: ETH, montant: await moitie(TOSHI) }));
res.push(await executer({ nom: 'C15 TOSHI -> USDC (V3 puis V4, frais en ETH au noeud du milieu)', de: TOSHI, vers: USDC, montant: await solde(TOSHI, USER) }));

/* ── temoins negatifs ── */
console.log('\n=== TEMOINS NEGATIFS ===');
const tem = [];
{
  /* T1 : un indice de frais force sur un block est REFUSE avant toute transaction */
  const p = await planifier({ rpc, aretes, de: USDC, vers: AAPL, montant: 10n * 10n ** 6n, destinataire: USER, admises: ADMISES, deadline: 1n << 40n });
  const chemin = B_HIMS ? (await planifier({ rpc, aretes, de: HIMS, vers: B_HIMS, montant: 10n ** 16n, destinataire: USER, admises: ADMISES, deadline: 1n << 40n })) : null;
  if (chemin && chemin.etat === 'PRET') {
    const n = chemin.meilleur.chemin.length;
    const r = construireRoute({ chemin: chemin.meilleur.chemin, montant: 10n ** 16n, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, fraisIndice: n, admises: ADMISES });
    console.log('T1 frais force en block (' + sym(B_HIMS) + ') : ' + r.etat + ' — ' + r.pourquoi);
    tem.push({ nom: 'T1 frais force en block', verdict: r.etat === 'REFUSE' ? 'OK (refuse)' : 'KO' });
  }
  /* T1b : TBLOCK n est pas admis meme s il est dans DEVISES_BASE */
  const rT = rangFrais(bas('0xb20000000000000000000024c30d3fcb7931272e'), ADMISES);
  console.log('T1b rangFrais(TBLOCK) = ' + rT);
  tem.push({ nom: 'T1b TBLOCK non admis', verdict: rT === null ? 'OK (refuse)' : 'KO' });
  void p;
}
const sansFrais = (tx) => { const c = [], i = []; tx.commandes.forEach((x, k) => { if (x !== CMD.PAY_PORTION) { c.push(x); i.push(tx.entrees[k]); } }); return { ...tx, commandes: c, entrees: i, data: assemblerExecute(c, i, 1n << 40n) }; };
const doubleFrais = (tx) => { const c = [], i = []; tx.commandes.forEach((x, k) => { c.push(x); i.push(tx.entrees[k]); if (x === CMD.PAY_PORTION) { c.push(x); i.push(tx.entrees[k]); } }); return { ...tx, commandes: c, entrees: i, data: assemblerExecute(c, i, 1n << 40n) }; };
const r2 = await executer({ nom: 'T2 route SANS PAY_PORTION (USDC -> AAPLc)', de: USDC, vers: AAPL, montant: 5n * 10n ** 6n, modifier: sansFrais, attenduKo: true });
tem.push({ nom: 'T2 sans frais', verdict: r2.verdict === 'KO' ? 'OK (le juge dit non)' : 'KO', ko: r2.ko });
const r3 = await executer({ nom: 'T3 route avec DEUX PAY_PORTION (USDC -> AAPLc)', de: USDC, vers: AAPL, montant: 5n * 10n ** 6n, modifier: doubleFrais, attenduKo: true });
tem.push({ nom: 'T3 double frais', verdict: r3.verdict === 'KO' ? 'OK (le juge dit non)' : 'KO', ko: r3.ko });
const r4 = await executer({ nom: 'T4 minimum trop haut (sortie+1) : tout revert, a6cf ne touche rien', de: USDC, vers: AAPL, montant: 5n * 10n ** 6n, attenduKo: true,
  modifier: (tx) => { const c = [...tx.commandes], i = [...tx.entrees]; const k = c.lastIndexOf(CMD.SWEEP); const h = i[k]; const mn = BigInt('0x' + h.slice(128)); i[k] = h.slice(0, 128) + mot(mn * 10000n / 9900n + 2n); return { ...tx, entrees: i, data: assemblerExecute(c, i, 1n << 40n) }; } });
tem.push({ nom: 'T4 minimum trop haut', verdict: r4.verdict === 'KO' && r4.delta === '0' ? 'OK (revert, a6cf 0)' : 'KO', ko: r4.ko });

console.log('\n=== BILAN ===');
for (const r of res) console.log((r.verdict === 'OK' ? 'OK   ' : r.verdict.padEnd(5)) + r.nom + (r.verdict === 'OK' ? ' · frais ' + r.delta + ' ' + r.fraisDevise + ' · gaz ' + r.gaz : ' ' + (r.pourquoi || (r.ko || []).join(' | '))));
for (const t of tem) console.log('TEMOIN ' + t.verdict + ' · ' + t.nom);
const json = JSON.stringify({ bloc: g.bloc, res, tem }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1);
(await import('node:fs')).writeFileSync('/workspace/mp-data/banc-resultats.json', json);
const nOk = res.filter((r) => r.verdict === 'OK').length;
console.log(nOk + '/' + res.length + ' swaps OK · temoins ' + tem.filter((t) => t.verdict.startsWith('OK')).length + '/' + tem.length);
process.exit(nOk === res.length && tem.every((t) => t.verdict.startsWith('OK')) ? 0 : 1);
