/* test-tirage-cablage-20261017.mjs - LE TIRAGE (v2 QUOTIDIEN, 2026-10-17 soir) EST CABLE SUR UN VOLUME VERIFIE, ET RIEN D AUTRE.
 * AFFIRME (lecture de serveur-web.js) : (1) le credit est DANS /api/paye, AVANT la sortie sur frais non verifiable (un frais en ETH natif
 *   n a pas de log : sans ca, aucun trade UNIT ne compterait) ; (2) seules les lignes hook_block et swap_action creditent ; les actions
 *   ne comptent que si NOTRE frais est arrive (v.ok) ; le volume vient de volumeVerifie (recu relu) et la valeur de valeurFraisUsd ou du
 *   prix ETH de l ecran ; externes seulement ; un hash ne compte qu UNE fois tous jours confondus (volVus) ; (3) /api/tirage dit SHADOW
 *   et pot 0, publie wallets + hashes + racines du jour, de la semaine et du mois ; (4) WETH vient du depot, pas d un litteral ;
 *   (5) UNIT et sa pool : constantes nommees, l id de pool recalcule par poolIdDe (verifie contre Base dans test-volume-tirage).
 * NE PROUVE PAS : un volume externe reel credite (aucun a ce jour). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const paye = srv.slice(srv.indexOf("if (chemin === '/api/paye'"), srv.indexOf("if (chemin === '/api/registre-createurs')"));
const iCredit = paye.indexOf('await crediterVolumeJour('), iVerif = paye.indexOf('verifierFrais('), iSortie = paye.indexOf('if (!v.ok) {');
vu(iVerif > 0 && iCredit > iVerif && iCredit < iSortie, 'credit APRES verifierFrais et AVANT la sortie sur frais non verifiable');
const fn = srv.slice(srv.indexOf('async function crediterVolumeJour('), srv.indexOf('async function crediterVolumeJour(') + 1400);
vu(/if \(ligne !== 'hook_block' && ligne !== 'swap_action'\) return;/.test(fn), 'seules hook_block et swap_action creditent');
vu(/jetonsActions: v\.ok \? JETONS_ACTIONS : new Set\(\)/.test(fn), 'les actions ne comptent que si notre frais est arrive');
vu(/volumeVerifie\(\{ tx, recu,/.test(fn) && /internes\.has\(vol\.payeur\)\) return;/.test(fn), 'volume relu dans le recu ; internes exclus');
vu(/if \(revenu\.volVus\[h\]\) return;/.test(fn) && /revenu\.volVus\[h\] = 1;/.test(fn), 'un hash ne compte qu une fois, tous jours confondus');
vu(/valeurFraisUsd\(vol\.actions/.test(fn) && /prixUsdPourPlan\(null\)/.test(fn), 'valeur : prix et decimales du serveur, ETH par son prix d ecran');
const tir = srv.slice(srv.indexOf("if (chemin === '/api/tirage')"), srv.indexOf("if (chemin === '/sante')"));
vu(/mode: 'SHADOW', pot: 0/.test(tir) && /racine: racine\(tJ\)/.test(tir) && /hashes: w\.hashes/.test(tir) && /semaine: \{/.test(tir) && /mois: \{/.test(tir),
  '/api/tirage : SHADOW, pot 0, hashes, racines jour / semaine / mois');
vu(/import \{ WETH_BASE \} from '\.\/plan-eth-block\.js';/.test(srv) && /const WETH_SRV = WETH_BASE\.toLowerCase\(\);/.test(srv), 'WETH lu dans le depot');
vu(/const POOLS_UNIT_TB = new Set\(\[poolIdDe\(\{ currency0: '0x' \+ '0'\.repeat\(40\), currency1: UNIT_BLOCK, fee: 0, tickSpacing: 200, hooks: HOOK_7030 \}\)\]\);/.test(srv),
  'la pool UNIT : recalculee depuis sa cle (hook 7030), jamais un id recopie');
console.log('ok tirage-cablage - ' + n + ' assertions ; NE PROUVE PAS un volume reel credite');
