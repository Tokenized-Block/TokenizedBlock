/* test-game-boutons-20261018.mjs - LES BOUTONS DE LA CARTE DRAWS SONT CEUX QUI FONT UN GESTE REEL AUJOURD HUI (Phil, 2026-10-18 00:05 :
 * « garde les boutons qui ont du sens avec ce qu on a fait aujourd hui » ; 00:40 : « retire le guest »).
 * AFFIRME (lecture de app.html) : (1) #tirCarte porte EXACTEMENT 4 boutons : jourRoll, jourUnit, jourActions, jourSkin ; (2) aucun n est
 *   `disabled` et aucun ne parle d un contrat a venir (« Day pass », « once their contract ») ; (3) le mot « guest » n apparait dans aucun texte
 *   servi de la carte ni dans roll() ; (4) roll() sans wallet lit quand meme le bloc N+2 (eth_getBlockByNumber) et ne redirige pas au Wallet ;
 *   (5) #jourSkin ouvre le panneau de UNIT (choisirBrain + bcOuvrirPop) ; (6) la carte Skin market et la carte UNIT pools existent, une fois.
 * NE PROUVE PAS : le rendu ni un roll reel (verifie au navigateur, serveur local, 2026-10-18 00:50 : « Block 52,742,116 drew this face »). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const c0 = app.indexOf('id="tirCarte"'), c1 = app.indexOf('id="missionsCarte"');
vu(c0 > 0 && c1 > c0, 'la carte Draws precede la carte Missions');
/* ce qui est SERVI au visiteur : les commentaires HTML (qui racontent pourquoi) sont otes avant de juger les textes */
const carte = app.slice(c0, c1).replace(/<!--[\s\S]*?-->/g, '');
const ids = [...carte.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
vu(JSON.stringify(ids) === JSON.stringify(['jourRoll', 'jourUnit', 'jourActions', 'jourSkin', 'jourAuto']), 'exactement 4 boutons visibles + Auto-roll (lus : ' + ids.join(', ') + ')');
vu(/<button[^>]*\bid="jourAuto"[^>]*\bhidden\b/.test(carte) && /\$\('#jourAuto'\)\.hidden = !c|ba\.hidden = !c/.test(app), 'Auto-roll est cache sans wallet (pas de score sans ticket)');
vu(!/<button[^>]*\bdisabled\b/.test(carte), 'aucun bouton desactive dans la carte Draws');
vu(!/Day pass|once their contract|jourPass/i.test(carte), 'aucune promesse de contrat a venir dans la carte');
const r0 = app.indexOf('async function roll()'), r1 = app.indexOf('const rollDerniers = []');
vu(r0 > 0 && r1 > r0, 'roll() present');
const roll = app.slice(r0, r1);
/* le CODE, pas les commentaires qui racontent le retrait : l identite invitee (identiteJeu / CLE_INVITE / 'guest:') n existe plus */
vu(!/identiteJeu\(|CLE_INVITE|'guest:/.test(app) && !/guest/i.test(carte), 'pas de ticket invite (code ni carte)');
vu(/eth_getBlockByNumber/.test(roll) && !/allerA\('wallet'\)/.test(roll), 'sans wallet, roll() lit le bloc N+2 et ne redirige pas au Wallet');
vu(/Connect a wallet: your ticket scores against the next roll\./.test(roll), 'sans wallet : le score demande un wallet, dit');
vu(/\$\('#jourSkin'\)\.addEventListener\('click', \(\) => \{ try \{ choisirBrain\(UNIT_APP\); \} catch \(_\) \{\} try \{ bcOuvrirPop\(\{ vue: 'brain'/.test(app), 'Skin ouvre le panneau de UNIT, vue Skin');
for (const id of ['skinCarte', 'unitCarte', 'earnCarte']) vu(app.split('id="' + id + '"').length === 2, 'carte ' + id + ' presente une fois');
console.log('ok game-boutons - ' + n + ' assertions ; NE PROUVE PAS le rendu');
