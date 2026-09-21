// test-hook-v8.mjs — le V6 existe dans le code AVANT d exister sur la chaine. Ce fichier garde l ecart.
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
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8, estNotreHook, hookV8Deploye } from './tokenomics.js';
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
eq(BITS(HOOK_V8), ATTENDU_V6, 'l adresse du V6 porte EXACTEMENT les permissions qu il exerce');
// ⛔ TEMOIN : le V5 n a PAS le bit beforeSwapReturnsDelta. Sans ce temoin, une egalite trop large
//    passerait pour les deux et ne prouverait rien.
// ⛔⛔ ICI LE TEMOIN CHANGE DE SENS, ET C EST VOULU. Le V6 ajoutait une capacite, donc un bit.
//    Le V7 n en ajoute AUCUNE : il doit porter EXACTEMENT les memes bits que le V6. Une adresse
//    aux bits differents signalerait une capacite ajoutee en douce.
eq(BITS(HOOK_V8), BITS(HOOK_V6), 'le V7 porte les MEMES bits que le V6 — aucune capacite ajoutee');
eq(BITS(HOOK_V5), 0x24c4n, 'temoin : le V5, lui, en porte un de moins');
ok(BITS(HOOK_V8) !== BITS(HOOK_V5), 'et le V7 se distingue bien du V5');
ok(HOOK_V8.toLowerCase() !== HOOK_V6.toLowerCase(), 'memes bits, mais PAS la meme adresse');

// ══ 2. L ADRESSE MINEE, ET SON APPARTENANCE ══════════════════════════════════════════════════════
eq(HOOK_V8, '0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc',
  'l adresse minee le 2026-09-21, verifiee par HookMiner ET par un recalcul keccak independant');
ok(estNotreHook(HOOK_V8), 'le V6 est reconnu comme notre hook');
ok(estNotreHook(HOOK_V8.toLowerCase()), 'en minuscules aussi');
// ⛔ AJOUTER UN HOOK EST L OCCASION PARFAITE DE FAIRE DISPARAITRE LES AUTRES.
for (const [nom, h] of [['V1', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4], ['V5', HOOK_V5]]) {
  ok(estNotreHook(h), nom + ' reste reconnu apres l arrivee du V6');
}
ok(!estNotreHook('0x' + 'ab'.repeat(20)), 'temoin : un hook inconnu n est toujours pas le notre');

// ══ 3. UN DE NOS CONTRATS N EST PAS UN DETENTEUR ═════════════════════════════════════════════════
// ⛔ Oublier le V6 dans la liste d exclusion lui donnerait une part de recompense — et cette part
//    serait perdue, puisque le hook ne sait pas reclamer.
ok(EXCLUS[HOOK_V8.toLowerCase()], 'le V6 est exclu de la base des detenteurs');
ok(/V8/.test(EXCLUS[HOOK_V8.toLowerCase()]), 'avec une raison qui le NOMME : ' + EXCLUS[HOOK_V8.toLowerCase()]);

// ══ 4. LA SONDE — LE COEUR DE CE FICHIER ═════════════════════════════════════════════════════════
// ⛔⛔ TANT QUE LA CHAINE REND `0x`, LA REPONSE EST « ABSENT ». C est ce qui empeche l app de lancer
//     sur un hook qui n existe pas encore.
eq(await hookV8Deploye({ rpc: async () => '0x' }), 'ABSENT', 'pas de code -> ABSENT');
eq(await hookV8Deploye({ rpc: async () => '' }), 'ABSENT', 'reponse vide -> ABSENT aussi');
eq(await hookV8Deploye({ rpc: async () => '0x6080604052' }), 'DEPLOYE', 'du code -> DEPLOYE');
// ⛔ ET « NON_LU » A SA PROPRE BRANCHE : un noeud qui tousse n est ni l un ni l autre. Le confondre
//    avec ABSENT ferait retomber sur le V5 (sans dommage), mais le confondre avec DEPLOYE enverrait
//    un createur payer pour rien.
eq(await hookV8Deploye({ rpc: async () => { throw new Error('noeud injoignable'); } }), 'NON_LU',
  'une lecture qui echoue n est ni ABSENT ni DEPLOYE');
// ⛔ LA SONDE LIT BIEN L ADRESSE DU V6, pas une autre.
let vu = null;
await hookV8Deploye({ rpc: async (m, p) => { vu = { m, adr: p[0] }; return '0x'; } });
eq(vu.m, 'eth_getCode', 'la sonde lit le CODE, pas un appel de fonction');
eq(vu.adr, HOOK_V8, 'et elle le lit a l adresse du V6');

// ══ 5. LE TOPIC DE PREUVE — CE QUI REMPLACE UNE FAUSSE ALERTE ══════════════════════════════════
// ⛔⛔ CE QUI EST ARRIVE LE 2026-09-21. Apres le deploiement du V7, la page de signature a affiche
//    « ✗ creator tithe on chain: 20% — expected 0, DO NOT switch the app ». Le contrat etait BON :
//    DIME_CREATEUR_POUR_CENT est reste DECLARE expres, pour qu on puisse diffuser V6 et V7 et voir
//    ce qui change. Il n est simplement plus LU dans la repartition. Ma garde testait une valeur
//    DECORATIVE comme si c etait la logique.
// ⛔ ET LE MESSAGE RECLAMAIT L IMPOSSIBLE : l app lit l etat du hook sur la chaine et bascule toute
//    seule. « DO NOT switch the app » demandait une action qui n existe pas. Une alerte qui
//    reclame l impossible est pire qu une alerte absente — on apprend a ignorer le rouge.
// ⛔ CE QUI PROUVE VRAIMENT LA LOGIQUE : un evenement GRAVE dans le bytecode. Une constante se
//    lit ; un topic dans le code se verifie.
{
  const { readFileSync } = await import('node:fs');
  const { keccak256 } = await import('./keccak.js');
  const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
  const topicDe = (sig) => '0x' + enHex(keccak256(new TextEncoder().encode(sig)));

  const d = JSON.parse(readFileSync(new URL('./deploy-v8.json', import.meta.url), 'utf8'));
  const attendu = topicDe('ToutAuWallet(bytes32,address,uint256,address)');
  eq(d.topicPreuve, attendu, 'le topic de preuve du descripteur est bien le keccak de la signature');
  ok(d.pourquoiTopicPreuve && d.pourquoiTopicPreuve.length > 40,
    'et le descripteur DIT pourquoi ce topic sert de preuve');

  /* ⛔ LE TOPIC DOIT ETRE DANS LE BYTECODE DU V7 — sinon la page verifierait du vent. */
  const art = (v) => JSON.parse(readFileSync(
    new URL('../tblock-hook/out/TBlockFeeHook' + v + '.sol/TBlockFeeHook' + v + '.json', import.meta.url), 'utf8'));
  let codeV7 = null, codeV6 = null;
  try { codeV7 = String(art('V7').deployedBytecode.object).toLowerCase(); } catch { codeV7 = null; }
  try { codeV6 = String(art('V6').deployedBytecode.object).toLowerCase(); } catch { codeV6 = null; }
  if (codeV7 === null || codeV6 === null) {
    /* ⛔ ON NE FAIT PAS SEMBLANT : sans les artefacts compiles, ce controle n a pas eu lieu. */
    ok(false, 'artefacts forge introuvables — ce controle ne peut PAS etre considere comme passe');
  } else {
    const nu = attendu.replace(/^0x/, '');
    ok(codeV7.includes(nu), 'le topic est GRAVE dans le bytecode du V7');
    /* ⛔⛔ LE TEMOIN QUI DONNE SA VALEUR AU PRECEDENT : absent du V6. Sans lui, un topic present
       partout ne distinguerait rien du tout. */
    ok(!codeV6.includes(nu), 'et ABSENT de celui du V6 — c est ce qui en fait un discriminant');
  }

  /* ⛔ ET LES CONSTANTES DECORATIVES NE DOIVENT PLUS SERVIR DE VERDICT : le descripteur ne doit
     plus porter une dime « attendue » qui ferait echouer une verification sur un contrat sain. */
  const page = readFileSync(new URL('./deploy-v8.html', import.meta.url), 'utf8');
  /* ⛔ ON COMPTE CE QUI EST AFFICHE, PAS CE QUI EST COMMENTE. Les occurrences restantes dans les
     commentaires documentent le defaut et doivent SURVIVRE — une garde qui exigerait de les
     effacer effacerait la memoire de ce qu elle garde. Le critere : aucune ligne qui POUSSE du
     texte a l ecran ne doit reclamer une bascule manuelle. */
  const affichees = page.split('\n')
    .filter((l) => l.includes('lignes.push') && l.includes('DO NOT switch the app'));
  eq(affichees.length, 0, 'aucune ligne AFFICHEE ne reclame une bascule manuelle');
  ok(/DO NOT switch the app/.test(page), 'mais la trace du defaut reste dans les commentaires');
  ok(/pinned back to the previous hook/.test(page),
    'et le remede nomme est REELLEMENT faisable');
  ok(/informational, this hook no longer reads them/.test(page),
    'elle presente la dime comme informative, pas comme un verdict');
}

console.log('test-hook-v8 : ' + n + ' assertions, OK');
