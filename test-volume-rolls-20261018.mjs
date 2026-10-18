/* test-volume-rolls-20261018.mjs - CE QU UN JOUEUR DEPENSE DANS BLOCKROLLS COMPTE DANS LES 10 $ DU TICKET.
 * AFFIRME : (1) un roll PAYE compte toPot + toDev ; un roll SUR PASS compte 0 (le pass est compte a l achat) ; (2) PassBought compte `paid` ;
 *   (3) plusieurs rolls d une meme tx et d un meme joueur = UN total (crediter deduplique par hash) ; (4) un log d un autre contrat, un topic
 *   inconnu, une donnee de mauvaise taille : ignores ; (5) cablage serveur : depensesJeu sur les logs du contrat de la FICHE, joueurs internes
 *   exclus, credit en USD = brut / 1e6 dans revenu.jours, scan incremental borne. MUTANT (roll sur pass compte) rougit (prouve par le cas 1).
 * NE PROUVE PAS : un roll reel (aucun au 2026-10-18 14:30). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { depensesJeu, TOPIC_ROLLED, TOPIC_PASS } from './volume-rolls.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const C = '0x0c5b490196f06db40ab8af68ecb2313029460fe9', J = '0x' + 'ab'.repeat(20), K = '0x' + 'cd'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), t = (a) => '0x' + a.slice(2).padStart(64, '0');
const H1 = '0x' + '11'.repeat(32), H2 = '0x' + '22'.repeat(32);
const rolled = (h, joueur, pass, pot, dev) => ({ address: C, transactionHash: h, topics: [TOPIC_ROLLED, '0x' + w(1), t(joueur)], data: '0x' + [0, 1, 2, 3, 4, 1000, pass ? 1 : 0, pot, dev].map(w).join('') });
const pass = (h, joueur, paid) => ({ address: C, transactionHash: h, topics: [TOPIC_PASS, t(joueur), '0x' + w(20380)], data: '0x' + [30, 1792300000, paid, 5000000].map(w).join('') });
/* (1)(3) */
const r = depensesJeu([rolled(H1, J, false, 250000, 250000), rolled(H1, J, false, 250000, 250000), rolled(H1, J, true, 0, 0)], C);
vu(r.length === 1 && r[0].joueur === J && r[0].brut === 1000000n && r[0].tx === H1, '2 rolls payes d une tx = 1,00 USDC ; le roll sur pass = 0');
/* (2) */
const p = depensesJeu([pass(H2, K, 10000000)], C);
vu(p.length === 1 && p[0].joueur === K && p[0].brut === 10000000n, 'un pass = 10 USDC de depense');
/* (4) */
vu(depensesJeu([{ ...rolled(H1, J, false, 250000, 250000), address: '0x' + '99'.repeat(20) }], C).length === 0, 'un autre contrat : ignore');
vu(depensesJeu([{ ...pass(H2, K, 10000000), topics: ['0x' + '00'.repeat(32), t(K)] }], C).length === 0, 'topic inconnu : ignore');
vu(depensesJeu([{ ...pass(H2, K, 10000000), data: '0x' + w(1) }], C).length === 0, 'donnee de mauvaise taille : ignoree');
vu(depensesJeu([rolled(H1, J, true, 0, 0)], C).length === 0, 'que des rolls sur pass : rien a crediter');
/* (5) */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const f0 = srv.indexOf('async function crediterVolumeRolls()'), f1 = srv.indexOf('setInterval(() => { void crediterVolumeRolls(); }');
vu(f0 > 0 && f1 > f0, 'crediterVolumeRolls et son minuteur existent');
const f = srv.slice(f0, f1);
vu(/BLOCKROLLS_DEPLOIEMENT\.adresse/.test(f) && /depensesJeu\(logs, contrat\)/.test(f) && /!internes\.has\(d\.joueur\)/.test(f) && /usd: Number\(d\.brut\) \/ 1e6/.test(f), 'logs du contrat de la fiche, internes exclus, USD = brut / 1e6');
vu(/revenu\.jours = crediter\(revenu\.jours \|\| \{\}, \{ saison: jourDe\(Date\.now\(\)\)\.id, payeur: d\.joueur, hash: d\.tx, usd/.test(f), 'credite le jour courant dans revenu.jours (deduplique par hash)');
vu(/Math\.min\(tete, de \+ 1999\)/.test(f) && /revenu\.rollsScan = /.test(f), 'scan incremental par fenetres de 2 000 blocs, curseur persiste');
console.log('ok volume-rolls - ' + n + ' assertions ; NE PROUVE PAS un roll reel');
