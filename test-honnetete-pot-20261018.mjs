/* test-honnetete-pot-20261018.mjs - CE QUE L ECRAN DIT DU POT ET DES PRIX EST VRAI (revue adverse 2026-10-18 : pot a 0 jamais dit avant de
 *   signer, rolls de pass payes par ce pot vide, score gagnant a pot vide dit « sous le minimum », « practice, no prize yet » alors que le
 *   contrat facture, /api/tirage sans le palier 2/5 et sans le pot lu, regle du ticket muette sur les depenses de jeu).
 * AFFIRME : (1) pur : motSettle (GAGNE / POT_VIDE / SOUS_MIN) et plafondPot (COUVRE / PLAFONNE / NON_LU) ; (2) app : rollPaye, autoRollLot et
 *   la commande roll lisent pot() et disent phrasePot AVANT la signature ; passPaye dit que les gains des rolls de pass sortent du pot des
 *   rolls et ce qu il tient ; les fins de settle passent par phraseSettle (« pot was empty »), plus « no prize this time (min » en dur ;
 *   (3) les textes : la tuile ROLLS ne dit plus « Practice: no prize yet », la tuile TICKET et la regle serveur comptent rolls payes et day pass ;
 *   (4) serveur : rolls.prizes = les 4 paliers de la fiche (prize2 compris), rolls.pot = pot() lu sur la chaine (null tant que pas lu).
 * NE PROUVE PAS : un pot reel. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { motSettle, plafondPot } from './rolls-en-attente.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
/* (1) */
vu(motSettle({ score: 3, payout: 1000000n, minScore: 2 }) === 'GAGNE' && motSettle({ score: 3, payout: 0n, minScore: 2 }) === 'POT_VIDE' && motSettle({ score: 1, payout: 0n, minScore: 2 }) === 'SOUS_MIN', 'motSettle : gagne / pot vide / sous le minimum');
vu(motSettle({ score: 2, payout: 0n, minScore: 3 }) === 'SOUS_MIN', 'sous le minimum des regles du roll : SOUS_MIN, pas POT_VIDE');
vu(plafondPot(0n, 5000000n).etat === 'PLAFONNE' && plafondPot(2000000n, 5000000n).etat === 'PLAFONNE' && plafondPot(5000000n, 5000000n).etat === 'COUVRE' && plafondPot(null, 5000000n).etat === 'NON_LU', 'plafondPot : pot vide ou sous le gros prix = PLAFONNE ; illisible = NON_LU');
/* (2) */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (debut, fin) => { const i = app.indexOf(debut); assert.ok(i > 0, 'trouve : ' + debut); const j = app.indexOf(fin, i); assert.ok(j > i, 'fin trouvee : ' + fin); return app.slice(i, j); };
const rp = tranche('async function rollPaye()', 'async function passPaye()');
const pp = tranche('async function passPaye()', "$('#jourRollPaye').addEventListener");
const lot = tranche('async function autoRollLot(', '/* ── petits outils partages');
const ch = tranche('async function bcCommandeRoll(', 'function bcCommandePostTask(');
for (const [nom, s] of [['rollPaye', rp], ['autoRollLot', lot], ['chat roll', ch]]) {
  const iPot = s.indexOf('await lirePotRolls(contrat)'), iPh = s.indexOf('phrasePot(pot)'), iEnv = Math.max(s.indexOf('envoyerAppels(plan.appels'), s.indexOf('bcBoutons('));
  vu(iPot > 0 && iPh > iPot && iEnv > iPh, nom + ' : pot() lu et dit AVANT la signature');
}
vu(/pass-roll win is paid from the roll pot/.test(pp) && /await lirePotRolls\(contrat\)/.test(pp) && pp.indexOf('lirePotRolls') < pp.indexOf('envoyerAppels('), 'passPaye : le pot des rolls (qui paie les rolls de pass) est lu et dit avant');
const outils = tranche('/* ── petits outils partages', '/* ══ LE REGLEUR DES ROLLS EN ATTENTE');
vu(/' The pot holds ' \+ usdcTexte\(p\.pot\) \+ ' USDC: a win pays at most ' \+ usdcTexte\(p\.pot\) \+ ' USDC\.'/.test(outils), 'phrasePot : « the pot holds X USDC: a win pays at most X »');
vu(/k === 'POT_VIDE' \? 'a winning score, but the pot was empty: nothing paid'/.test(outils), 'phraseSettle : score gagnant a pot vide = « pot was empty »');
vu(/phraseSettle\(st\)/.test(rp) && !/no prize this time \(min/.test(rp + lot), 'les fins de settle passent par phraseSettle');
/* (3) */
const regle = tranche('<div class="carte" id="regleCarte">', '</details>');
vu(!/03 · ROLLS<\/b><p[^>]*>[^<]*Practice: no prize yet/.test(regle) && /never more than the pot holds/.test(regle), 'tuile ROLLS : plus « Practice: no prize yet », le plafond du pot est dit');
vu(/paid rolls and the day pass all count/.test(regle), 'tuile TICKET : rolls payes et day pass comptent dans les 10 $');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
vu(/what you spend in BlockRolls \(paid rolls and the day pass/.test(srv), 'regle servie : la depense BlockRolls compte');
/* (4) */
vu(/prizes: \[rc\.prize5, rc\.prize4, rc\.prize3, rc\.prize2\]\.map\(String\)/.test(srv), '/api/tirage : 4 paliers, prize2 compris');
vu(/pot: contratRolls && potRollsSrv\.brut !== null \? potRollsSrv\.brut : null/.test(srv) && /lireUintRolls\(await rpcRails\('eth_call', \[\{ to: contrat, data: appelPotRolls\(\) \}, 'latest'\]\)\)/.test(srv), '/api/tirage : rolls.pot = pot() lu sur la chaine, null tant que pas lu');
console.log('ok honnetete-pot - ' + n + ' assertions ; NE PROUVE PAS un pot reel');
