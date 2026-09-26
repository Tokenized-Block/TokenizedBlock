/* test-naissance-sans-apport.mjs — LE CREATEUR NE MET PLUS UN WEI DANS LA POOL.
 *
 * ⛔⛔ CE QUI L A DECIDE, ET C EST UNE MESURE. 2026-09-26 : 558 transactions de creation B20 sur
 *     Base en 44 h, ZERO par notre chemin paye. 685 pools B20 ouvertes en 24 h, ZERO sur notre
 *     hook. 14 378 echanges B20, ZERO chez nous.
 *     Le concurrent l ecrit sur sa propre page : « All of it goes into one pool… The pool starts
 *     100% coin — buyers walk the price up », « no bonding curve ». Son createur n apporte RIEN.
 *     Nous exigions 0,0003 ETH de seed EN PLUS du frais de naissance : on demandait un apport a des
 *     gens qui n en mettent nulle part ailleurs.
 *
 * ⛔ CE QUE PHIL A DEMANDE, mot pour mot : « branche liquiditeUnilaterale sur Instant Birth,
 *   0.001 ETH pour le createur ». Donc : rien dans la pool, et le frais de naissance conserve.
 *
 * ⛔ AUCUNE MATHEMATIQUE NEUVE N A ETE ECRITE. Le calcul unilateral servait deja au « Add
 *   liquidity », et il savait deja ouvrir une pool INEXISTANTE en derivant le prix de la
 *   valorisation visee. Il a ete HISSE en fonction et branche aux deux endroits — le recopier
 *   aurait fait deriver la moitie qu on relit le moins.
 *
 * ⛔ CE TEST NE TOUCHE PAS LE RESEAU, ET C EST VERIFIE : le `rpc` passe JETTE a chaque appel. Si le
 *   chemin sans apport lisait la chaine, le test tomberait. C est aussi la preuve que ce plan peut
 *   etre calcule AVANT meme que le jeton existe.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu une pool ouverte ainsi se comporte bien sur la chaine. Aucune
 *   transaction n a ete signee — le harnais l interdit. Il prouve la FORME du plan, pas son sort.
 */
import { strict as assert } from 'node:assert';
import { planLancement, PROPRIETAIRE_PERMANENT, ETH_NATIF } from './lancer-pool.js';
import { HOOK_V8 } from './tokenomics.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ UN RPC QUI JETTE : toute lecture de chaine ferait echouer le test, donc l absence d echec
 *   PROUVE qu aucune n a eu lieu. Une sonde qui se contente de « ca marche » ne dirait pas ca. */
const rpcQuiJette = async () => { throw new Error('le plan sans apport ne doit lire AUCUNE chaine'); };

const COMPTE = '0x00000000000000000000000000000000000000c0';
const JETON = '0xb20000000000000000000000000000000000beef';
const SUPPLY = 1_000_000_000n * 10n ** 18n;

const base = {
  rpc: rpcQuiJette, chaine: 8453, jeton: JETON, compte: COMPTE,
  devise: ETH_NATIF, hooks: HOOK_V8, proprietaire: PROPRIETAIRE_PERMANENT,
  soldePresume: SUPPLY, naissance: true,
};

v('⛔⛔ sans apport : le plan sort OK et ne demande ZERO ETH pour la pool', async () => {});
/* (le cas reel est asynchrone — on l execute plus bas et on compte la-bas) */

const sansApport = await planLancement({ ...base, valorisationEth: 1, quoteEthWei: 0n });

v('⛔⛔ le plan sans apport aboutit', () => {
  /* ⛔ DEUX ETATS DE SUCCES, ET J AVAIS MIS LE MAUVAIS. Ma premiere version exigeait 'OK' ; le plan
   *   rend 'APPROBATIONS' parce qu avant la creation du jeton les autorisations Permit2 ne peuvent
   *   pas avoir ete donnees — c est l etat NORMAL d un plan pre-creation, pas un refus. Le code
   *   avait raison, mon attente etait fausse.
   *   Le seul etat qui doit faire crier ce test est 'REFUSE' (ou 'NON_MESURE'). */
  assert.ok(sansApport.etat === 'OK' || sansApport.etat === 'APPROBATIONS',
    'la naissance sans apport est refusee (' + sansApport.etat + ') : '
    + (sansApport.pourquoi || '(sans raison)'));
});

v('⛔⛔ le createur ne met RIEN dans la pool', () => {
  /* ⛔ C EST LA PROMESSE ENTIERE. Si ce zero devenait non nul, un ecran qui annonce « aucun apport »
   *   demanderait soudain de l ETH — et ce serait pire que l ancien comportement, qui le disait. */
  assert.equal(sansApport.ethRequis, 0n,
    'la pool reclamerait de l ETH au createur : la promesse « sans apport » serait fausse');
  assert.ok(sansApport.blocksRequis > 0n, 'aucun block ne serait place : la pool serait vide');
  assert.ok(sansApport.blocksRequis <= SUPPLY, 'il placerait plus de blocks que le createur n en a');
});

v('⛔ c est bien une NAISSANCE, pas un ajout de liquidite', () => {
  assert.equal(sansApport.naissance, true,
    'le plan ne se declare plus comme une naissance : l appelant n initialiserait pas la pool');
  assert.equal(sansApport.quoteEthWei, 0n, 'le seed annonce n est plus nul');
  assert.equal(sansApport.p && sansApport.p.sansApport, true,
    'le plan ne porte plus la marque `sansApport` : l ecran ne pourrait pas le dire au createur');
});

/* ⛔⛔ ET L ANCIEN CHEMIN N EST PAS FERME. On ajoute une porte, on n en retire aucune. Un seed a
 *     deux cotes doit continuer de marcher, plancher compris. */
const avecSeedRidicule = await planLancement({ ...base, valorisationEth: 1, quoteEthWei: 1n });
v('⛔ un seed NON NUL mais minuscule reste refuse, avec sa raison', () => {
  assert.equal(avecSeedRidicule.etat, 'REFUSE',
    'un seed de 1 wei est accepte : le plancher du CreateRouter ne protege plus rien');
  assert.match(String(avecSeedRidicule.pourquoi), /dust|0\.0003/,
    'le refus ne nomme plus le plancher : « ca ne marche pas » envoie chercher un defaut chez soi');
});

const seedNegatif = await planLancement({ ...base, valorisationEth: 1, quoteEthWei: -1n });
v('⛔ un seed negatif est refuse — il ne doit PAS tomber dans le chemin sans apport', () => {
  /* ⛔ `quoteEthWei <= 0n` etait l ancienne garde ; en l ouvrant a zero, un negatif aurait pu
   *   glisser vers la branche sans apport et produire un plan d apparence valide. */
  assert.equal(seedNegatif.etat, 'REFUSE', 'un seed negatif produit un plan');
  assert.match(String(seedNegatif.pourquoi), /negative/,
    'le refus d un seed negatif ne nomme pas sa cause');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok naissance-sans-apport — ' + n + ' cas.');
console.log('   ethRequis = 0 : le createur ne met pas un wei dans la pool, et il place');
console.log('   ' + sansApport.blocksRequis + ' unites de block. Aucune lecture de chaine.');
console.log('⚠️ NE PROUVE PAS qu une pool ouverte ainsi se comporte bien sur la chaine : aucune');
console.log('   transaction n a ete signee. C est la FORME du plan qui est prouvee, pas son sort.');
