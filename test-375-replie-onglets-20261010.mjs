/* test-375-replie-onglets-20261010.mjs - A 375 PX : LA RANGEE REPLIEE DIT 'Agent off' ET L ONGLET 'Tokenized' N EST PAS COUPE.
 * MESURE (Chrome headless 375x812 et 360x812, app.html servie en file://, panneau pose sous <body> et --bcPopH/--bcNav mesures comme
 *   bcPoserTaille) - AVANT : rangee repliee 'Agent: not connected' coupe en ellipse ; 9 onglets = 373 px pour 355, Tokenized 324-383.
 *   APRES : 'Agent off', non coupe ; 355/355 (375 px) et 340/340 (360 px), Tokenized 310-365 / 295-350, 55 px sans debordement.
 *   La feuille ne couvrait deja RIEN (avant comme apres : padding-bottom = --bcPopH mesure + barre + 24 ; fin du contenu au-dessus).
 * CE BANC lit le TEXTE d app.html (ordre de la cascade compris) ; NE PROUVE PAS le rendu d un vrai telephone (polices, zone sure).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tel = html.indexOf('@media (max-width:760px){\n  body.bcOuvert{padding-bottom:calc(var(--bcPopH');
assert.ok(tel > 0, 'bloc telephone introuvable');
const bloc = html.slice(tel, html.indexOf('\n}\n', tel));
assert.match(bloc, /body\.bcOuvert\{padding-bottom:calc\(var\(--bcPopH,62dvh\) \+ var\(--bcNav,66px\) \+ 24px\)\}/, 'la place mesuree sous la feuille a disparu');
assert.match(bloc, /dialog\.bcPop\.bcReduit #bcAgent::after\{content:'Agent off'/, "rangee repliee : 'Agent off' absent");
assert.match(bloc, /dialog\.bcPop\.bcReduit #bcAgent\{font-size:0/, 'la phrase longue reste affichee (coupee)');
const fin = html.indexOf('</style>', html.indexOf('.navB{font-size:10.5px}'));
const nav = html.slice(html.indexOf('.navB{font-size:10.5px}'), fin);
assert.match(nav, /@media \(max-width:420px\)\{\.navIn\{gap:0;overflow-x:auto/, 'onglets : ni gouttiere retiree ni defilement - Tokenized coupe');
assert.match(nav, /\.navB\{padding-left:1px;padding-right:1px\}/, 'onglets : marges laterales intactes');
console.log("ok 375-replie-onglets - 'Agent off', onglets sans coupe, place sous la feuille gardee ; NE PROUVE PAS un vrai telephone");