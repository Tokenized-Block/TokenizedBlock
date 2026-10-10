/* test-decouverte-profondeur-20261010.mjs - LA DECOUVERTE DES POOLS DU LIVE NE COMMENCE PAS AU-DELA DU BORD D ARCHIVE MESURE.
 * MESURE 2026-10-10 : publicnode sert -9 500 / -9 900, refuse -10 040 / -10 100 (et -10 000 le 09-30). DECOUVERTE_INITIALE
 * valait 10 000 : la 1re fenetre etait refusee, decouverteJusqua n avancait jamais, une lecture refusee de plus toutes les 20 s.
 * AFFIRME : la constante LIVREE (lue dans app.html, TB_APP pour l ancienne) <= 9 500, et le regulateur admet publicnode pour
 * la 1re fenetre (marge de 500 blocs de derive de tete). NE PROUVE PAS : que le bord de publicnode ne bougera pas.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { noeudPeutServir } from './regulateur-rpc.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const m = html.match(/const DECOUVERTE_INITIALE = (\d+);/);
assert.ok(m, 'constante introuvable');
const D = Number(m[1]), BORD_SERVI_MESURE = 9500, tete = 52418980;
assert.ok(D <= BORD_SERVI_MESURE, 'DECOUVERTE_INITIALE = ' + D + ' depasse le bord servi mesure (' + BORD_SERVI_MESURE + ')');
assert.ok(D >= 2000, 'decouverte reduite a moins d une fenetre : ' + D);
const f = [{ address: '0x498581ff718922c3f8e6a244956af099b2652b2b', fromBlock: '0x' + (tete - D).toString(16), toBlock: '0x' + (tete - D + 1999).toString(16) }];
assert.equal(noeudPeutServir('https://base-rpc.publicnode.com', 'eth_getLogs', f, tete + 500), true, 'publicnode exclu apres 500 blocs de derive');
console.log('ok decouverte-profondeur - DECOUVERTE_INITIALE ' + D + ' <= ' + BORD_SERVI_MESURE + ' ; NE PROUVE PAS que le bord de publicnode reste la');