/* test-tirage-carte-20261017.mjs - LA CARTE DU TIRAGE DANS L APP (onglet Missions depuis le 2026-10-17 soir) LIT LE SERVEUR ET NE DEVINE RIEN.
 * AFFIRME (lecture de app.html) : (1) la carte #tirCarte est DANS #v-missions, une seule fois ; (2) peindreTirage lit /api/tirage, dit
 *   « could not be read » si la lecture echoue, dit « practice: no prize yet » en mode SHADOW, et ne montre une progression que pour le
 *   wallet connecte, depuis son VOLUME VERIFIE du jour (volumeUsd du serveur) et le seuil du serveur ; (3) repeinte a la connexion du wallet
 *   et a l ouverture de l onglet ; (4) aucun emoji dans le titre (mesure 2026-10-17 : le ticket rendu comme une barre blanche) ;
 *   (5) les tuiles disent la regle v2 : 10 $ de volume par jour, tirages du jour / de la semaine / du mois, hasard rejouable.
 * NE PROUVE PAS : un ticket reel (aucun volume externe a ce jour). Rendu verifie au navigateur (serveur local, 375 px) le 2026-10-17 soir. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* Phil 2026-10-17 soir : « rassemble tout ca dans bridge qui va changer aussi » -> onglet Missions */
const v = app.indexOf('<section class="volet" id="v-missions"'), finV = app.indexOf('</section>', v), c = app.indexOf('id="tirCarte"');
vu(v > 0 && c > v && c < finV && app.indexOf('id="tirCarte"', c + 1) === -1, 'la carte est dans l onglet Missions, une seule fois');
const f = app.slice(app.indexOf('async function peindreTirage()'), app.indexOf("document.querySelector('.navIn').addEventListener"));
vu(/fetch\('\/api\/tirage'/.test(f) && /could not be read/.test(f), 'lit /api\/tirage, dit l echec');
vu(/t\.mode === 'SHADOW' \? ' · practice: no prize yet'/.test(f), 'dit « practice: no prize yet »');
vu(/Number\(w\.volumeUsd\)/.test(f) && /Number\(t\.seuilVolumeUsd\)/.test(f) && /Connect a wallet to see your progress/.test(f),
  'progression = volume verifie du serveur, seuil du serveur, seulement pour le wallet connecte');
vu(/etape\('wallet_connect_ok'\); \} catch \(_\) \{\}\s*\r?\n\s*try \{ peindreTirage\(\); \} catch/.test(app), 'repeinte a la connexion');
vu(/if \(nom === 'missions'\) \{ void peindreTirage\(\); void peindreDernierBlock\(\); void peindreMissions\(\); void peindreEarn\(\); void peindreSkinsJeu\(\); void peindreUnitPools\(\); \}/.test(app), 'repeinte a l ouverture de l onglet Game (tirage + face + missions + earn + skins + UNIT pools)');
const carte = app.slice(c, app.indexOf('</section>', c));
vu(/<p class="titre jeuTitre"[^>]*>Your trades are your ticket\./.test(carte) && !/\u{1F39F}/u.test(carte), 'titre « jeu », sans emoji');
vu(/\$10 of volume in a day \(UTC\)/.test(carte) && /A draw every day, a bigger one when the week closes, the biggest when the month closes/.test(carte)
  && /A future block's hash picks the winners/.test(carte), 'les tuiles disent la regle v2 et le hasard verifiable');
console.log('ok tirage-carte - ' + n + ' assertions ; NE PROUVE PAS un ticket reel');
