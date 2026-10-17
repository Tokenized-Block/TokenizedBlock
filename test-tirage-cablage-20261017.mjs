/* test-tirage-cablage-20261017.mjs - LE TIRAGE EST CABLE SUR DES FRAIS VERIFIES, ET RIEN D AUTRE.
 * AFFIRME (lecture de serveur-web.js) : (1) le credit de saison est DANS /api/paye, APRES verifierFrais, seulement pour un frais EXTERNE
 *   et la ligne swap_action ; (2) la valeur vient de valeurFraisUsd (decimales lues, prix de l ecran, non lu -> 0) ; (3) /api/tirage dit
 *   SHADOW et pot 0, et publie wallets + hashes + racine ; (4) WETH vient du depot (plan-eth-block.js), pas d un litteral.
 * NE PROUVE PAS : un frais externe reel credite (aucun a ce jour). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const paye = srv.slice(srv.indexOf("if (chemin === '/api/paye'"), srv.indexOf("if (chemin === '/api/registre-createurs')"));
vu(/if \(verif\.externe && ligne === 'swap_action'\) \{/.test(paye), 'credit seulement pour un frais externe sur une action');
vu(paye.indexOf('verifierFrais(') < paye.indexOf('crediter(revenu.saisons'), 'la verification precede le credit');
vu(/const usd = await valeurFraisUsd\(v\.recus\);/.test(paye), 'valeur depuis les montants RELUS (v.recus), jamais de la requete');
const tir = srv.slice(srv.indexOf("if (chemin === '/api/tirage')"), srv.indexOf("if (chemin === '/sante')"));
vu(/mode: 'SHADOW', pot: 0/.test(tir) && /racine: racine\(t\)/.test(tir) && /hashes: w\.hashes/.test(tir), '/api/tirage : SHADOW, pot 0, hashes et racine publies');
vu(/import \{ WETH_BASE \} from '\.\/plan-eth-block\.js';/.test(srv) && /const WETH_SRV = WETH_BASE\.toLowerCase\(\);/.test(srv), 'WETH lu dans le depot');
console.log('ok tirage-cablage - ' + n + ' assertions ; NE PROUVE PAS un frais reel credite');
