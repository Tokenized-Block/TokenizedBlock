// test-hook-v5.mjs — l app reconnait le V5 SANS oublier les anciens, et lit le label sur le bon hook.
//
// ⛔ CE QUE CE FICHIER GARDE : ajouter un hook est l occasion parfaite de faire disparaitre les autres.
//    Une pool ouverte sur le V1 est toujours la notre et paie toujours a6cf ; si `estNotreHook` cessait
//    de la reconnaitre, elle sortirait du fil Live et des frais affiches SANS AUCUNE ERREUR — un defaut
//    qui ne se voit que sur un ecran qu on ne regarde pas.
// ⛔ ET LE LABEL SE LIT SUR LE HOOK QUI REFUSE : c est le V5 qui gate desormais les inscriptions.
//    Interroger le V4 repondrait pour un contrat qui ne decide plus rien — une garde vraie qui couvre
//    la mauvaise moitie. Le test verifie donc l ADRESSE APPELEE, pas seulement la reponse rendue.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, estNotreHook, blockPorteLeLabel, hookV5Deploye, SEL_PORTE_LABEL } from './tokenomics.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

// ══ 1. les cinq hooks sont les notres, et un inconnu ne l est pas ═════════════════════════════════
for (const [nom, h] of [['V1', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4], ['V5', HOOK_V5]]) {
  ok(estNotreHook(h), nom + ' doit rester reconnu comme notre hook');
  ok(estNotreHook(h.toLowerCase()), nom + ' reconnu aussi en minuscules');
  ok(estNotreHook(h.toUpperCase().replace('0X', '0x')), nom + ' reconnu aussi en majuscules');
}
// ⛔ TEMOIN NEGATIF : sans lui, une fonction qui rend toujours vrai passerait les 15 assertions ci-dessus.
ok(!estNotreHook('0x' + 'ab'.repeat(20)), 'un hook inconnu n est PAS le notre');
ok(!estNotreHook(''), 'la chaine vide n est pas un hook a nous');
ok(!estNotreHook(null), 'null n est pas un hook a nous');
ok(!estNotreHook(undefined), 'undefined n est pas un hook a nous');

// ══ 2. l adresse du V5 est bien celle qui a ete deployee et relue ════════════════════════════════
eq(HOOK_V5, '0x799136c3F5f572f1597b5B7E067D3eE45Fe4A4C4',
  'l adresse du V5 est celle relue sur la chaine le 2026-09-20 (tx 0x7fb52a1f…)');
ok(HOOK_V5.toLowerCase() !== HOOK_V4.toLowerCase(), 'le V5 n est pas le V4');

// ══ 3. le label est lu SUR LE V5, pas sur un autre contrat ═══════════════════════════════════════
const JETON = '0xb2' + '00'.repeat(19);
let vu = null;
const rpcEspion = async (m, p) => { vu = { m, to: p[0].to, data: p[0].data }; return '0x' + '0'.repeat(63) + '1'; };
eq(await blockPorteLeLabel({ rpc: rpcEspion, jeton: JETON }), 'OUI', 'un block qui porte le label rend OUI');
eq(vu.to, HOOK_V5, 'le label est demande au V5 — le hook qui refuse');
eq(vu.data.slice(0, 10), SEL_PORTE_LABEL, 'avec le selecteur porteLeLabel mesure par cast sig');
ok(vu.data.toLowerCase().endsWith(JETON.slice(2).toLowerCase()), 'et le jeton passe en argument');

// ══ 4. TROIS ETATS, jamais un booleen ════════════════════════════════════════════════════════════
eq(await blockPorteLeLabel({ rpc: async () => '0x' + '0'.repeat(64), jeton: JETON }), 'NON', 'zero = NON');
eq(await blockPorteLeLabel({ rpc: async () => { throw new Error('noeud fatigue'); }, jeton: JETON }), 'NON_LU',
  'un RPC qui tousse rend NON_LU, jamais NON — sinon on refuse un vrai createur');
eq(await blockPorteLeLabel({ rpc: async () => '0x', jeton: JETON }), 'NON_LU', 'une reponse vide rend NON_LU');
eq(await blockPorteLeLabel({ rpc: rpcEspion, jeton: 'pas-une-adresse' }), 'NON_LU', 'une adresse invalide rend NON_LU');

// ══ 5. hookV5Deploye lit du CODE, et distingue ses trois etats ═══════════════════════════════════
eq(await hookV5Deploye({ rpc: async () => '0x60806040' }), 'DEPLOYE', 'du code => DEPLOYE');
eq(await hookV5Deploye({ rpc: async () => '0x' }), 'ABSENT', 'pas de code => ABSENT');
eq(await hookV5Deploye({ rpc: async () => { throw new Error('rpc ko'); } }), 'NON_LU',
  'un RPC casse rend NON_LU, pas ABSENT — confondre les deux ferait croire le hook disparu');

console.log('test-hook-v5 : ' + n + ' assertions, OK');
