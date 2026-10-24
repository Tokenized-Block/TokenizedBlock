/* BANC SUR FORK (2026-10-25) : LE VERDICT DE ROUTE DES ACTIONS PROUVEES HORS TABLE (actions-chaine.js, routeAction) EST-IL VRAI A
 * L EXECUTION ? Pour chaque action de la graine hors POOLS_ACTIONS_AERODROME qui a des unites en circulation :
 *   - routeAction LU SUR LE FORK (meme etat que l execution) ;
 *   - si ACHETABLE, ou refusee seulement par POOLS_REFUSEES_EXECUTION (pour savoir si le refus tient encore) : un porteur d USDC
 *     achete 10 USDC de l action par planAerodromeSegment (le planificateur de la fiche), approve + swap, signes sur le fork.
 * ⛔ TROIS CONDITIONS (comme banc-aerodrome-segment-fork) : chainId 8453 et code 0xef ; chaque tx `status 0x1` (recu attendu, jamais
 *   conclu sur un null) ; les soldes bougent du bon montant (10 USDC sortis, l action recue >= le minimum du plan).
 * ⛔ UN VERDICT ACHETABLE QUI NE S EXECUTE PAS EST UN KO. Un refus qui s execute est DIT (le refus est trop prudent), pas un KO.
 * Usage : FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/anvil --base (le build Base, lance par `base-anvil`) --fork-url https://mainnet.base.org --port 9611 ; PORT_FORK=9611 node banc-actions-chaine-fork-20261025.mjs
 *   ⛔ `--base` est obligatoire : un anvil ordinaire n execute pas les B20 (code 0xef -> « OpcodeNotFound »), et le banc serait vide.
 * ⚠️ NE PROUVE PAS : une autre taille que 10 USDC, ni l etat de la chaine apres le bloc du fork. Rien n est envoye hors du fork. */
import { planAerodromeSegment } from './plan-aerodrome-segment.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';
import { routeAction, lireUnites, CREATIONS_GRAINE, POOLS_REFUSEES_EXECUTION, DEVIS_USDC } from './actions-chaine.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { chargerIndexRouteur, chargerNosBlocksTb, sourcesTbLues } from './index-routeur.js';

const URL = 'http://127.0.0.1:' + (process.env.PORT_FORK || '9611');
const USDC = USDC_BASE.toLowerCase();
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b'; /* detenteur d USDC, comme banc-aerodrome-segment-fork */
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
let n = 0, ko = 0, id = 0;
const ok = (nom, cond, vu) => { n += 1; if (cond) { console.log('  ok  ' + nom); return true; } ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '   vu: ' + vu)); return false; };
async function appel(m, p = []) {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = await r.json(); if (j.error) { const e = new Error(m + ' : ' + j.error.message); throw e; } return j.result;
}
const rpc = (m, p) => appel(m, p);
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const solde = async (j, q) => { try { return BigInt(await appel('eth_call', [{ to: j, data: '0x70a08231' + pad(q) }, 'latest'])); } catch (_) { return 0n; } };
/* ⛔ un recu pas encore mine fait demander l amont par anvil (403 « archive » chez publicnode) : c est « pas encore », pas un echec —
 *   on reessaie ; au bout de 50 essais, null = KO « non lu » (jamais conclu vert sur un null). */
async function recu(h) {
  for (let i = 0; i < 50; i += 1) {
    let r = null; try { r = await appel('eth_getTransactionReceipt', [h]); } catch (_) { r = null; }
    if (r) return r;
    await new Promise((x) => setTimeout(x, 200));
  }
  return null;
}

console.log('=== BANC FORK : routeAction des actions prouvees hors table, execute a 10 USDC ===');
const chainId = parseInt(await appel('eth_chainId'), 16);
if (!ok('1. le fork est Base (8453)', chainId === 8453, chainId)) process.exit(1);
const bloc = parseInt(await appel('eth_blockNumber'), 16);
console.log('  bloc du fork : ' + bloc);
const premier = [...CREATIONS_GRAINE.keys()].find((a) => !POOLS_ACTIONS_AERODROME.has(a));
if (!ok('1b. une action de la graine porte 0xef sur le fork', (await appel('eth_getCode', [premier, 'latest'])) === '0xef')) process.exit(1);

await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
await appel('anvil_impersonateAccount', [PM]); await appel('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);
const hF = await appel('eth_sendTransaction', [{ from: PM, to: USDC, data: selecteur('transfer(address,uint256)') + pad(ACHETEUR) + (10n ** 9n).toString(16).padStart(64, '0') }]);
const rF = await recu(hF);
if (!ok('2. l acheteur detient 1 000 USDC', rF && rF.status === '0x1' && (await solde(USDC, ACHETEUR)) >= 10n ** 9n)) process.exit(1);
await appel('anvil_impersonateAccount', [ACHETEUR]);

/* ⛔ LES SOURCES TB, LUES COMME L APP LES LIT (GET en lecture seule sur la prod) : sans elles, tout B20 hors registre est INCONNU = block
 *   et le planificateur refuse « Not tradable here yet » (fail-closed, pool-sans-hook.js classeBlock). C est le cas d un navigateur qui
 *   n a pas encore lu /api/blocks-routeur et /api/nos-blocks — le banc le DIT au lieu de le compter comme un echec de route. */
const SITE = process.env.TB_SITE || 'https://tokenizedblock.space';
try {
  const [r1, r2] = await Promise.all(['/api/blocks-routeur', '/api/nos-blocks'].map((p) => fetch(SITE + p, { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json())));
  chargerIndexRouteur(r1); chargerNosBlocksTb(r2);
} catch (e) { console.log('  ..  sources TB non lues (' + String(e.message).slice(0, 80) + ')'); }
ok('2b. les sources TB sont lues (sinon tout B20 hors registre est refuse, fail-closed)', sourcesTbLues());
const appelFork = (to, data) => appel('eth_call', [{ to, data }, 'latest']);
const bilan = [];
/* ⛔ LES ENTREES DU 2026-10-25 A LA TABLE RESTENT AU BANC : sans elles, les ajouter a la table les ferait sortir du banc qui les a
 *   fait entrer (un banc qui perd son sujet au moment ou il le valide est vert et vide). Symboles relus dans la table elle-meme. */
const AJOUTS_TABLE_20261025 = new Set(['SANc', 'SEc', 'ULc', 'NOKc', 'LIc']);
for (const [adr, g] of CREATIONS_GRAINE) {
  const t = POOLS_ACTIONS_AERODROME.get(adr);
  if (t && !AJOUTS_TABLE_20261025.has(t.symbole)) continue;
  const u = await lireUnites({ rpc, adr });
  if (!(u > 0n)) continue;
  const v = await routeAction({ appel: appelFork, adr });
  /* une entree de table doit aussi avoir le verdict ACHETABLE, sur la MEME pool que la table */
  if (t) ok(g.symbole + ' : entree de table ' + t.pool.slice(0, 10) + '… = la pool que choisit routeAction', v.etat === 'OK' && v.achetable === true && v.pool === t.pool && v.tickSpacing === t.tickSpacing, JSON.stringify({ a: v.achetable, code: v.code, pool: v.pool }));
  /* ECART : le refus est-il celui de la chaine ? On construit le plan et on l envoie (attendu : pas PRET, ou un swap qui echoue) */
  const aExecuter = v.etat === 'OK' && (v.achetable || v.code === 'EXECUTION_ECHOUEE' || v.code === 'HORS_REGISTRE' || v.code === 'ECART');
  if (!aExecuter) { bilan.push({ sym: g.symbole, verdict: v.etat === 'OK' ? v.code : v.etat }); continue; }
  const plan = await planAerodromeSegment({ rpc, chemin: [{ de: USDC, vers: adr, famille: 'aerodrome' }], devise: USDC, block: adr,
    montant: DEVIS_USDC, compte: ACHETEUR, beneficiaireFrais: FEE_WALLET, toleranceBps: 100n });
  if (plan.etat !== 'PRET') {
    if (v.achetable) ok(g.symbole + ' : verdict ACHETABLE, plan PRET', false, plan.etat + ' ' + String(plan.pourquoi || '').slice(0, 120));
    /* la raison HORS_REGISTRE doit etre CELLE du planificateur, pas une supposition */
    if (v.code === 'HORS_REGISTRE') ok(g.symbole + ' : refus HORS_REGISTRE confirme par le planificateur (frais hors devise)', plan.etat === 'REFUSE' && /fee would be taken in the output token/.test(String(plan.pourquoi || '')), plan.etat + ' ' + String(plan.pourquoi || '').slice(0, 100));
    bilan.push({ sym: g.symbole, verdict: v.achetable ? 'ACHETABLE' : v.code, execution: 'PLAN ' + plan.etat }); continue;
  }
  const avU = await solde(USDC, ACHETEUR), avA = await solde(adr, ACHETEUR);
  let tous = true, cause = null;
  for (const a of plan.appels) {
    let h; try { h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: a.to, data: a.data, value: a.value || '0x0' }]); }
    catch (e) { tous = false; cause = String(e.message).slice(0, 140); break; }
    const r = await recu(h); if (!r || r.status !== '0x1') { tous = false; cause = 'status ' + (r ? r.status : 'non lu'); break; }
  }
  const apU = await solde(USDC, ACHETEUR), apA = await solde(adr, ACHETEUR);
  const execute = tous && avU - apU === DEVIS_USDC && apA - avA >= BigInt(plan.resume.recoitAuMoins) && apA > avA;
  if (v.achetable) ok(g.symbole + ' : verdict ACHETABLE et l achat de 10 USDC S EXECUTE (pool ' + v.pool.slice(0, 10) + '…, ts ' + v.tickSpacing + ', ecart ' + v.ecartBps + ' bps)', execute,
    cause || ('USDC ' + (avU - apU) + ', recu ' + (apA - avA) + ' >= ' + plan.resume.recoitAuMoins));
  else if (v.code === 'HORS_REGISTRE') ok(g.symbole + ' : HORS_REGISTRE mais le plan est PRET — le refus est faux', false, 'execute=' + execute);
  else console.log('  ..  ' + g.symbole + ' : refuse (' + v.code + ') — a l execution : ' + (execute ? 'S EXECUTE (le refus est plus prudent que la chaine)' : 'echoue encore (' + cause + ')'));
  bilan.push({ sym: g.symbole, verdict: v.achetable ? 'ACHETABLE' : v.code, execution: execute ? 'OK' : 'ECHEC ' + cause,
    pool: v.pool, tickSpacing: v.tickSpacing, usdcPool: v.usdcPool, ecartBps: v.ecartBps ?? null, recu: String(apA - avA), minimum: plan.resume.recoitAuMoins });
}
console.log('');
console.log(JSON.stringify(bilan, (_, x) => (typeof x === 'bigint' ? String(x) : x)));
const ach = bilan.filter((b) => b.verdict === 'ACHETABLE');
ok('3. au moins un verdict ACHETABLE a ete execute (le banc n est pas vide)', ach.length > 0, ach.length);
console.log('\n' + n + ' assertions, ' + ko + ' KO · bloc ' + bloc + ' · ' + ach.length + ' achetable(s) executee(s)');
process.exit(ko ? 1 : 0);
