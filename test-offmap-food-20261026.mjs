// test-offmap-food-20261026 — game57 #4b (a): "too many 'not read'" in the brain view.
//   MEASURED (UNIT, Base mainnet, 2026-10-26, c2b8e92): Transfers / Messages / Holders / Creator showed "not read yet" although the
//   SAME page had read that food (profile "Who holds it": nourritureDe(adr) -> profilNourriture with etat 'LUE'). UNIT is not on the
//   map: battreProfil took food from the map habitant (hP) only, so for an off-map block the read was thrown away and the brain got 0
//   "by default"; visionCible('profil') also said "default" because there was no habitant.
//   A. page-brains.js#heldFood: the habitant's successful read, else a successful off-map read of the SAME address;
//      never another address, never a failed read shown as read.
//   B. battreProfil + visionCible extracted: UNIT off the map, profile food read -> the brain receives gm/messages/detenteurs/mort
//      as read, and champ() shows them read (no "not read"); food that was NOT read stays "not read yet" (nothing invented).
//   C. Live (offMapFacts) uses the same read; Brain already had its own (brainNourriture, test-brain-marche-hors-carte).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { etatInitial as initialBrain, pas as step } from './cerveau.js';
import { champ } from './vision-cerveau.js';
import * as CP from './page-brains.js';
const DIR = new URL('./', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const app = read('app.html');
const extract = (header, required = true) => { const i = app.indexOf(header); if (required) ok(i > 0, 'extraction found: ' + header); if (i < 0) return null; const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27', OTHER = '0x' + 'c3'.repeat(20);
const READ = { etat: 'LUE', gm: 7, messages: 1, detenteurs: 4, mort: false };

/* B */
const srcProfile = extract('function battreProfil() {');
const srcVision = extract('function visionCible() {');
const srcInputs = extract('function entreesCerveau(vie, vieAvant, n, etatVie, nAvant, h = null) {');
const srcTrades = extract('function echangesDe(h) {');
const srcOffMap = extract('function offMapFoodReads() {', false);
function run(profilNourriture) {
  const registry = CP.createPageBrains({ creer: (a) => initialBrain(a) });
  const env = { $: (s) => (s === '#profil' ? { hidden: false } : s === '#pcActif' ? { checked: true } : {}),
    habitants: [], profilCerveau: { adr: UNIT, etat: registry.etat(UNIT), vu: null, histo: [] }, relireNourriture: () => {},
    vieProfil: 10.017, etatVieProfil: 'LUE', pageBrains: registry, cerveauPas: step, beatCycle: 1, peindreCerveau: () => {},
    vieServeurPourCerveau: () => null, marcheAerodromeIndexe: () => false, roleDe: () => 'accueil', rpcTete: { n: 53121388 },
    profilNourriture, profileFoodAddress: profilNourriture ? UNIT : null, brainNourriture: null, heldFood: CP.heldFood,
    vision: { source: 'profil' }, brainAdr: null, brainFaitsVus: null, brainHisto: [], brainEtat: null, marcheParAdr: new Map(), symProfil: 'UNIT' };
  const names = Object.keys(env);
  const f = new Function(...names, [srcTrades, srcInputs, srcOffMap || '', srcProfile, srcVision, 'battreProfil(); return { target: visionCible() };'].join('\n'));
  return f(...names.map((k) => env[k]));
}
const rows = (target) => Object.fromEntries(champ({ adr: target.adr, faits: target.faits, vu: target.histo[target.histo.length - 1], nourritureLue: target.nourritureLue }).entrees.map((x) => [x.cle, x]));
{
  const { target } = run(READ);
  const e = rows(target);
  ok(target.faits && target.faits.gm === 7 && target.faits.detenteurs === 4 && target.faits.messages === 1, 'B: UNIT off the map — the brain receives the food its profile read (gm 7, holders 4)');
  ok(['gm', 'messages', 'detenteurs', 'mort'].every((k) => e[k].lu === true && !/not read/.test(e[k].texte)), 'B: Transfers, Messages, Holders, Creator: read, not "not read"');
  ok(e.gm.texte === '7' && e.detenteurs.texte === '4' && e.mort.texte === 'no', 'B: the true values');
}
{
  const { target } = run(null);
  const e = rows(target);
  ok(['gm', 'messages', 'detenteurs', 'mort'].every((k) => e[k].lu === false && /not read/.test(e[k].texte)), 'B: food NOT read -> stays "not read yet" (no default shown as read)');
}
/* A */
ok(typeof CP.heldFood === 'function', 'A: heldFood exported');
if (typeof CP.heldFood === 'function') {
  const T = CP.heldFood;
  ok(T(UNIT, null, [{ adr: UNIT.toUpperCase().replace('0X', '0x'), n: READ }]) === READ, 'A: off the map, the successful read of the same address');
  ok(T(UNIT, null, [{ adr: OTHER, n: READ }]) === null, 'A: never another address\'s read');
  ok(T(UNIT, null, [{ adr: UNIT, n: { etat: 'NON_LUE' } }]) === null, 'A: a failed off-map read is not held');
  const hUnread = { adr: UNIT, nourriture: { etat: 'NON_LUE' } };
  ok(T(UNIT, hUnread, [{ adr: UNIT, n: READ }]) === READ, 'A: habitant not read + successful off-map read -> the successful one');
  const hRead = { adr: UNIT, nourriture: { etat: 'LUE', gm: 1, messages: 0, detenteurs: 1, mort: false } };
  ok(T(UNIT, hRead, [{ adr: UNIT, n: READ }]) === hRead.nourriture, 'A: a read habitant comes first');
  ok(T(UNIT, hUnread, []) === hUnread.nourriture && T(UNIT, null, [null, undefined]) === null, 'A: nothing read -> the habitant\'s state, or null');
}
/* C */
ok(!!srcOffMap, 'C: offMapFoodReads found');
ok(/function offMapFacts\(adr\) \{[\s\S]{0,400}heldFood\(a, h, offMapFoodReads\(\)\)/.test(app), 'C: Live — the same read');
ok(/profilNourriture = n;\n\s*profileFoodAddress = String\(adr\)\.toLowerCase\(\);/.test(app), 'C: the profile read keeps its address');
console.log('test-offmap-food-20261026: ' + count + ' assertions, OK');
