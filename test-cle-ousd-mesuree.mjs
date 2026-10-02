/* test-cle-ousd-mesuree.mjs — LA CLE V4 D OUSD/USDC, LUE SUR LA CHAINE, REND LA ROUTE OUSD CONSTRUCTIBLE.
 *
 * 2026-10-02 : OUSD liste chez Coinbase (online, Base 0xB200…5344, convertible 1:1 en USD/USDC). /api/prix-usd le
 * cotait (1,000001 $, ~10 M$) mais rendait cleV4: null — l Initialize de la pool (bloc 51 962 957) est hors de la
 * fenetre de 120 000 blocs du serveur. Le log mesure est garde tel quel et repasse par le decodeur canonique.
 * ⚠️ NE PROUVE PAS un swap reel (quoter simule) ; prouve que la cle est la bonne et que le plan se construit. */
import fs from 'node:fs';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
import { decoderInitialize } from './pools-du-jeton.js';
import * as E from './echange.js';
import * as T from './tokenomics.js';
import { USDC_BASE } from './frais-creation.js';

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const OUSD = '0xb2000000000000000000002feb517dfec7415344', USDC = USDC_BASE.toLowerCase(), ETH = '0x' + '0'.repeat(40);
const ID = '0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a'; /* poolId rendu par dexscreener ET /api/prix-usd */

const p = decoderInitialize(LOGS_INITIALIZE_MESURES[0]);
ok(p && !p.erreur && p.poolId === ID, 'le log mesure se decode et son poolId se RECALCULE (' + (p && (p.poolId || p.erreur)) + ')');
ok(p.cle.currency0 === USDC && p.cle.currency1 === OUSD && p.cle.fee === 100 && p.cle.tickSpacing === 1 && p.cle.hooks === ETH,
  'cle OUSD/USDC : fee 100, tickSpacing 1, sans hook');
const altere = { ...LOGS_INITIALIZE_MESURES[0], data: LOGS_INITIALIZE_MESURES[0].data.replace(/64(0{62})/, 'c8$1') };
ok(decoderInitialize(altere).erreur === 'poolId ne se recalcule pas', 'TEMOIN : un log altere (fee 200) est REFUSE par le decodeur');
ok(Object.isFrozen(LOGS_INITIALIZE_MESURES) && Object.isFrozen(LOGS_INITIALIZE_MESURES[0]), 'logs figes');

const srv = fs.readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
ok(/for \(const l of LOGS_INITIALIZE_MESURES\) \{\n\s+const p = decoderInitialize\(l\);\n\s+if \(p && !p\.erreur && p\.cle && p\.poolId\) clesV4Lues\.set\(p\.poolId, p\.cle\);/.test(srv),
  'serveur-web.js pre-remplit clesV4Lues par le decodeur canonique');

/* ── la route d un porteur d OUSD vers un block V8 : OUSD -> USDC -> ETH -> block ── */
const BLOC = '0xb2ffffffffffffffffffffffffffffffffffff01';
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
const sauts = [
  { cle: p.cle, zeroForOne: false },                                                                            /* OUSD -> USDC */
  { cle: { currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: false },       /* USDC -> ETH */
  { cle: { currency0: ETH, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 }, zeroForOne: true },  /* ETH -> block (V8) */
];
const plan = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte: '0x' + '4'.repeat(40), sauts, entree: OUSD, sortie: BLOC,
  montant: 100n * 10n ** 6n, decimalesEntree: 6, prixUsdEntree: 1 });
ok(['PRET', 'APPROBATIONS'].includes(plan.etat), 'OUSD -> USDC -> ETH -> block V8 : plan construit (' + plan.etat + ' ' + (plan.pourquoi || '') + ')');
ok(plan.resume && plan.resume.fraisParHook === true && BigInt(plan.resume.frais || 0) === 0n,
  'une fois par swap : le V8 paie a6cf, routeur 0 (fraisParHook)');
const sansHook = [sauts[0], sauts[1]];
const planUsdcEth = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte: '0x' + '4'.repeat(40), sauts: sansHook, entree: OUSD, sortie: ETH,
  montant: 100n * 10n ** 6n, decimalesEntree: 6, prixUsdEntree: 1 });
ok(planUsdcEth.etat === 'REFUSE' || (planUsdcEth.resume && BigInt(planUsdcEth.resume.frais) > 0n),
  'TEMOIN : OUSD -> USDC -> ETH (aucun hook payeur) -> le routeur prend son frais ou refuse (' + planUsdcEth.etat + ')');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
