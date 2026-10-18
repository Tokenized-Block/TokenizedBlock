/* test-duels-parite-app-20261018.mjs — duels-plan-app.js contre l ABI COMPILEE de BlockDuels : chaque selecteur de fonction encode par l app
 * existe dans l ABI, et chaque evenement du contrat est lu par l app sous sa forme PRINCIPALE (la premiere de chaque liste), indexation comprise.
 * Source de l ABI : contracts/out/BlockDuels.sol/BlockDuels.json du depot, ou la variable DUELS_ABI (chemin d un autre worktree).
 * ABI absente : le test le DIT et sort 2 (jamais un vert « par absence »). */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as D from './duels-plan-app.js';
import { selecteur, topic } from './keccak.js';
import { traitsDepuisHash } from './blockrolls-plan.js';

const chemin = process.env.DUELS_ABI || fileURLToPath(new URL('./contracts/out/BlockDuels.sol/BlockDuels.json', import.meta.url));
if (!existsSync(chemin)) { console.error('NON PROUVE : ABI de BlockDuels absente (' + chemin + ') — parite non verifiee'); process.exit(2); }
const abi = JSON.parse(readFileSync(chemin, 'utf8')).abi;
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const sig = (x) => x.name + '(' + x.inputs.map((i) => i.type).join(',') + ')';
const fonctions = new Set(abi.filter((x) => x.type === 'function').map(sig));
const evenements = abi.filter((x) => x.type === 'event');
for (const s of [D.SIG_CREATE, D.SIG_JOIN, D.SIG_CANCEL, D.SIG_SETTLE, D.SIG_REFUND, D.SIG_NEXT_ID, D.SIG_CLAIM, D.SIG_OWED]) vu(fonctions.has(s), 'fonction de l app dans l ABI : ' + s);
vu(D.SIGS_ADMIS.some((s) => fonctions.has(s)) && fonctions.has(D.SIGS_ADMIS[0]), 'le getter d admission essaye EN PREMIER existe : ' + D.SIGS_ADMIS[0]);
const ev = (nom) => evenements.find((x) => x.name === nom);
const attendus = [['Created', D.EVS_CREATED[0], 'II----'], ['Joined', D.EVS_JOINED[0], 'II--'], ['Settled', D.EVS_SETTLED[0], 'I-----'], ['Cancelled', D.EVS_CANCELLED[0], 'I'], ['Refunded', D.EVS_REFUNDED[0], 'I--']];
for (const [nom, s, idx] of attendus) {
  const e = ev(nom);
  vu(e && sig(e) === s, 'evenement ' + nom + ' : ' + (e ? sig(e) : 'absent') + ' = ' + s);
  vu(e && e.inputs.map((i) => (i.indexed ? 'I' : '-')).join('') === idx, 'evenement ' + nom + ' : indexation ' + idx);
  vu(D.TOPICS_DUELS.includes(topic(s)), 'topic de ' + nom + ' dans le filtre de lecture');
}
/* les constantes de l app = celles du contrat (lues dans le source compile, a cote de l ABI) */
const src = (() => { const p = chemin.replace(/out[\\/]BlockDuels\.sol[\\/]BlockDuels\.json$/, 'src/BlockDuels.sol'); return existsSync(p) ? readFileSync(p, 'utf8') : null; })();
if (src) {
  const cst = (nom) => { const m = new RegExp('\\b' + nom + '\\s*=\\s*(7 days|[0-9_]+)').exec(src); return m ? (m[1] === '7 days' ? 604800n : BigInt(m[1].replace(/_/g, ''))) : null; };
  vu(cst('MIN_STAKE') === D.MISE_MIN && cst('MIN_EXPIRY') === BigInt(D.EXPIRATION_MIN_S) && cst('MAX_EXPIRY') === BigInt(D.EXPIRATION_MAX_S), 'MIN_STAKE / MIN_EXPIRY / MAX_EXPIRY : les memes');
  vu(cst('WINNER_BPS') === D.PART_GAGNANT_BPS && cst('POOL_BPS') === D.PART_POOL_BPS && cst('BPS') === D.BPS && cst('SETTLE_WINDOW') === BigInt(D.FENETRE) && cst('TARGET_DELAY') === BigInt(D.DELAI_CIBLE), '90 / 7 / reste, fenetre 256, cible +2 : les memes');
} else console.log('--  source BlockDuels.sol absent a cote de l ABI : constantes non comparees');
/* la face : faceOf(bytes32) existe ; la parite de la DERIVATION (meme que BlockRolls) se prouve en executant faceOf — banc fork de la partie contrat */
vu(fonctions.has('faceOf(bytes32)'), 'faceOf(bytes32) existe (sa parite d execution avec traitsDepuisHash : NON prouvee ici, banc de la partie contrat)');
vu(Array.isArray(traitsDepuisHash('0x' + '11'.repeat(32))), 'traitsDepuisHash (BlockRolls) rend 5 traits');
console.log('ok duels-parite-app - ' + n + ' assertions (ABI : ' + chemin + ') ; NE PROUVE PAS l execution de faceOf');
