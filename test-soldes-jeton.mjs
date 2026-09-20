// test-soldes-jeton.mjs — reconstruire des soldes, et SURTOUT refuser de le faire a moitie.
//
// ⛔ LE DEFAUT GARDE ICI : rendre une reconstruction TROUEE comme si elle etait complete. Un seul
//    Transfer manquant laisse des jetons chez quelqu un qui ne les a plus — et un merkle root bati
//    la-dessus paierait la mauvaise adresse, sans aucune erreur nulle part.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { naissanceDuJeton, rejouerTransferts, verifierSomme, soldesNegatifs, TOPIC_TRANSFER, ADRESSE_ZERO }
  from './soldes-jeton.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const JETON = '0xb2' + '00'.repeat(19);
const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const mot = (a) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const montant = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const log = (bloc, de, vers, v) => ({ blockNumber: '0x' + bloc.toString(16),
  topics: [TOPIC_TRANSFER, mot(de), mot(vers)], data: montant(v) });

/** Un RPC qui rend les logs d une liste, et qui peut REFUSER certaines fenetres. */
const rpcAvec = (tous, fenetresRefusees = []) => async (methode, params) => {
  assert.equal(methode, 'eth_getLogs');
  const de = parseInt(params[0].fromBlock, 16), a = parseInt(params[0].toBlock, 16);
  if (fenetresRefusees.some(([x, y]) => de <= y && a >= x)) throw new Error('window refused by node');
  const mintSeul = (params[0].topics || []).length > 1;
  return tous.filter((l) => {
    const b = parseInt(l.blockNumber, 16);
    if (b < de || b > a) return false;
    return mintSeul ? l.topics[1] === mot(ADRESSE_ZERO) : true;
  });
};

// ══ 1. la naissance se trouve, et ne s invente pas ═══════════════════════════════════════════════
{
  const tous = [log(1500, ADRESSE_ZERO, A, 1000n), log(2500, A, B, 300n)];
  eq(await naissanceDuJeton({ rpc: rpcAvec(tous), jeton: JETON, depuis: 0, jusqua: 4000 }), 1500,
    'la naissance est le premier Transfer depuis l adresse zero');
  // ⛔ TEMOIN : sans mint dans la plage, on rend null — jamais une valeur par defaut.
  eq(await naissanceDuJeton({ rpc: rpcAvec([]), jeton: JETON, depuis: 0, jusqua: 4000 }), null,
    'aucun mint trouve -> null, pas une naissance devinee');
}

// ══ 2. le rejeu donne les bons soldes ════════════════════════════════════════════════════════════
{
  const tous = [log(1500, ADRESSE_ZERO, A, 1000n), log(2500, A, B, 300n), log(3100, B, A, 100n)];
  const soldes = new Map();
  const r = await rejouerTransferts({ rpc: rpcAvec(tous), jeton: JETON, deBloc: 1500, aBloc: 4000, soldes });
  eq(r.nLogs, 3, 'les trois Transfer ont ete lus');
  eq(r.ratees, 0, 'aucune fenetre refusee');
  eq(soldes.get(A), 800n, 'A : 1000 recus, 300 envoyes, 100 repris');
  eq(soldes.get(B), 200n, 'B : 300 recus, 100 renvoyes');
  ok(!soldes.has(ADRESSE_ZERO), 'l adresse zero n est jamais un detenteur');
  eq(soldesNegatifs(soldes).length, 0, 'aucun solde negatif');
}

// ══ 3. ⛔ LE CAS QUI COMPTE : une fenetre refusee est COMPTEE, pas avalee ════════════════════════
{
  const tous = [log(1500, ADRESSE_ZERO, A, 1000n), log(2500, A, B, 300n), log(3100, B, A, 100n)];
  const soldes = new Map();
  // ⛔ PAS DE 500 : avec le pas par defaut (2000) mes trois Transfer tiennent dans UNE tranche, et
  //    « refuser une fenetre » les refusait tous les trois. Le scenario voulu est : UN seul manque.
  const r = await rejouerTransferts({ rpc: rpcAvec(tous, [[2500, 2999]]), jeton: JETON, deBloc: 1500, aBloc: 4000, soldes, pas: 500 });
  ok(r.ratees > 0, 'la fenetre refusee est COMPTEE : ' + r.ratees);
  eq(r.nLogs, 2, 'et il manque bien UN Transfer sur trois');
  // ⛔ LA PREUVE QUE LE SILENCE SERAIT DANGEREUX : sans le compteur, ces soldes passeraient pour bons.
  eq(soldes.get(A), 1100n, 'A parait detenir 1100 alors qu il en a 800 — la reconstruction est FAUSSE');
  // ⛔ ET B TOMBE NEGATIF : impossible sur un ERC-20. C est le signal le plus fort qu un trou existe.
  eq(soldes.get(B), -100n, 'B tombe a -100, ce qui ne peut pas arriver sur un vrai jeton');
  eq(soldesNegatifs(soldes).length, 1, 'le solde impossible est remonte, pas filtre');
  const v = verifierSomme({ soldes, totalSupply: 1000n });
  eq(v.etat, 'FAUX', 'et la verification par totalSupply le dit');
  eq(v.ecart, 100n, 'avec l ecart exact');
}

// ══ 4. TROIS ETATS pour la verification, jamais un booleen ══════════════════════════════════════
{
  const soldes = new Map([[A, 700n], [B, 300n]]);
  eq(verifierSomme({ soldes, totalSupply: 1000n }).etat, 'JUSTE', 'somme egale au total');
  eq(verifierSomme({ soldes, totalSupply: 999n }).etat, 'FAUX', 'somme differente');
  // ⛔ « pas lu » n est ni juste ni faux : le confondre publierait une fausse certitude.
  eq(verifierSomme({ soldes, totalSupply: null }).etat, 'NON_LU', 'totalSupply non lu -> NON_LU');
  eq(verifierSomme({ soldes, totalSupply: undefined }).etat, 'NON_LU', 'undefined aussi');
}

// ══ 5. un solde negatif est REMONTE, pas filtre ═════════════════════════════════════════════════
{
  const soldes = new Map([[A, 500n], [B, -20n]]);
  const neg = soldesNegatifs(soldes);
  eq(neg.length, 1, 'le solde negatif est remonte');
  eq(neg[0].adr, B, 'avec son adresse');
  eq(neg[0].montant, -20n, 'et son montant, pour qu on voie l ampleur');
}

// ══ 6. INCREMENTAL : deux passes donnent le meme resultat qu une seule ══════════════════════════
// ⛔ Si le cumul etait faux, un second appel doublerait des montants — defaut invisible a l oeil.
{
  const tous = [log(1500, ADRESSE_ZERO, A, 1000n), log(2500, A, B, 300n), log(3100, B, A, 100n)];
  const enUneFois = new Map();
  await rejouerTransferts({ rpc: rpcAvec(tous), jeton: JETON, deBloc: 1500, aBloc: 4000, soldes: enUneFois });
  const enDeux = new Map();
  await rejouerTransferts({ rpc: rpcAvec(tous), jeton: JETON, deBloc: 1500, aBloc: 2600, soldes: enDeux });
  await rejouerTransferts({ rpc: rpcAvec(tous), jeton: JETON, deBloc: 2601, aBloc: 4000, soldes: enDeux });
  eq(enDeux.get(A), enUneFois.get(A), 'A : deux passes == une passe');
  eq(enDeux.get(B), enUneFois.get(B), 'B : deux passes == une passe');
}

console.log('test-soldes-jeton : ' + n + ' assertions, OK');
