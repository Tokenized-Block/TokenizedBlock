/* test-signaler-paye-20261016.mjs - CHAQUE ACHAT CONFIRME POSTE SON HASH AU COMPTEUR DE REVENU.
 * AFFIRME (lecture du fichier servi) : (1) chaque `etape('achat_ok')` est suivi, a 3 lignes au plus, d un signalerPaye(…, 'hook_block') ;
 *   (2) bcSigner poste chaque hash confirme quand une ligne est donnee, et l envoi sans frais passe null ; (3) les lignes postees
 *   existent dans LIGNES_FRAIS du serveur ; (4) signalerPaye n envoie que le hash et la ligne (aucun montant, aucune adresse).
 * NE PROUVE PAS : qu un wallet reel confirme, ni que le serveur lise le recu (voir test-revenu-externe et le commit de la route). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { LIGNES_FRAIS } from './revenu-externe.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const L = readFileSync(new URL('./app.html', import.meta.url), 'utf8').split('\n');
const points = L.map((l, i) => (l.includes("etape('achat_ok')") ? i : -1)).filter((i) => i >= 0);
vu(points.length === 4, '4 points achat_ok attendus (' + points.length + ')');
for (const i of points) vu(L.slice(i, i + 3).join('\n').includes("signalerPaye("), 'achat_ok ligne ' + (i + 1) + ' sans signalerPaye a moins de 3 lignes');
const src = L.join('\n');
const corps = src.slice(src.indexOf('async function bcSigner(m, appels, ligne'), src.indexOf('async function bcPeutGrouper'));
vu(corps.length > 100 && /if \(ligne\) signalerPaye\(r\.hash, ligne\)/.test(corps), 'bcSigner poste le hash confirme quand une ligne est donnee');
vu(/bcSigner\(m, \[appel\], null\)/.test(src), 'l envoi sans frais passe null (aucune lecture pour rien)');
const lignes = [...src.matchAll(/signalerPaye\([^,]+, '([a-z_]+)'\)|bcSigner(?:Banque)?\([^)]*'([a-z_]+)'\)/g)].map((m) => m[1] || m[2]);
vu(lignes.length >= 8, 'au moins 8 appels nommes (' + lignes.length + ')');
for (const l of new Set(lignes)) vu(LIGNES_FRAIS.includes(l), 'ligne inconnue du serveur : ' + l);
const f = src.slice(src.indexOf('function signalerPaye('), src.indexOf('function allerA('));
vu(/'\/api\/paye\?h=' \+ encodeURIComponent\(hash\) \+ '&l=' \+ encodeURIComponent\(ligne \|\| 'autre'\) \+ \(INTERNE \? '&i=1' : ''\)/.test(f) && !/compte|montant|amount/i.test(f.replace(/\/\*[\s\S]*?\*\//g, '')), 'signalerPaye : hash + ligne + drapeau interne, rien d autre');
console.log('ok signaler-paye - ' + n + ' assertions ; NE PROUVE PAS un wallet reel');
