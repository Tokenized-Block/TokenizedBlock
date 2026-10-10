/* test-adresse-abregee-20261010.mjs - UNE ADRESSE ABREGEE COLLEE DANS UNE RECHERCHE : ON DEMANDE L ADRESSE ENTIERE, ON NE DEVINE PAS.
 * QA Grok (2026-10-10) : « la recherche mange le 0x » non reproduit ; le message cherchait « b2000…f58b7 » - une adresse ABREGEE, telle
 *   que l app l affiche (court() : debut…fin), copiee puis collee. Reponse d avant : « No block named … », fausse piste.
 * ⛔ PAS DE RESOLUTION PAR DEBUT + FIN : tous les blocks B20 commencent par 0xb200 ; il ne reste que les 4 derniers caracteres
 *   (65 536 valeurs) contre ~15 000 adresses connues - une collision ferait ouvrir, puis acheter, le MAUVAIS block.
 * EXECUTE adresseAbregee (app.html, TB_APP = ancienne) ; epingle son appel dans les deux recherches (Map, panneau) AVANT tout
 *   resolveur.
 * AFFIRME : « 0xb200…3e9e », « b2000…f58b7 », « 0xb2...9e » reconnus ; une adresse entiere, un symbole, un nom ne le sont pas.
 * NE PROUVE PAS : le rendu navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const L = html.split(/\r?\n/);
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const l = L.find((x) => x.startsWith('function adresseAbregee('));
vu(!!l, 'adresseAbregee absente : une adresse abregee collee repond « No block named »');
const adresseAbregee = new Function(l + '; return adresseAbregee;')();
for (const q of ['0xb200…3e9e', 'b2000…f58b7', '0xb2...9e', ' 0xB200 … 3E9E ', '0xb200..3e9e']) vu(adresseAbregee(q) === true, 'non reconnue : ' + JSON.stringify(q));
for (const q of ['0xb200000000000000000000176faf5553c9423e9e', 'TRIOMA', 'Trioma AI', 'NVDAc', '0x', 'b2…', '…3e9e', 'a…b']) vu(adresseAbregee(q) === false, 'reconnue a tort : ' + JSON.stringify(q));
const MSG = 'phraseAdresseAbregee';
vu(html.includes('const ' + MSG + ' ='), 'la phrase n est pas partagee entre les deux recherches');
/* Map : chercherBlock teste l abregee AVANT les habitants */
const iM = html.indexOf('function chercherBlock()');
const corpsM = html.slice(iM, html.indexOf('let h = habitants.find', iM));
vu(/if \(adresseAbregee\(brut\)\) \{ direMap\(phraseAdresseAbregee\); return; \}/.test(corpsM), 'la Map ne dit pas « adresse abregee » avant de chercher');
/* panneau : avant bcResoudre */
const iP = html.indexOf("$('#bcChercheForm').addEventListener('submit'");
const corpsP = html.slice(iP, html.indexOf('let j = bcResoudre(v);', iP));
vu(/if \(adresseAbregee\(v\)\) \{ note\.textContent = phraseAdresseAbregee; return; \}/.test(corpsP), 'le panneau ne dit pas « adresse abregee » avant de resoudre');
console.log('ok adresse-abregee - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
