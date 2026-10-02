/* test-new-stocks-26-20261002.mjs — LES 22 ACTIONS AJOUTEES LE 2026-10-02, ET CE QU ELLES NE FONT PAS.
 *
 * ⛔⛔ CE QUE CE TEST VERROUILLE : les 22 adresses sont celles de la liste de l EMETTEUR
 *     (api.coinbase.com/v1/tokenized-stocks), mesurees sur un fork Base (code `0xef`, symbol,
 *     decimals 8, supply > 0). Une adresse qui derive ferait appairer un block a autre chose que
 *     ce que l ecran annonce.
 * ⛔⛔ ET LE TEMOIN NEGATIF : une adresse NON listee (SOUNc, BIRDc — emises mais ecartees ; 0x…beef)
 *     n est JAMAIS promue « verifiee ». Sans ce temoin, un `qualifierPaire` qui accepterait tout
 *     passerait les cas positifs.
 * ⛔ ET LA LIMITE DITE : aucune des 22 ne peut coter un block NEUF aujourd hui (hook V8 : liste fixee
 *   au constructeur). La garde de Create doit le dire, pas le decouvrir apres paiement.
 * ⚠️ BORNE : test PUR. Il ne relit pas la chaine (mesure faite au bloc 52080500).
 */
import { strict as assert } from 'node:assert';
import { ACTIONS_COINBASE, pairesProposees, qualifierPaire, hookDeLancementPour, refusPrixNouveauBlock,
  DEVISES_ADMISES_V8, DEVISES_ADMISES_V9 } from './paires.js';

let n = 0;
const v = (nom, fn) => { try { fn(); n += 1; } catch (e) { console.error('✗ ' + nom); throw e; } };

/* ⛔ RECOPIEES de la reponse de l emetteur du 2026-10-02 (casse d origine), jamais de tete. */
const NOUVELLES = {
  AMDc: '0xB2000000000000000000000d8ce462E99ee7A47B', ASTSc: '0xB200000000000000000000B1a29cF17A1819288a',
  CAKEc: '0xb200000000000000000000f215e4c890cfb7176b', DJTc: '0xb200000000000000000000428E3a3eebBb20692B',
  DUOLc: '0xb200000000000000000000a613d12deafbbb1db7', GMEc: '0xb2000000000000000000007790ed6E48e06eD935',
  HTZc: '0xb2000000000000000000002601C5C94F435da168', LLYc: '0xB200000000000000000000f1a0F91e34892E4718',
  MRNAc: '0xB200000000000000000000e215e9B76ecBA02468', MRVLc: '0xB200000000000000000000eC3c4c7395Cc609813',
  NFLXc: '0xb20000000000000000000058B8c947e44011dFE6', NVAXc: '0xb200000000000000000000c597c476fcf9aed3a8',
  ORCLc: '0xb200000000000000000000347AFbA223D7B6b63C', PFEc: '0xb20000000000000000000018fe7ec7d6dfeeb528',
  PMc: '0xb2000000000000000000008fc2a8c23cf5937b66', PTONc: '0xb2000000000000000000009272a491812842aa84',
  PYPLc: '0xb200000000000000000000450ad3abe5d4846c6e', QUBTc: '0xb200000000000000000000CA425ab42e07C35bC3',
  RBLXc: '0xB2000000000000000000005bd7AE89b9E6189Bb5', RDDTc: '0xb20000000000000000000066242d4067724cB7A1',
  TTWOc: '0xB200000000000000000000f720C26062Bc3067Da', WENc: '0xb20000000000000000000044e3cd7a0e1028e57a',
};
/* ⛔ TEMOINS NEGATIFS : emises par Coinbase mais NON listees (SOUNc : seule pool USDC a 88 % de frais ;
 *   BIRDc : supply 0), et une adresse quelconque. */
const NON_LISTEES = {
  SOUNc: '0xb2000000000000000000002137743d4a01fe4e88',
  BIRDc: '0xb200000000000000000000535fE96f18204BFD96',
  BEEF: '0x000000000000000000000000000000000000beef',
};

v('les 22 sont dans ACTIONS_COINBASE, a la bonne adresse, une seule fois', () => {
  assert.equal(Object.keys(NOUVELLES).length, 22);
  for (const [s, adr] of Object.entries(NOUVELLES)) {
    const e = ACTIONS_COINBASE.filter((a) => a.symbole === s);
    assert.equal(e.length, 1, s + ' absente ou en double');
    assert.equal(e[0].adr, adr.toLowerCase(), 'ADRESSE DIVERGENTE pour ' + s);
    assert.ok(e[0].nom && e[0].nom.length > 1, s + ' sans nom');
  }
});

v('chacune est une ACTION verifiee sur Base mainnet, et refusee hors Base', () => {
  for (const [s, adr] of Object.entries(NOUVELLES)) {
    const q = qualifierPaire(adr, 8453);
    assert.equal(q.etat, 'OK', s);
    assert.equal(q.paire.type, 'ACTION', s + ' pas typee ACTION');
    assert.equal(q.paire.verifiee, true, s + ' pas verifiee');
    assert.equal(q.paire.symbole, s);
    assert.equal(qualifierPaire(adr, 84532).etat, 'REFUSE', s + ' proposee hors Base');
    assert.ok(!pairesProposees(84532).some((p) => p.adr === adr.toLowerCase()), s + ' listee sur Sepolia');
  }
});

v('⛔⛔ TEMOIN NEGATIF : une adresse non listee n est JAMAIS promue', () => {
  for (const [s, adr] of Object.entries(NON_LISTEES)) {
    assert.ok(!ACTIONS_COINBASE.some((a) => a.adr === adr.toLowerCase()), s + ' est listee');
    const q = qualifierPaire(adr, 8453);
    assert.notEqual(q.paire && q.paire.verifiee, true, s + ' promue verifiee');
    assert.notEqual(q.paire && q.paire.type, 'ACTION', s + ' promue ACTION');
    assert.equal(q.paire.symbole, null, s + ' a emprunte un nom');
    assert.equal(hookDeLancementPour(adr, 8453), null, s + ' admise au lancement');
    assert.equal(hookDeLancementPour(adr, 8453, { v9: true }), null, s + ' admise au lancement (v9)');
  }
});

v('⛔⛔ aucune des 22 ne cote un block NEUF aujourd hui : la garde de Create le dit', () => {
  for (const [s, adr] of Object.entries(NOUVELLES)) {
    const a = adr.toLowerCase();
    assert.ok(!DEVISES_ADMISES_V8.includes(a), s + ' dans la liste V8 : le hook deploye la refuse');
    assert.ok(!DEVISES_ADMISES_V9.includes(a), s + ' dans la liste V9 sans decision');
    assert.equal(hookDeLancementPour(a, 8453), null, s);
    assert.equal(hookDeLancementPour(a, 8453, { v9: true }), null, s);
    const phrase = refusPrixNouveauBlock(a, 8453, { routable: true, symbole: s });
    assert.equal(phrase, s + " can't price a new block yet. You can already use it to buy.");
    assert.ok(!/hook|V8|V9|0x/i.test(phrase), 'mot technique a l ecran : ' + phrase);
  }
  /* temoin positif : NVDAc reste admise, sinon le test ne discrimine rien */
  assert.equal(hookDeLancementPour('0xb20000000000000000000078ee7ce2fe4908108c', 8453), 'V8');
});

console.log('ok new-stocks-26 — ' + n + ' cas · ' + ACTIONS_COINBASE.length + ' actions listees');
