/* banc-ajouter-paire-fork-20261017.mjs - UNE SECONDE PAIRE pour un block deja ne : UNIT/ETH reste, UNIT/AAPLc s ouvre a cote, sur le
 * VRAI hook 7030, en executant LES APPELS DU PLANIFICATEUR (ajouter-paire.js) tels quels, puis UN achat de UNIT paye en AAPLc par la
 * NOUVELLE pool. Tout est verifie sur des SOLDES et sur l etat lu au hook / au PoolManager, jamais sur un evenement seul.
 *
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9971
 *         node banc-ajouter-paire-fork-20261017.mjs http://127.0.0.1:9971
 * ⛔ FORK LOCAL SEULEMENT (boucle locale + anvil + chaine 8453 verifies avant tout envoi). AUCUNE CLE : le createur REEL de UNIT
 *   (lu sur la chaine : createurs(poolId UNIT/ETH) au hook 7030) est IMPERSONNE par le fork. L AAPLc d essai est pris a la pool
 *   Aerodrome AAPLc du fork (transfert impersonne, impossible sur la vraie chaine). Tout est annule par evm_revert a la fin.
 * serie-delai-s: 900 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const L = await imp('lancer-pool.js'), T = await imp('tokenomics.js'), F = await imp('frais-creation.js'), D = await imp('hook-7030-descripteur.js');
const PA = await imp('paires.js'), AERO = await imp('pools-actions-aerodrome.js');
const { selecteur, poolId, cleDePool, encodeApprove, encodePermit2Approve, encodeSwapExactInSingle, SANS_MINHOP, isqrt } = await imp('pool.js');

const URL_FORK = process.argv[2] || 'http://127.0.0.1:9971';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const brut = async (method, params) => (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) })).json();
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const lire = (to, sig, args = '') => rpc('eth_call', [{ to, data: '0x' + selecteur(sig) + args }, 'latest']);
const ETH = '0x0000000000000000000000000000000000000000';
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : lireU(jeton, '0x70a08231' + pad(qui)));
const H = T.HOOK_7030, A6CF = F.FEE_WALLET.toLowerCase(), V = L.V4_ADRESSES[8453], UR = L.ROUTEUR_V4[8453], MORT = L.PROPRIETAIRE_PERMANENT;
const UNIT = (process.env.UNIT || '0xb2000000000000000000007afa7ed748b0874f27').toLowerCase();
const AAPL = PA.ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc').adr.toLowerCase();
const POOL_AAPL_AERO = [...AERO.POOLS_ACTIONS_AERODROME.entries()].find(([adr]) => adr.toLowerCase() === AAPL)[1].pool;
const MONTANT_DEVISE = 5000000n; /* 0,05 AAPLc deposes par le createur dans la position */
const ACHAT = 100000n;           /* 0,001 AAPLc : l achat de UNIT par la nouvelle pool */

async function envoyer(de, tx) {
  let gas = 8000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* revert : on l envoie pour LIRE son status 0 */ }
  /* ⛔ frais de gas COMME SUR BASE (base du bloc x 2, pourboire 0,001 gwei) : sans eux, anvil reserve ~1 gwei par gas et le VRAI solde du
   *   createur (0,00115 ETH, lu sur la chaine) ne couvrirait plus 0,001 ETH + la reserve — un echec du banc, pas du chemin. */
  const baseFee = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).baseFeePerGas || '0x0');
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16),
    maxFeePerGas: '0x' + (baseFee * 2n + 1000000n).toString(16), maxPriorityFeePerGas: '0x' + (1000000n).toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status, gas: BigInt(r.gasUsed), prix: BigInt(r.effectiveGasPrice), logs: r.logs || [] }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}

/* ── le fork est-il le bon ? ── */
const client = String(await rpc('web3_clientVersion', []));
const chaine = parseInt(await rpc('eth_chainId', []), 16);
if (!/^anvil\b/i.test(client) || chaine !== 8453) { console.log('KO not an anvil fork of Base (' + client.slice(0, 30) + ', chain ' + chaine + '): nothing is sent'); process.exit(1); }
const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const codeHook = await rpc('eth_getCode', [H, 'latest']);
console.log('fork ' + URL_FORK + ' · ' + client.split(' ')[0] + ' · bloc ' + tete + ' · hook ' + H + ' (' + (codeHook.length - 2) / 2 + ' octets)');
ok(codeHook.length > 1000, 'le fork porte le hook 7030 deploye');
const instantane = await rpc('evm_snapshot', []);
try {
  /* ── le createur REEL de UNIT, LU au hook (jamais recite) ── */
  const cleEth = cleDePool(ETH, UNIT, { fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: H });
  const idEth = poolId(cleEth);
  const CREATEUR = ('0x' + String(await lire(H, 'createurs(bytes32)', idEth.slice(2))).slice(26, 66)).toLowerCase();
  ok(/^0x[0-9a-f]{40}$/.test(CREATEUR) && !/^0x0{40}$/.test(CREATEUR), 'createur de UNIT/ETH lu au hook : ' + CREATEUR);
  const slotEthAvant = await lire(V.stateView, 'getSlot0(bytes32)', idEth.slice(2));
  const liqEthAvant = await lireU(V.stateView, '0x' + selecteur('getLiquidity(bytes32)') + idEth.slice(2));
  ok(BigInt('0x' + slotEthAvant.slice(2, 66)) > 0n, 'UNIT/ETH (la naissance) existe : sqrtPriceX96 ' + BigInt('0x' + slotEthAvant.slice(2, 66)));

  /* ── le planificateur : RED tant qu il n existe pas ── */
  let AP = null;
  try { AP = await imp('ajouter-paire.js'); } catch (e) { console.log('   (ajouter-paire.js : ' + String(e.message).slice(0, 120) + ')'); }
  ok(!!AP && typeof AP.planAjouterPaire === 'function', 'le planificateur planAjouterPaire existe');
  if (!AP || typeof AP.planAjouterPaire !== 'function') throw new Error('RED: no planner');
  ok(AP.AJOUTER_PAIRE_ACTIF === false, 'drapeau AJOUTER_PAIRE_ACTIF = false (rien n est montre a l ecran)');

  /* ── TEMOINS NEGATIFS, sur le vrai hook du fork ── */
  const horsListe = PA.ACTIONS_COINBASE.find((a) => D.plancher7030(a.adr) === null);
  const r1 = await AP.planAjouterPaire({ rpc, compte: CREATEUR, block: UNIT, devise: horsListe.adr, montantDevise: MONTANT_DEVISE });
  ok(r1.etat === 'REFUSE' && !(r1.appels || []).length, 'TEMOIN ' + horsListe.symbole + ' (hors liste du hook) -> REFUSE, aucun appel : ' + r1.pourquoi);
  const r2 = await AP.planAjouterPaire({ rpc, compte: CREATEUR, block: UNIT, devise: ETH, montantDevise: MONTANT_DEVISE });
  ok(r2.etat === 'REFUSE' && !(r2.appels || []).length, 'TEMOIN ETH (deja la paire de naissance) -> REFUSE : ' + r2.pourquoi);
  const r3 = await AP.planAjouterPaire({ rpc, compte: CREATEUR, block: T.TBLOCK, devise: AAPL, montantDevise: MONTANT_DEVISE });
  ok(r3.etat === 'REFUSE' && !(r3.appels || []).length, 'TEMOIN un block sans marche ETH sur nos hooks de naissance -> REFUSE (prix jamais devine) : ' + r3.pourquoi);

  /* ── financer le createur en AAPLc (il n en a pas sur la chaine) ── */
  const aaplAvantFin = await solde(AAPL, CREATEUR);
  await rpc('anvil_impersonateAccount', [POOL_AAPL_AERO]);
  await rpc('anvil_setBalance', [POOL_AAPL_AERO, '0x' + (10n ** 18n).toString(16)]);
  const fin = await envoyer(POOL_AAPL_AERO, { to: AAPL, data: '0xa9059cbb' + pad(CREATEUR) + (MONTANT_DEVISE * 2n).toString(16).padStart(64, '0') });
  await rpc('anvil_stopImpersonatingAccount', [POOL_AAPL_AERO]);
  ok(fin.status === '0x1' && (await solde(AAPL, CREATEUR)) - aaplAvantFin === MONTANT_DEVISE * 2n, 'fork : le createur recoit ' + (MONTANT_DEVISE * 2n) + ' unites AAPLc d essai');

  /* ── LE PLAN ── */
  const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
  const maintenant = Number(BigInt(bloc.timestamp)) * 1000;
  const plan = await AP.planAjouterPaire({ rpc, compte: CREATEUR, block: UNIT, devise: AAPL, montantDevise: MONTANT_DEVISE, maintenant });
  console.log('   plan ' + plan.etat + ' — ' + plan.pourquoi);
  ok(plan.etat === 'APPROBATIONS' && Array.isArray(plan.appels) && plan.appels.length >= 3, 'plan APPROBATIONS, ' + (plan.appels || []).length + ' appels : ' + (plan.appels || []).map((a) => a.nom).join(' | '));
  if (!plan.appels || !plan.appels.length) throw new Error('no calls to execute');
  ok(plan.simulation && plan.simulation.etat === 'ACCEPTE', 'la sequence entiere a ete simulee AVANT (eth_simulateV1) : ' + (plan.simulation && plan.simulation.etat));
  const cout = plan.cout || {};
  ok(cout.fraisNaissanceWei === F.FRAIS_OUVERTURE_WEI, 'cout dit : frais de naissance ' + cout.fraisNaissanceWei + ' wei = 0,001 ETH');
  ok(cout.caution && cout.caution.montant >= D.plancher7030(AAPL), 'cout dit : minimum du createur ' + (cout.caution && cout.caution.montant) + ' AAPLc brut >= plancher du hook ' + D.plancher7030(AAPL));
  ok(cout.depotDevise > 0n && cout.depotDevise <= MONTANT_DEVISE && cout.depotBlock > 0n, 'cout dit : depot ' + cout.depotDevise + ' AAPLc brut + ' + cout.depotBlock + ' UNIT brut, places pour toujours');
  ok(typeof plan.pourquoi === 'string' && /0\.001 ETH/.test(plan.pourquoi), 'pourquoi en clair, cout compris');
  const ins = plan.appels.find((a) => String(a.to).toLowerCase() === H.toLowerCase());
  ok(!!ins && BigInt(ins.value) === F.FRAIS_OUVERTURE_WEI, 'l inscription au hook porte exactement 0,001 ETH (' + (ins && BigInt(ins.value)) + ')');
  const dernier = plan.appels[plan.appels.length - 1];
  ok(String(dernier.to).toLowerCase() === V.posm.toLowerCase() && BigInt(dernier.value || '0x0') === 0n, 'dernier appel = PositionManager (initialize + mint), sans ETH');

  /* ── prix vise, recalcule ICI depuis les memes lectures (aucune constante du planificateur) ── */
  const S = BigInt('0x' + slotEthAvant.slice(2, 66));
  const ref = BigInt(plan.prix.reference.reponse), refDec = BigInt(plan.prix.reference.decimales), ethE6 = BigInt(plan.prix.ethUsdE6);
  const decA = BigInt(await lireU(AAPL, '0x313ce567'));
  /* UNIT brut par wei = S^2 / 2^192 ; wei par AAPLc brut = ref*1e18*1e6 / (10^refDec * ethE6 * 10^decA) ; UNIT est currency0 ici ? */
  const cleN = cleDePool(AAPL, UNIT, { fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: H });
  const blockEst0 = cleN.currency0.toLowerCase() === UNIT;
  const num = S * S * ref * 10n ** 24n, den = (1n << 192n) * 10n ** refDec * ethE6 * 10n ** decA; /* UNIT brut par AAPLc brut = num/den */
  const sqrtAttendu = blockEst0 ? isqrt((den << 192n) / num) : isqrt((num << 192n) / den);
  const ecartVise = Number(BigInt(plan.sqrtVise) > sqrtAttendu ? BigInt(plan.sqrtVise) - sqrtAttendu : sqrtAttendu - BigInt(plan.sqrtVise)) / Number(sqrtAttendu);
  ok(ecartVise < 1e-9, 'prix vise = prix UNIT/ETH x ETH/USD (' + (Number(ethE6) / 1e6) + ') / AAPLc/USD (' + (Number(ref) / 10 ** Number(refDec)) + ') : ecart relatif sqrt ' + ecartVise.toExponential(2));

  /* ── soldes AVANT ── */
  const idN = poolId(cleN);
  const av = { a6cfEth: await solde(ETH, A6CF), a6cfA: await solde(AAPL, A6CF), cEth: await solde(ETH, CREATEUR), cA: await solde(AAPL, CREATEUR), cU: await solde(UNIT, CREATEUR),
    pmA: await solde(AAPL, V.poolm), pmU: await solde(UNIT, V.poolm) };
  ok(BigInt('0x' + String(await lire(V.stateView, 'getSlot0(bytes32)', idN.slice(2))).slice(2, 66)) === 0n, 'avant : UNIT/AAPLc n existe pas');
  const prochainId = await lireU(V.posm, '0x' + selecteur('nextTokenId()'));

  /* ── EXECUTER les appels du plan, dans l ordre, depuis le createur impersonne ── */
  await rpc('anvil_impersonateAccount', [CREATEUR]);
  const recus = [];
  let gasTotal = 0n, payeGas = 0n, aAvantMint = null, pmAAvantMint = null, uAvantMint = null;
  for (const a of plan.appels) {
    if (a === dernier) { aAvantMint = await solde(AAPL, CREATEUR); pmAAvantMint = await solde(AAPL, V.poolm); uAvantMint = await solde(UNIT, CREATEUR); }
    const r = await envoyer(CREATEUR, a);
    recus.push(r); gasTotal += r.gas; payeGas += r.gas * r.prix;
    console.log('   ' + r.status + ' ' + String(r.gas).padStart(8) + ' gas  ' + a.nom);
  }
  await rpc('anvil_stopImpersonatingAccount', [CREATEUR]);
  ok(recus.every((r) => r.status === '0x1'), 'les ' + recus.length + ' appels du plan passent tous (status 1) — gas total ' + gasTotal);

  /* ── la nouvelle pool ── */
  const slotN = await lire(V.stateView, 'getSlot0(bytes32)', idN.slice(2));
  const sqN = BigInt('0x' + slotN.slice(2, 66));
  ok(sqN === BigInt(plan.sqrtVise) && sqN > 0n, 'UNIT/AAPLc existe, initialisee au prix du plan (sqrtPriceX96 ' + sqN + ')');
  const liqN = await lireU(V.stateView, '0x' + selecteur('getLiquidity(bytes32)') + idN.slice(2));
  ok(liqN === BigInt(plan.L), 'liquidite active de la pool = L du plan (' + liqN + ', pleine etendue)');
  const proprio = '0x' + String(await lire(V.posm, 'ownerOf(uint256)', prochainId.toString(16).padStart(64, '0'))).slice(26, 66);
  ok(proprio.toLowerCase() === MORT.toLowerCase(), 'la position #' + prochainId + ' appartient a 0x…dEaD (permanente, comme la naissance)');
  const liqPos = await lireU(V.posm, '0x' + selecteur('getPositionLiquidity(uint256)') + prochainId.toString(16).padStart(64, '0'));
  ok(liqPos === BigInt(plan.L), 'liquidite de la position = L du plan (' + liqPos + ')');
  const depotA = aAvantMint - (await solde(AAPL, CREATEUR)), depotU = uAvantMint - (await solde(UNIT, CREATEUR));
  const entreePmA = (await solde(AAPL, V.poolm)) - pmAAvantMint;
  ok(depotA > 0n && depotA === entreePmA && depotA <= MONTANT_DEVISE, 'le depot AAPLc du createur est DANS la position : ' + depotA + ' unites quittent le createur = ' + entreePmA + ' entrent au PoolManager (<= ' + MONTANT_DEVISE + ' demandes)');
  ok(depotA >= cout.depotDevise && depotA <= cout.depotDevise + 1n, 'depot AAPLc mesure ' + depotA + ' = depot annonce ' + cout.depotDevise + ' (+1 d arrondi au plus)');
  ok(depotU >= cout.depotBlock && depotU <= cout.depotBlock + 1n, 'depot UNIT mesure ' + depotU + ' = depot annonce ' + cout.depotBlock + ' (+1 au plus)');
  const caution = await lireU(H, '0x' + selecteur('caution(bytes32)') + idN.slice(2));
  const qui = '0x' + String(await lire(H, 'createurs(bytes32)', idN.slice(2))).slice(26, 66);
  ok(caution === cout.caution.montant && qui.toLowerCase() === CREATEUR, 'hook : caution ' + caution + ' AAPLc brut au nom du createur ' + qui);
  ok(await lireU(H, '0x' + selecteur('createurActif(bytes32)') + idN.slice(2)) === 1n, 'hook : createurActif(UNIT/AAPLc) = vrai');
  ok(av.cA - (await solde(AAPL, CREATEUR)) === depotA + caution, 'createur : AAPLc sortis = depot ' + depotA + ' + minimum ' + caution + ', rien d autre');
  ok((await solde(ETH, A6CF)) - av.a6cfEth === F.FRAIS_OUVERTURE_WEI, 'a6cf a recu exactement 0,001 ETH (frais de naissance de la paire)');
  ok(av.cEth - (await solde(ETH, CREATEUR)) - payeGas === F.FRAIS_OUVERTURE_WEI, 'createur : ETH sortis hors gas = 0,001 ETH (gas paye ' + payeGas + ' wei)');
  const slotEthApres = await lire(V.stateView, 'getSlot0(bytes32)', idEth.slice(2));
  ok(slotEthApres.slice(0, 66) === slotEthAvant.slice(0, 66) && await lireU(V.stateView, '0x' + selecteur('getLiquidity(bytes32)') + idEth.slice(2)) === liqEthAvant, 'UNIT/ETH (naissance) intacte : meme prix, meme liquidite');

  /* ── UN ACHAT de UNIT paye en AAPLc, par la NOUVELLE pool ── */
  const ACHETEUR = '0x' + ('ac4a7' + tete.toString(16)).padEnd(40, '5').slice(0, 40);
  await rpc('anvil_impersonateAccount', [POOL_AAPL_AERO]);
  await envoyer(POOL_AAPL_AERO, { to: AAPL, data: '0xa9059cbb' + pad(ACHETEUR) + ACHAT.toString(16).padStart(64, '0') });
  await rpc('anvil_stopImpersonatingAccount', [POOL_AAPL_AERO]);
  await rpc('anvil_impersonateAccount', [ACHETEUR]);
  await rpc('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 17n).toString(16)]);
  const zeroForOne = !blockEst0; /* AAPLc -> UNIT */
  const exp = BigInt(Math.floor(maintenant / 1000) + 3600);
  const s1 = await envoyer(ACHETEUR, { to: AAPL, data: encodeApprove(L.PERMIT2, ACHAT) });
  const s2 = await envoyer(ACHETEUR, { to: L.PERMIT2, data: encodePermit2Approve(AAPL, UR, ACHAT, exp) });
  const avAchat = { bU: await solde(UNIT, ACHETEUR), bA: await solde(AAPL, ACHETEUR), a6cfA: await solde(AAPL, A6CF), duC: BigInt('0x' + String(await lire(H, 'comptes(bytes32)', idN.slice(2))).slice(2, 66)) };
  const swap = await envoyer(ACHETEUR, { to: UR, data: encodeSwapExactInSingle({ cle: cleN, zeroForOne, montant: ACHAT, sortieMin: 1n, deadline: exp, forme: SANS_MINHOP }) });
  console.log('   achat : approve ' + s1.status + ' (' + s1.gas + '), permit2 ' + s2.status + ' (' + s2.gas + '), swap ' + swap.status + ' (' + swap.gas + ' gas)');
  ok(swap.status === '0x1', 'achat de UNIT paye ' + ACHAT + ' AAPLc brut par UNIT/AAPLc : status 1 (' + swap.gas + ' gas)');
  const recuU = (await solde(UNIT, ACHETEUR)) - avAchat.bU, payeA = avAchat.bA - (await solde(AAPL, ACHETEUR));
  const fw = ACHAT * 700n / 1000000n, cr = ACHAT * 300n / 1000000n;
  /* sortie attendue, pool sans frais LP : x*y=k sur la position pleine etendue, entree nette des parts du hook */
  const net = ACHAT - fw - cr;
  const spot = Number(sqN) ** 2 / 2 ** 192; /* AAPLc brut par UNIT brut si UNIT = currency0 */
  const attenduMax = blockEst0 ? Number(net) / spot : Number(net) * spot;
  ok(payeA === ACHAT && recuU > 0n && Number(recuU) <= attenduMax && Number(recuU) >= attenduMax * 0.9, 'acheteur : paye ' + payeA + ' AAPLc, recoit ' + recuU + ' UNIT (au prix spot sans impact : ' + Math.floor(attenduMax) + ')');
  const a6cfRecu = (await solde(AAPL, A6CF)) - avAchat.a6cfA;
  ok(a6cfRecu === fw, 'wallet de frais a6cf : +' + a6cfRecu + ' AAPLc = floor(achat x 700 / 1e6) = ' + fw + ' (HOOK_FEE du 7030, paye EN AAPLc)');
  const duC = BigInt('0x' + String(await lire(H, 'comptes(bytes32)', idN.slice(2))).slice(2, 66)) - avAchat.duC;
  ok(duC === cr, 'part du createur courue au hook : +' + duC + ' AAPLc = floor(achat x 300 / 1e6) = ' + cr);
  const cAvRecl = await solde(AAPL, CREATEUR);
  const recl = await envoyer(ACHETEUR, { to: H, data: '0x' + selecteur('reclamer((address,address,uint24,int24,address))') + pad(cleN.currency0) + pad(cleN.currency1) + '0'.repeat(64) + L.TICK_SPACING_POOL.toString(16).padStart(64, '0') + pad(H) });
  await rpc('anvil_stopImpersonatingAccount', [ACHETEUR]);
  const recuC = (await solde(AAPL, CREATEUR)) - cAvRecl;
  ok(recl.status === '0x1' && recuC === cr, 'reclamer (par n importe qui) verse la part au createur : +' + recuC + ' AAPLc sur SON solde (' + recl.gas + ' gas)');
  ok((await solde(ETH, A6CF)) - av.a6cfEth === F.FRAIS_OUVERTURE_WEI, 'a6cf ETH : toujours +0,001 ETH au total (l achat ne prend pas d ETH)');
  console.log('MESURES ' + JSON.stringify({ bloc: tete, createur: CREATEUR, sqrtVise: String(plan.sqrtVise), L: String(plan.L), depotAAPLc: String(depotA), depotUNIT: String(depotU), cautionAAPLc: String(caution), fraisNaissanceWei: String(F.FRAIS_OUVERTURE_WEI), gasPlan: recus.map((r) => String(r.gas)), gasPlanTotal: String(gasTotal), achatAAPLc: String(ACHAT), recuUNIT: String(recuU), a6cfAAPLc: String(a6cfRecu), createurAAPLc: String(recuC), gasSwap: String(swap.gas) }));
} catch (e) {
  ko += 1; console.log('KO  ' + String((e && e.message) || e).slice(0, 300));
} finally {
  await rpc('evm_revert', [instantane]).catch(() => null);
}
console.log(ko ? 'KO ' + ko + '/' + n + ' — banc-ajouter-paire-fork' : 'ok banc-ajouter-paire-fork - ' + n + ' assertions');
process.exit(ko ? 1 : 0);
