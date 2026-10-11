/* test-mes-blocks-peints-au-fil-de-l-eau.mjs — OUVRIR LE WALLET NE RELANCE PLUS LE BALAYAGE LOURD DE LA MAQUETTE.
 *
 * HISTOIRE. Le 2026-10-01 (Raksha, wallet neuf et vide), la liste « My block » de la maquette TokenizedBank restait > 20 s sur
 *   « Reading My blocks… » ; mesure du Grok Bot (prod, wallet simule vide) : 72,6 s, 345 eth_getTransactionByHash + 427 eth_getLogs.
 *   Cause : peindreTokenizedBank attendait en serie mesCreations() puis mesFrappes(). Ce test executait alors la fonction et gardait une
 *   peinture au fil de l eau (7 cas).
 * 2026-10-11 : la maquette est RETIREE (decision de Phil) avec sa liste - et avec elle ce balayage, relance a CHAQUE ouverture du Wallet.
 *   La carte TokenizedBank lit desormais les actions du wallet en UN lot serveur (/api/avoirs, bcBanqueLireAvoirs) et les positions
 *   (/api/banque/positions).
 * CE TEST GARDE : ouvrir l onglet Wallet ou connecter un wallet n appelle plus peindreTokenizedBank ; tbBanquePeindre ne lance aucun des
 *   deux balayages lourds ; elle passe par la lecture en lot. NE PROUVE PAS : le temps reel (mesure au navigateur, a part).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const sansC = html.replace(/\/\*[\s\S]*?\*\//g, ' ');
let n = 0;
const v = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
v(!/peindreTokenizedBank\(/.test(sansC), 'peindreTokenizedBank est de nouveau appelee (le balayage lourd a chaque ouverture du Wallet)');
v(/if \(nom === 'wallet'\) void tbBanquePeindre\(\);/.test(html), 'l onglet Wallet ne peint plus la carte TokenizedBank (ou peint autre chose)');
const peindre = fonction('async function tbBanquePeindre() {');
v(!/mesCreations\(|mesFrappes\(|eth_getLogs/.test(peindre), 'la carte TokenizedBank relance un balayage de la chaine');
v(/await bcBanqueDonneesPourToi\(\)/.test(peindre) && /fetch\('\/api\/avoirs\?compte=' \+ c/.test(fonction('async function bcBanqueLireAvoirs(c) {')), 'la carte ne lit plus les avoirs en un lot serveur');
console.log('ok mes-blocks-peints-au-fil-de-l-eau - ' + n + ' assertions : le Wallet ne relance plus le balayage de la maquette ; NE PROUVE PAS le temps reel');
