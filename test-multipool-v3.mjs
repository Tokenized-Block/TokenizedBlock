/* test-multipool-v3.mjs — LES BRANCHES UNISWAP V3 DE multipool.js, JUGEES SUR LES OCTETS.
 *
 * ⛔⛔ POINT D AUDIT 4(b), 2026-10-02. Une campagne de mutations a montre que QUATRE alterations de la jambe V3
 *   passaient TOUS les bancs (test-multipool.mjs, test-un-frais-par-jambe-route-mixte.mjs) :
 *     1. devis V3 avec fee = 0          — le quoter cote une AUTRE pool (ou aucune) ;
 *     2. devis V3 aux jetons inverses   — on cote le sens oppose, le montant affiche est faux ;
 *     3. segments V3 et Aerodrome fusionnes — un saut V3 partirait vers le mauvais routeur ;
 *     4. arete V3 admise sans fee        — une route inconstructible entre dans le graphe.
 *   Ce banc decode le calldata produit au lieu de croire un resume. Chaque assertion a ete vue ROUGE sur son mutant.
 * ⚠️ NE PROUVE PAS une execution : multipool.js n est pas cable a l ecran, et le banc fork reste a part. */
import * as mp from './multipool.js';
import { selecteur } from './pool.js'; /* le MEME helper que multipool.js (rend 8 hex sans 0x) */

let n = 0, ko = 0;
const ok = (c, m, vu) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu))); } };
const { ADRESSES, devisSaut, segments, areteValide, cheminV3 } = mp;
const mots = (data) => { const h = String(data).slice(10); const r = []; for (let i = 0; i < h.length; i += 64) r.push(h.slice(i, i + 64)); return r; };
const adrDe = (w) => '0x' + w.slice(24);

const USDC = ADRESSES.USDC, WETH = ADRESSES.WETH, ETH = ADRESSES.ETH;
const TOSHI = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4';
const v3 = { venue: 'uniswap-v3', pool: '0x4b0aaf3ebb163dd45f663b38b6d93f6093ebc2d3', fee: 10000, token0: WETH, token1: TOSHI };
const cl = { venue: 'aerodrome-cl', pool: '0x' + '5'.repeat(40), factory: 2, tickSpacing: 100, token0: WETH, token1: USDC };

/* ── 1 et 2 : le devis V3, mot par mot ── */
const d = devisSaut({ de: ETH, vers: TOSHI, e: v3 }, 10n ** 15n);
const w = mots(d.data);
ok(d.to.toLowerCase() === String(ADRESSES.QUOTEUR_V3).toLowerCase(), 'devis V3 adresse le QUOTEUR V3');
ok(d.data.slice(2, 10) === selecteur('quoteExactInputSingle((address,address,uint256,uint24,uint160))'), 'selecteur quoteExactInputSingle V3 (uint24 fee)');
ok(adrDe(w[0]).toLowerCase() === WETH.toLowerCase(), 'mot 0 = jeton d ENTREE (ETH -> WETH pour V3)', adrDe(w[0]));
ok(adrDe(w[1]).toLowerCase() === TOSHI.toLowerCase(), 'mot 1 = jeton de SORTIE', adrDe(w[1]));
ok(BigInt('0x' + w[2]) === 10n ** 15n, 'mot 2 = le montant');
ok(BigInt('0x' + w[3]) === 10000n, 'mot 3 = le fee de L ARETE (10000), jamais 0', BigInt('0x' + w[3]).toString());
ok(BigInt('0x' + w[4]) === 0n, 'mot 4 = sqrtPriceLimit 0');
const dInv = devisSaut({ de: TOSHI, vers: ETH, e: v3 }, 5n);
ok(adrDe(mots(dInv.data)[0]).toLowerCase() === TOSHI.toLowerCase() && adrDe(mots(dInv.data)[1]).toLowerCase() === WETH.toLowerCase(),
  'TEMOIN sens inverse : TOSHI -> ETH cote TOSHI puis WETH');

/* ── 3 : V3 et Aerodrome ne partagent JAMAIS un segment ── */
const chemin = [{ de: USDC, vers: ETH, e: cl }, { de: ETH, vers: TOSHI, e: v3 }];
const segs = segments(chemin, -1);
ok(segs.length === 2 && segs[0].type === 'cl2' && segs[1].type === 'uni', 'CL puis V3 : DEUX segments (cl2, uni)', segs.map((s) => s.type));
const deuxV3 = segments([{ de: USDC, vers: ETH, e: { ...v3, token0: WETH, token1: USDC, fee: 500 } }, { de: ETH, vers: TOSHI, e: v3 }], -1);
ok(deuxV3.length === 1 && deuxV3[0].type === 'uni', 'TEMOIN deux sauts V3 contigus : UN segment', deuxV3.map((s) => s.type));

/* ── 4 : une arete V3 sans fee entier n entre pas dans le graphe ── */
ok(areteValide(v3) === true, 'arete V3 complete : valide');
ok(areteValide({ ...v3, fee: undefined }) === false, 'arete V3 SANS fee : refusee');
ok(areteValide({ ...v3, fee: 'abc' }) === false, 'arete V3 fee illisible : refusee');

/* ── et le path V3 porte le fee (deja garde par test-multipool : temoin de coherence) ── */
ok(cheminV3([{ de: ETH, vers: TOSHI, e: v3 }]).toLowerCase() === WETH.slice(2).toLowerCase() + '002710' + TOSHI.slice(2).toLowerCase(),
  'path V3 : WETH | 0x002710 (10000) | TOSHI');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
