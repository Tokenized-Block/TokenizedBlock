/* test-tirage-carte-20261017.mjs - LA CARTE DU TIRAGE DANS L APP (volet Market) LIT LE SERVEUR ET NE DEVINE RIEN.
 * AFFIRME (lecture de app.html) : (1) la carte #tirCarte est DANS #v-trade, avant « Trending blocks » ; (2) peindreTirage lit /api/tirage,
 *   dit « could not be read » si la lecture echoue, dit la saison blanche (« no prize yet »), et ne montre une progression que pour le
 *   wallet connecte, depuis ses frais VERIFIES (fraisUsd du serveur) ; (3) repeinte a la connexion du wallet ; (4) aucun emoji dans le
 *   titre (mesure 2026-10-17 : 🎟 rendu comme une barre blanche).
 * NE PROUVE PAS : un ticket reel (aucun frais externe a ce jour). Rendu verifie au navigateur (serveur local) le 2026-10-17. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* Phil 2026-10-17 : « mets-le dans l onglet Tokenized » */
const v = app.indexOf('<section class="volet" id="v-tokenx"'), c = app.indexOf('id="tirCarte"'), tb = app.indexOf('id="tkBankCarte"', v);
vu(v > 0 && c > v && c < tb && app.indexOf('id="tirCarte"', c + 1) === -1, 'la carte est dans le volet Tokenized, en tete, et une seule fois');
const f = app.slice(app.indexOf('async function peindreTirage()'), app.indexOf("document.querySelector('.navIn').addEventListener"));
vu(/fetch\('\/api\/tirage'/.test(f) && /could not be read/.test(f), 'lit /api\/tirage, dit l echec');
vu(/t\.mode === 'SHADOW' \? ' · practice season: no prize yet'/.test(f), 'dit la saison blanche');
vu(/Number\(w\.fraisUsd\)/.test(f) && /Connect a wallet to see your progress/.test(f), 'progression = frais verifies du serveur, seulement pour le wallet connecte');
vu(/etape\('wallet_connect_ok'\); \} catch \(_\) \{\}\s*\r?\n\s*try \{ peindreTirage\(\); \} catch/.test(app), 'repeinte a la connexion');
const carte = app.slice(c, tb);
vu(/<p class="titre jeuTitre">Your trades are your ticket\.<\/p>/.test(carte) && !/\u{1F39F}/u.test(carte), 'titre « jeu », sans emoji');
vu(/03 · THE DRAW/.test(carte) && /a future block's hash picks the winner/.test(carte), 'les 3 tuiles disent le hasard verifiable');
console.log('ok tirage-carte - ' + n + ' assertions ; NE PROUVE PAS un ticket reel');
