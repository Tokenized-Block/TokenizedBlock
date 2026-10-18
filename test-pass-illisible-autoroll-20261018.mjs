/* test-pass-illisible-autoroll-20261018.mjs - UN PASS ILLISIBLE N EST PAS « PAS DE PASS », ET L AUTO-ROLL JOUE POUR DE VRAI QUAND LE CONTRAT
 *   EST EN LIGNE (revue adverse 2026-10-18, MOYENS : passes() rate -> roll PAYE envoye a un detenteur de pass ; Auto-roll x5 = PRACTICE sans pass
 *   alors que le contrat facture).
 * AFFIRME : (1) lirePassSur (EXECUTE, noeud simule) : rpc qui jette -> ok:false ; reponse '0x' (illisible) -> ok:false ; deux mots -> ok:true
 *   et le pass ; (2) rollPaye, autoRollLot, passPaye et la commande roll du chat s ARRETENT sur ok:false, AVANT tout plan ; plus aucun
 *   « catch -> pass = null » dans l app ; (3) autoRoll : contrat servi -> autoRollLot, practice SEULEMENT sans contrat ; autoRollLot sans pass =
 *   planRolls (UN approve EXACT de 5 x prix servi + 5 roll), avec pass = planRollsAvecPass ; (4) le bouton Auto-roll dit le prix avant le clic.
 * NE PROUVE PAS : un vrai wallet. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lirePass } from './rolls-jeu.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (debut, fin) => { const i = app.indexOf(debut); assert.ok(i > 0, 'trouve : ' + debut); const j = app.indexOf(fin, i); assert.ok(j > i, 'fin trouvee : ' + fin); return app.slice(i, j); };
/* (1) */
const src = tranche('async function lirePassSur(', '\n}\n') + '\n}\n';
const fab = (rpc) => new Function('rpc', 'lirePass', 'appelPass', src + '\nreturn lirePassSur;')(rpc, lirePass, () => '0x');
const C = '0x' + '0c'.repeat(20), W = '0x' + 'ab'.repeat(20);
vu((await fab(async () => { throw new Error('429'); })(C, W)).ok === false, 'rpc qui jette : ok false (pas « aucun pass »)');
vu((await fab(async () => '0x')(C, W)).ok === false, 'reponse illisible : ok false');
const p = await fab(async () => '0x' + (7).toString(16).padStart(64, '0') + (1792300000).toString(16).padStart(64, '0'))(C, W);
vu(p.ok === true && p.pass.rollsLeft === 7 && p.pass.expiresAt === 1792300000, 'deux mots : le pass lu');
const z = await fab(async () => '0x' + '0'.repeat(128))(C, W);
vu(z.ok === true && z.pass.rollsLeft === 0, 'jamais achete (deux zeros) : lu, pas une panne');
/* (2) */
const rp = tranche('async function rollPaye()', 'async function passPaye()');
const pp = tranche('async function passPaye()', "$('#jourRollPaye').addEventListener");
const lot = tranche('async function autoRollLot(', '/* ── petits outils partages');
const ch = tranche('async function bcCommandeRoll(', 'function bcCommandePostTask(');
for (const [nom, s, plan] of [['rollPaye', rp, 'planRoll'], ['passPaye', pp, 'planPass('], ['autoRollLot', lot, 'planRolls'], ['chat roll', ch, 'planRolls(']]) {
  const iL = s.indexOf('await lirePassSur('), iK = s.indexOf('if (!lp.ok)'), iP = s.indexOf(plan);
  vu(iL > 0 && iK > iL && iP > iK && /if \(!lp\.ok\) \{[^}]*could not be read just now — nothing (was asked|is proposed)[^}]*return; \}/.test(s), nom + ' : pass illisible -> dit et ARRETE, avant tout plan');
}
vu(!/catch \(_\) \{ pass = null; \}/.test(app), 'plus aucun « catch -> pass = null » dans l app');
/* (3) */
const ar = tranche('async function autoRoll()', 'async function autoRollLot(');
vu(/if \(rollsCfg\) \{ await autoRollLot\(c\); return; \}/.test(ar) && ar.indexOf('autoRollLot') < ar.indexOf('await roll()'), 'contrat servi : le lot REEL, avant (et a la place) du practice');
vu(/const n = avecPass \? Math\.min\(5, pass\.rollsLeft\) : 5;/.test(lot)
  && /avecPass \? planRollsAvecPass\(\{ contrat, guesses, pass, passRolls: rollsCfg\.passRolls \}\) : planRolls\(\{ contrat, usdc: USDC_BASE, guesses, rollPrice: BigInt\(rollsCfg\.prixRoll\) \}\)/.test(lot),
  'sans pass : planRolls (5 rolls payes, approve EXACT du total) ; avec pass : planRollsAvecPass');
vu(!/practice/i.test(lot), 'autoRollLot ne parle jamais de practice');
/* (4) */
const pb = tranche('function poserBoutonsRolls(', 'async function envoyerAppels(');
vu(/ba\.textContent = on \? 'Auto-roll ×5 · pass or ' \+ usdcTexte\(BigInt\(rollsCfg\.prixRoll\) \* 5n\) \+ ' USDC' : 'Auto-roll ×5';/.test(pb), 'le bouton Auto-roll dit le prix (servi) avant le clic');
console.log('ok pass-illisible-autoroll - ' + n + ' assertions ; NE PROUVE PAS un vrai wallet');
