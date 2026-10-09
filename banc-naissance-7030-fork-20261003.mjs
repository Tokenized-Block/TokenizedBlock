/* banc-naissance-7030-fork-20261003.mjs — UNE NAISSANCE ENTIERE SUR LE VRAI HOOK 7030, EXECUTEE SUR UN FORK DE BASE.
 *
 * ⛔⛔ POURQUOI : le drapeau 7030 a ete allume (3c89dba) sans qu une seule naissance ait ete EXECUTEE contre le contrat deploye —
 *   les bancs d alors simulaient un hook qui rendait 0 partout. Resultat : l Instant Birth envoyait 0,0003 ETH a une inscription
 *   qui en exigeait 0,001 (pas de sel de createPaid) -> MontantInsuffisant -> aucun Create possible sur les 62 devises.
 * CE BANC EXECUTE, avec les modules de l app (encodeur, index-routeur, lancer-pool, lancer-pool-v2, paires, descripteur) :
 *   createPaid (0,0007 ETH) -> approbations -> inscrireAvecCaution a 4 arguments (0,0003 + caution) -> ouverture du marche,
 *   pour ETH (deux prix de l ETH : le plancher du hook gagne, puis 1 $ du jour gagne), USDC, et une action tokenisee.
 * IL MESURE, sur les RECUS (status 1) et l ETAT : a6cf recoit 0,001 ETH au total par naissance ; le createur est inscrit ; la
 *   caution deposee = le minimum ; la pool existe (sqrtPriceX96 != 0).
 * TEMOINS NEGATIFS (le hook reel, pas une copie) : l ancien appel (3 arguments, 0,0003) reverte MontantInsuffisant ; un faux sel
 *   reverte PasNeDuRouteur ; l ancienne caution (1 $ a 2 700 $ l ETH, sous le plancher) reverte CautionSousLePlancher ; et le
 *   module REFUSE le cas sans sel avant toute signature.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle) — ne prouve ni l interface, ni un vrai wallet, ni le lot
 *   wallet_sendCalls (les appels sont envoyes un par un, dans l ordre du lot). Les jetons de caution (USDC, action) sont pris a
 *   un detenteur impersonne : ce transfert n existe pas sur mainnet. Jamais depuis a6cf.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-naissance-7030-fork-20261003.mjs [http://127.0.0.1:8549] */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const E = await imp('encodeur.js'), R = await imp('index-routeur.js'), L = await imp('lancer-pool.js'), L2 = await imp('lancer-pool-v2.js');
const T = await imp('tokenomics.js'), F = await imp('frais-creation.js'), P = await imp('paires.js'), D = await imp('hook-7030-descripteur.js');
const AP = await imp('apparence.js'), LG = await imp('logo.js');
const { selecteur, poolId } = await imp('pool.js');
const URL_FORK = process.argv[2] || 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const brut = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  return r;
};
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const H = T.HOOK_7030, ETH = '0x' + '0'.repeat(40), USDC = F.USDC_BASE.toLowerCase(), A6CF = F.FEE_WALLET;
const STATE_VIEW = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const VIE = 300000000000000n, CREATE_PAID = F.FRAIS_OUVERTURE_WEI - F.CREATE_FEE_WEI_FLOOR;
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const balance = (jeton, qui) => lireU(jeton, '0x70a08231' + adrMot(qui));
/** envoie depuis un compte impersonne, ATTEND le recu (un recu null n est pas un echec : course de lecture) */
async function envoyer(de, tx) {
  /* ⛔ le gas est ESTIME (x1,3), pas fixe : graver une face coute de 1 a plusieurs millions de gas selon sa taille — un plafond
   *   fixe de 6 M faisait echouer createPaid sur 3 faces sur 4 (status 0), et le banc accusait le hook. Estimation ratee = la
   *   transaction reverterait : on l envoie quand meme a 15 M pour LIRE le status 0 dans un recu, pas dans une exception. */
  let gas = 15000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) {}
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status, gas: BigInt(r.gasUsed) }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
/** eth_call qui DOIT reverter : rend les 4 octets de l erreur (ou null si l appel passe) */
async function revert(de, tx) {
  const r = await brut('eth_call', [{ from: de, to: tx.to, data: tx.data, value: tx.value || '0x0' }, 'latest']);
  if (!r.error) return null;
  const d = String(r.error.data || (r.error.message.match(/0x[0-9a-f]{8,}/i) || [''])[0]);
  return d.slice(0, 10).toLowerCase() || 'revert:' + r.error.message.slice(0, 60);
}
const E_MONTANT = '0x' + selecteur('MontantInsuffisant()'), E_ROUTEUR = '0x' + selecteur('PasNeDuRouteur()'), E_PLANCHER = '0x' + selecteur('CautionSousLePlancher(uint256,uint256)');

/* ── le fork est-il le bon ? ── */
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
const codeHook = await rpc('eth_getCode', [H, 'latest']);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete + ' · hook ' + H + ' (' + (codeHook.length - 2) / 2 + ' octets)');
ok(chaine === 8453 && codeHook.length > 1000, 'le fork est Base et porte le hook 7030 deploye (sinon ce banc ne prouve rien)');
ok(await lireU(H, '0x' + selecteur('fraisVie()')) === VIE && await lireU(H, '0x' + selecteur('fraisCreation()')) === CREATE_PAID, 'hook : fraisVie = 0,0003 ETH, fraisCreation = 0,0007 ETH');

let serie = 0;
async function compteNeuf() {
  serie += 1;
  const a = '0x' + ('c0ffee' + String(tete) + String(serie)).padEnd(40, '7').slice(0, 40);
  if (a.toLowerCase() === A6CF.toLowerCase()) throw new Error('never from the fee wallet');
  await rpc('anvil_impersonateAccount', [a]);
  await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]);
  return a;
}
/** createPaid tel que l app le construit ; rend l adresse nee et le sel */
async function creer(compte, etiquette) {
  const saltTexte = 'banc-7030-' + tete + '-' + etiquette + '-' + serie;
  /* ⛔ L URI EST CELLE QUE L APP GRAVE (uriCreation, app.html) : JSON encode, avec la FACE. Le hook relit contractURI() et exige
   *   son marqueur (`"face":{` encode, lu sur le hook ci-dessous) — mon premier jet gravait un URI jouet : SansLabel, banc rouge
   *   par sa propre faute. La face est tiree comme l app la tire (apparence.js + logo.js). */
  const sym = 'BNC' + serie, face = AP.apparenceDepuisAdresse(compte);
  const svg = LG.logoSvg(LG.paramsLogoDepuisApparence(face, sym));
  const uri = 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: 'Banc ' + etiquette, symbol: sym, supply: T.SUPPLY_FIXE.toString(), sealed: true,
    face, flyBrain: true, image: 'data:image/svg+xml,' + encodeURIComponent(svg), pair: null }));
  const data = E.encodeCreatePaid({ variant: 0, saltTexte, params: E.paramsAsset({ nom: 'Banc ' + etiquette, symbole: sym, admin: compte, decimales: T.DECIMALES_FIXES }),
    initCalls: [E.encodeUpdateContractURI(uri)], creator: compte });
  const sel = R.selDeCreatePaid(data), adr = R.adresseNeeDuRouteur(sel);
  const r = await envoyer(compte, { to: F.CREATE_ROUTER, data, value: '0x' + CREATE_PAID.toString(16) });
  return { adr, sel, data, recu: r };
}

/**
 * Une naissance complete. `prixUsd` = le prix de la devise que l app lirait (pour son minimum de 1 $) ; la caution envoyee est
 * max(1 $ a ce prix, plancher du hook) — la regle de cautionCreateurPour (app.html).
 */
async function naissance({ etiquette, devise, decimales, prixUsd, valorisation, financer = null }) {
  console.log('— ' + etiquette);
  const compte = await compteNeuf();
  const a0 = await solde(A6CF);
  const { adr, sel, recu } = await creer(compte, etiquette);
  ok(recu.status === '0x1' && await balance(adr, compte) === T.SUPPLY_FIXE, etiquette + ' : createPaid status 1, le block ' + adr.slice(0, 14) + '… existe et le createur tient toute la supply');
  ok(R.neDuRouteur(adr, sel) && await lireU(H, '0x' + selecteur('neDuRouteur(address,bytes32)') + adrMot(adr) + sel.slice(2)) === 1n, etiquette + ' : le sel prouve le block, par notre formule ET par le hook');
  ok(await lireU(H, '0x' + selecteur('porteLeLabel(address)') + adrMot(adr)) === 1n, etiquette + ' : le hook reconnait la face gravee (porteLeLabel) — l URI du banc est celle de l app');
  const minimumApp = P.minimumCautionCreateur({ prixUsd, decimales });
  const plancher = D.plancher7030(devise);
  const minimum = plancher !== null && plancher > BigInt(minimumApp) ? plancher : BigInt(minimumApp);
  if (financer) await financer(compte, minimum);
  let plan = await L.planLancement({ rpc, chaine: 8453, jeton: adr, compte, valorisationEth: valorisation, partPourMille: 999, hooks: H,
    ...(devise !== ETH ? { devise } : { quoteEthWei: F.CREATE_FEE_WEI_FLOOR, soldePresume: T.SUPPLY_FIXE }) });
  ok(plan && (plan.etat === 'PRET' || plan.etat === 'APPROBATIONS') && plan.tx, etiquette + ' : planLancement ' + (plan && plan.etat) + (plan && plan.pourquoi ? ' — ' + plan.pourquoi : ''));
  if (!plan || !plan.tx) return null;
  /* TEMOIN : sans le sel, le module refuse AVANT toute signature (c etait le revert de prod) */
  const sans = await L2.completerInscriptionPayee({ rpc, plan, compte, fraisWei: F.FRAIS_OUVERTURE_WEI - CREATE_PAID, hook: H, caution: { minimum, devise } });
  ok(sans.etat === 'REFUSE' && (sans.etapes || []).length === 0, etiquette + ' : TEMOIN sans sel -> le module REFUSE avant signature');
  plan = await L2.completerInscriptionPayee({ rpc, plan, compte, fraisWei: F.FRAIS_OUVERTURE_WEI - CREATE_PAID, hook: H, caution: { minimum, devise }, sel });
  const ins = (plan.etapes || []).find((x) => L2.estEtapeInscription(x.data));
  ok(plan.etat === 'APPROBATIONS' && ins && ins.data.startsWith('0x8beeda0f') && ins.selRouteur === sel.toLowerCase(), etiquette + ' : etape de naissance = inscrireAvecCaution a 4 arguments, avec le sel');
  if (!ins) return null;
  const cautionWei = devise === ETH ? minimum : 0n;
  ok(BigInt(ins.value) === VIE + cautionWei, etiquette + ' : valeur de l etape = 0,0003 ETH' + (devise === ETH ? ' + caution ' + minimum + ' wei' : ' (caution en devise : ' + minimum + ' unites)'));
  /* TEMOINS NEGATIFS SUR LE HOOK REEL, avant d envoyer quoi que ce soit */
  const k3 = L2.encodeInscrireAvecCaution(plan.cle, plan.sqrtVise, minimum);
  ok(await revert(compte, { to: H, data: k3, value: ins.value }) === E_MONTANT, etiquette + ' : TEMOIN l ANCIEN appel (3 arguments, meme valeur) reverte MontantInsuffisant (' + E_MONTANT + ') — le defaut de prod, reproduit');
  const kFaux = L2.encodeInscrireAvecCaution(plan.cle, plan.sqrtVise, minimum, '0x' + 'ab'.repeat(32));
  ok(await revert(compte, { to: H, data: kFaux, value: ins.value }) === E_ROUTEUR, etiquette + ' : TEMOIN un faux sel reverte PasNeDuRouteur (' + E_ROUTEUR + ')');
  /* l ordre du lot de l app : etapes payantes d abord ? Non — ici l ordre du PLAN (approbations, inscription), puis le mint. */
  const statuts = [];
  for (const et of plan.etapes) statuts.push((await envoyer(compte, et)).status);
  const mint = await envoyer(compte, plan.tx);
  ok(statuts.every((s) => s === '0x1') && mint.status === '0x1', etiquette + ' : ' + statuts.length + ' etape(s) + ouverture du marche — toutes status 1 (' + statuts.join(',') + ' ; mint ' + mint.status + ', ' + mint.gas + ' gas)');
  const id = poolId(plan.cle);
  const a1 = await solde(A6CF);
  ok(a1 - a0 === F.FRAIS_OUVERTURE_WEI, etiquette + ' : a6cf a recu ' + (a1 - a0) + ' wei = 0,001 ETH AU TOTAL (createPaid 0,0007 + inscription 0,0003), ni plus ni moins');
  const createur = '0x' + String(await rpc('eth_call', [{ to: H, data: '0x' + selecteur('createurs(bytes32)') + id.slice(2) }, 'latest'])).slice(26, 66);
  const depose = await lireU(H, '0x' + selecteur('caution(bytes32)') + id.slice(2)), exige = await lireU(H, '0x' + selecteur('minimumCaution(bytes32)') + id.slice(2));
  ok(createur.toLowerCase() === compte.toLowerCase() && exige === minimum && depose >= minimum, etiquette + ' : createur inscrit = le compte ; caution deposee ' + depose + ' >= minimum ' + exige);
  const actif = await lireU(H, '0x' + selecteur('createurActif(bytes32)') + id.slice(2));
  ok(actif === 1n, etiquette + ' : createurActif = vrai (sa part de 0,03 % coule)');
  const sq = BigInt(String(await rpc('eth_call', [{ to: STATE_VIEW, data: '0xc815641c' + id.slice(2) }, 'latest'])).slice(0, 66));
  ok(sq === BigInt(plan.sqrtVise) && sq > 0n, etiquette + ' : la pool existe au prix inscrit (sqrtPriceX96 ' + sq.toString().slice(0, 10) + '…)');
  return { compte, adr, sel, plan, minimum, minimumApp: BigInt(minimumApp), plancher };
}

/* ── 1. ETH, prix de l ETH 2 700 $ : 1 $ = 3,70e14 wei < plancher du hook -> le PLANCHER gagne ── */
const e1 = await naissance({ etiquette: 'ETH@2700', devise: ETH, decimales: 18, prixUsd: 2700, valorisation: 10 });
if (e1) {
  ok(e1.plancher !== null && e1.minimumApp < e1.plancher && e1.minimum === e1.plancher, 'ETH@2700 : 1 $ (' + e1.minimumApp + ' wei) < plancher (' + e1.plancher + ') -> caution = le plancher du hook');
  /* TEMOIN : l ancienne caution (1 $ du jour, sous le plancher), sur un AUTRE block ne du routeur, avec le bon sel */
  const c2 = await compteNeuf(); const b2 = await creer(c2, 'plancher');
  const p2 = await L.planLancement({ rpc, chaine: 8453, jeton: b2.adr, compte: c2, valorisationEth: 10, partPourMille: 999, hooks: H, quoteEthWei: F.CREATE_FEE_WEI_FLOOR, soldePresume: T.SUPPLY_FIXE });
  const k = L2.encodeInscrireAvecCaution(p2.cle, p2.sqrtVise, e1.minimumApp, b2.sel);
  ok(await revert(c2, { to: H, data: k, value: '0x' + (VIE + e1.minimumApp).toString(16) }) === E_PLANCHER, 'TEMOIN : l ancienne caution (1 $ a 2 700 $ l ETH) reverte CautionSousLePlancher (' + E_PLANCHER + ')');
}
/* ── 2. ETH, prix 2 000 $ : 1 $ = 5e14 wei > plancher -> 1 $ DU JOUR gagne ── */
const e2 = await naissance({ etiquette: 'ETH@2000', devise: ETH, decimales: 18, prixUsd: 2000, valorisation: 10 });
if (e2) ok(e2.minimumApp > e2.plancher && e2.minimum === e2.minimumApp, 'ETH@2000 : 1 $ (' + e2.minimumApp + ' wei) > plancher -> caution = 1 $ du jour');

/* un detenteur impersonne donne la caution en devise (n existe pas sur mainnet — borne dite en tete) */
const donner = (jeton, detenteur) => async (compte, montant) => {
  await rpc('anvil_impersonateAccount', [detenteur]);
  await rpc('anvil_setBalance', [detenteur, '0x' + (10n ** 18n).toString(16)]);
  const r = await envoyer(detenteur, { to: jeton, data: '0xa9059cbb' + adrMot(compte) + mot(montant * 3n) });
  if (r.status !== '0x1' || await balance(jeton, compte) < montant) throw new Error('could not fund the caution token on the fork');
};
/* ── 3. USDC ── */
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const poolNvda = [...POOLS_ACTIONS_AERODROME.values()].find((x) => x.symbole === 'NVDAc').pool; /* tient USDC et NVDAc */
try {
  await naissance({ etiquette: 'USDC', devise: USDC, decimales: 6, prixUsd: 1.0001, valorisation: 27000, financer: donner(USDC, poolNvda) });
} catch (e) { ok(false, 'USDC : le banc a plante — ' + String(e && e.message).slice(0, 140)); }
/* ── 4. une action tokenisee (le produit : un block apparie a une action Coinbase) ── */
const NVDA = P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr.toLowerCase();
try {
  const dec = Number(await lireU(NVDA, '0x313ce567'));
  await naissance({ etiquette: 'NVDAc', devise: NVDA, decimales: dec, prixUsd: 190, valorisation: 142, financer: donner(NVDA, poolNvda) });
} catch (e) { ok(false, 'NVDAc : le banc a plante — ' + String(e && e.message).slice(0, 140)); }

/* ── 5. une action que le V8 N ADMET PAS (AMDc : lancable seulement depuis le 7030 — c est le « 62 » du produit) ── */
const AMD = P.ACTIONS_COINBASE.find((a) => a.symbole === 'AMDc').adr.toLowerCase();
try {
  ok(await lireU(T.HOOK_V8, '0x' + selecteur('deviseAdmise(address)') + adrMot(AMD)) === 0n && await lireU(H, '0x' + selecteur('deviseAdmise(address)') + adrMot(AMD)) === 1n,
    'AMDc : refusee par le V8, admise par le 7030 (lu sur les deux hooks)');
  const dec = Number(await lireU(AMD, '0x313ce567'));
  /* detenteur : le PoolManager v4 (la pool USDC/AMDc lue le 2026-10-03 y vit) */
  await naissance({ etiquette: 'AMDc', devise: AMD, decimales: dec, prixUsd: 614, valorisation: 44, financer: donner(AMD, '0x498581ff718922c3f8e6a244956af099b2652b2b') });
} catch (e) { ok(false, 'AMDc : le banc a plante — ' + String(e && e.message).slice(0, 140)); }

/* ── 5b. (2026-10-09) LES DEUX PAIRES ENCORE NON MESUREES : cbBTC (type MAJEUR) et un block B20 SAISI (TBLOCK, natif 0xef). Question :
 *   leur naissance depense-t-elle de l ETH au-dela de 0,001 (une graine) ? `naissance()` mesure la valeur de l etape et ce que recoit
 *   a6cf. D abord : le hook 7030 ADMET-il la devise ? Sinon elle n est pas lancable ici, et c est la reponse. Le detenteur impersonne est
 *   le PoolManager v4 ; son solde est LU avant (un detenteur vide ferait echouer le banc, pas le hook). */
const PM_V4_BANC = '0x498581ff718922c3f8e6a244956af099b2652b2b';
for (const [etiquette, adrDevise, prixUsd] of [['cbBTC', P.pairesProposees(8453).find((p) => p.symbole === 'cbBTC').adr.toLowerCase(), 60000], ['TBLOCK (saisi)', String(T.TBLOCK).toLowerCase(), 0.0001]]) {
  try {
    const admise = await lireU(H, '0x' + selecteur('deviseAdmise(address)') + adrMot(adrDevise));
    if (admise !== 1n) { console.log('— ' + etiquette + ' : NON admise par le hook 7030 (deviseAdmise = ' + admise + ') — pas lancable ici, rien a mesurer'); continue; }
    const tient = await balance(adrDevise, PM_V4_BANC);
    if (!(tient > 0n)) { console.log('— ' + etiquette + ' : le detenteur du banc n en tient pas — NON MESURE'); continue; }
    const dec = Number(await lireU(adrDevise, '0x313ce567'));
    await naissance({ etiquette, devise: adrDevise, decimales: dec, prixUsd, valorisation: 10, financer: donner(adrDevise, PM_V4_BANC) });
  } catch (e) { ok(false, etiquette + ' : le banc a plante — ' + String(e && e.message).slice(0, 140)); }
}

/* ── 6. LE PLAN RENDU A UN AGENT (naissance-api.js, celui du MCP), EXECUTE TEL QUEL ───────────────────────────────────────────────
 * base-anvil n a pas eth_simulateV1 : on l EMULE fidelement — instantane, envoi reel de chaque appel, lecture des status, retour
 * a l instantane. Le plan est donc juge par une execution, puis rejoue pour de bon. */
const NA = await imp('naissance-api.js'), CC = await imp('caution-createur.js');
const rpcPlan = async (method, params) => {
  if (method !== 'eth_simulateV1') return rpc(method, params);
  const calls = params[0].blockStateCalls[0].calls, snap = await rpc('evm_snapshot', []);
  const res = [];
  try { for (const c of calls) { let st = '0x0'; try { st = (await envoyer(c.from, c)).status; } catch (_) { st = '0x0'; } res.push({ status: st, error: st === '0x1' ? undefined : { message: 'reverted on the fork' } }); } }
  finally { await rpc('evm_revert', [snap]); }
  return [{ calls: res }];
};
console.log('— plan MCP (naissance-api) execute');
try {
  const agent = await compteNeuf();
  const a0 = await solde(A6CF);
  const pl = await NA.planNaissance({ nom: 'Agent Banc', symbole: 'agb', compte: agent, sel: 'agent-' + tete + '-' + serie }, { rpc: rpcPlan, prixUsd: async (a) => (a === null ? 2000 : null) });
  ok(pl.etat === 'PRET' && pl.aSigner.length === 5 && pl.aSigner.map((c) => c.role).join() === 'create,approve,approve,birth,open', 'plan MCP : PRET, 5 appels dans l ordre (' + (pl.pourquoi || pl.aSigner.map((c) => c.role).join()) + ')');
  ok(await solde(A6CF) === a0, 'TEMOIN : planifier n a RIEN envoye (a6cf inchange apres la simulation emulee)');
  const st = [];
  for (const c of pl.aSigner) st.push((await envoyer(agent, c)).status);
  ok(st.every((s) => s === '0x1'), 'plan MCP execute tel quel : ' + st.join(',') + ' — toutes status 1');
  ok(await solde(A6CF) - a0 === F.FRAIS_OUVERTURE_WEI && pl.cout.fraisEthWei === F.FRAIS_OUVERTURE_WEI.toString(), 'plan MCP : a6cf a recu 0,001 ETH au total = le `cout.fraisEthWei` annonce');
  ok(await balance(pl.block.adresse, agent) > 0n && await lireU(H, '0x' + selecteur('porteLeLabel(address)') + adrMot(pl.block.adresse)) === 1n, 'plan MCP : le block existe a l adresse annoncee, face gravee reconnue par le hook');

  /* ── 7. LA SORTIE DU MINIMUM DU CREATEUR (caution-createur.js) sur ce marche ── */
  console.log('— sortie du minimum du createur');
  const cle = CC.cleMarcheCreateur({ bloc: pl.block.adresse, devise: ETH, hook: H });
  const heure = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
  const etat = async () => CC.etatCautionCreateur({ rpc, hook: H, cle, maintenantSec: await heure() });
  const e0 = await etat();
  ok(e0.etat === 'LUE' && e0.phase === 'ACTIF' && e0.partActive === true && e0.createur === agent.toLowerCase() && e0.depose.toString() === pl.cout.minimumCreateur.montant && e0.delaiSec === 604800,
    'etat lu : ACTIF, createur = l agent, depose = le minimum annonce (' + e0.depose + ' wei), delai 604800 s');
  const autre = await compteNeuf();
  ok(CC.sortieCautionPour({ etat: e0, compte: autre, hook: H, cle }).appel === null
    && await revert(autre, CC.appelDemanderRetrait({ hook: H, cle })) === '0x' + selecteur('PasLeCreateur()'), 'TEMOIN : un autre wallet n a aucun appel, et le hook le refuserait (PasLeCreateur)');
  const s1 = CC.sortieCautionPour({ etat: e0, compte: agent, hook: H, cle });
  ok(s1.etape === 'DEMANDER' && (await envoyer(agent, s1.appel)).status === '0x1', 'demanderRetrait : status 1');
  const e1b = await etat();
  ok(e1b.phase === 'SORTIE_DEMANDEE' && e1b.partActive === false && e1b.secondesRestantes > 604000 && e1b.secondesRestantes <= 604800
    && await lireU(H, '0x' + selecteur('createurActif(bytes32)') + poolId(cle).slice(2)) === 0n, 'apres la demande : SORTIE_DEMANDEE, la part du createur est ARRETEE (createurActif = 0), ~7 jours restants (' + e1b.secondesRestantes + ' s)');
  ok(CC.sortieCautionPour({ etat: e1b, compte: agent, hook: H, cle }).appel === null
    && await revert(agent, CC.appelRetirerCaution({ hook: H, cle })) === '0x' + selecteur('RetraitPasPret()'), 'TEMOIN avant l echeance : aucun appel propose, et le hook reverterait RetraitPasPret');
  await rpc('evm_increaseTime', [604800]); await rpc('evm_mine', []);
  const e2b = await etat();
  const s2 = CC.sortieCautionPour({ etat: e2b, compte: agent, hook: H, cle });
  ok(e2b.phase === 'RETIRABLE' && s2.etape === 'RETIRER', '7 jours plus tard (horloge de la chaine avancee) : RETIRABLE');
  const b0 = await solde(agent);
  const h2 = await rpc('eth_sendTransaction', [{ from: agent, to: s2.appel.to, data: s2.appel.data, value: '0x0', gas: '0x7a120' }]);
  let r2 = null; for (let i = 0; i < 100 && !r2; i += 1) { r2 = await rpc('eth_getTransactionReceipt', [h2]); if (!r2) await new Promise((o) => setTimeout(o, 100)); }
  /* le cout de la tx sur Base = gas L2 + frais L1 : on le lit sur le recu (l1Fee quand le noeud le rend) */
  const coutTx = BigInt(r2.gasUsed) * BigInt(r2.effectiveGasPrice) + BigInt(r2.l1Fee || '0x0');
  const recu = await solde(agent) - b0 + coutTx;
  ok(r2.status === '0x1' && recu === e2b.depose, 'retirerCaution : status 1, le createur a recu ' + recu + ' wei = TOUT le depot (' + e2b.depose + ')');
  const e3b = await etat();
  ok(e3b.phase === 'RETIRE' && e3b.depose === 0n && CC.sortieCautionPour({ etat: e3b, compte: agent, hook: H, cle }).appel === null, 'apres : RETIRE, depot 0, plus aucun appel propose');
} catch (e) { ok(false, 'plan MCP / sortie : le banc a plante — ' + String(e && e.message).slice(0, 160)); }
/* ⛔ L HORLOGE DU FORK EST REMISE A L HEURE : le saut de 7 jours empoisonnait la relance (mesure : 2e passage = 13 KO — les
 *   echeances Permit2 calculees sur l horloge murale etaient deja passees pour la chaine). Un banc doit pouvoir se rejouer. */
try {
  await rpc('evm_setTime', [Math.floor(Date.now() / 1000)]); await rpc('evm_mine', []);
  const ts = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
  ok(Math.abs(ts - Math.floor(Date.now() / 1000)) < 600, 'horloge du fork remise a l heure murale (ecart ' + (ts - Math.floor(Date.now() / 1000)) + ' s) : le banc reste rejouable');
} catch (e) { ok(false, 'horloge du fork non remise : ' + String(e && e.message).slice(0, 100)); }

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
