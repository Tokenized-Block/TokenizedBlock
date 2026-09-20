// test-hook-v6.mjs — le V6 existe dans le code AVANT d exister sur la chaine. Ce fichier garde l ecart.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EMPECHE : ecrire « DEPLOYE » en dur pour le V6 comme on l a fait pour le
//    V5. Pour le V5 c etait vrai — son code avait ete LU a son adresse. Pour le V6 ce serait FAUX tant
//    que la transaction n est pas signee : l app enverrait chaque createur ouvrir son marche sur un
//    hook qui n existe pas, et le Launch echouerait pour tout le monde, en silence cote code.
//    La sonde doit donc rendre ABSENT quand la chaine rend `0x`, et seul DEPLOYE doit faire basculer.
//
// ⛔ ET LES BITS DE PERMISSION SONT RECALCULES ICI, pas recopies. Uniswap v4 les lit dans les 14 bits
//    de poids faible de l adresse : une adresse qui ne les porte pas est REFUSEE par le PoolManager.
//    Un chiffre recopie d une sortie de script ne redevient pas vrai parce qu on l a recopie.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, estNotreHook, hookV6Deploye } from './tokenomics.js';
import { EXCLUS } from './parts-holders.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

// ══ 1. LES BITS DE PERMISSION, RECALCULES ════════════════════════════════════════════════════════
// ⛔ 0x24cc = beforeInitialize(13) + afterAddLiquidity(10) + beforeSwap(7) + afterSwap(6)
//    + beforeSwapReturnsDelta(3) + afterSwapReturnsDelta(2). Les positions viennent de Hooks.sol.
const BITS = (adr) => BigInt(adr) & 0x3fffn;
const ATTENDU_V6 = (1n << 13n) | (1n << 10n) | (1n << 7n) | (1n << 6n) | (1n << 3n) | (1n << 2n);
eq(ATTENDU_V6, 0x24ccn, 'le masque se recompose bien a partir des positions de bits');
eq(BITS(HOOK_V6), ATTENDU_V6, 'l adresse du V6 porte EXACTEMENT les permissions qu il exerce');
// ⛔ TEMOIN : le V5 n a PAS le bit beforeSwapReturnsDelta. Sans ce temoin, une egalite trop large
//    passerait pour les deux et ne prouverait rien.
eq(BITS(HOOK_V5), 0x24c4n, 'temoin : le V5 porte un bit de moins');
ok(BITS(HOOK_V6) !== BITS(HOOK_V5), 'le bit de plus est ce qui distingue les deux adresses');
eq(BITS(HOOK_V6) ^ BITS(HOOK_V5), 1n << 3n, 'et cet unique bit est beforeSwapReturnsDelta');

// ══ 2. L ADRESSE MINEE, ET SON APPARTENANCE ══════════════════════════════════════════════════════
eq(HOOK_V6, '0xD71af554b5b3dCb6bb17946cfA3C41860A50a4cC',
  'l adresse minee le 2026-09-21, verifiee par HookMiner ET par un recalcul keccak independant');
ok(estNotreHook(HOOK_V6), 'le V6 est reconnu comme notre hook');
ok(estNotreHook(HOOK_V6.toLowerCase()), 'en minuscules aussi');
// ⛔ AJOUTER UN HOOK EST L OCCASION PARFAITE DE FAIRE DISPARAITRE LES AUTRES.
for (const [nom, h] of [['V1', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4], ['V5', HOOK_V5]]) {
  ok(estNotreHook(h), nom + ' reste reconnu apres l arrivee du V6');
}
ok(!estNotreHook('0x' + 'ab'.repeat(20)), 'temoin : un hook inconnu n est toujours pas le notre');

// ══ 3. UN DE NOS CONTRATS N EST PAS UN DETENTEUR ═════════════════════════════════════════════════
// ⛔ Oublier le V6 dans la liste d exclusion lui donnerait une part de recompense — et cette part
//    serait perdue, puisque le hook ne sait pas reclamer.
ok(EXCLUS[HOOK_V6.toLowerCase()], 'le V6 est exclu de la base des detenteurs');
ok(/V6/.test(EXCLUS[HOOK_V6.toLowerCase()]), 'avec une raison qui le NOMME : ' + EXCLUS[HOOK_V6.toLowerCase()]);

// ══ 4. LA SONDE — LE COEUR DE CE FICHIER ═════════════════════════════════════════════════════════
// ⛔⛔ TANT QUE LA CHAINE REND `0x`, LA REPONSE EST « ABSENT ». C est ce qui empeche l app de lancer
//     sur un hook qui n existe pas encore.
eq(await hookV6Deploye({ rpc: async () => '0x' }), 'ABSENT', 'pas de code -> ABSENT');
eq(await hookV6Deploye({ rpc: async () => '' }), 'ABSENT', 'reponse vide -> ABSENT aussi');
eq(await hookV6Deploye({ rpc: async () => '0x6080604052' }), 'DEPLOYE', 'du code -> DEPLOYE');
// ⛔ ET « NON_LU » A SA PROPRE BRANCHE : un noeud qui tousse n est ni l un ni l autre. Le confondre
//    avec ABSENT ferait retomber sur le V5 (sans dommage), mais le confondre avec DEPLOYE enverrait
//    un createur payer pour rien.
eq(await hookV6Deploye({ rpc: async () => { throw new Error('noeud injoignable'); } }), 'NON_LU',
  'une lecture qui echoue n est ni ABSENT ni DEPLOYE');
// ⛔ LA SONDE LIT BIEN L ADRESSE DU V6, pas une autre.
let vu = null;
await hookV6Deploye({ rpc: async (m, p) => { vu = { m, adr: p[0] }; return '0x'; } });
eq(vu.m, 'eth_getCode', 'la sonde lit le CODE, pas un appel de fonction');
eq(vu.adr, HOOK_V6, 'et elle le lit a l adresse du V6');

console.log('test-hook-v6 : ' + n + ' assertions, OK');
