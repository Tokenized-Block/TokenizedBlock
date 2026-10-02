/* test-new-stocks-26-20261002.mjs — LES 18 ACTIONS AJOUTEES LE 2026-10-02, ET CELLES QUI RESTENT DEHORS.
 *
 * Source : liste de l emetteur `https://api.coinbase.com/v1/tokenized-stocks` (58 entrees le 2026-10-02),
 * apres l annonce Base du jour (x.com/base/status/2106022851346383309). Chaque adresse ci-dessous a ete
 * relue SUR LA CHAINE (code `0xef`, `symbol()` concordant, `decimals()` == 8, supply > 0) et a une pool
 * reelle prouvee sur fork Base par aller-retour au Quoter v4 (10 USDC -> action -> USDC).
 *
 * ⛔ CE QUE LE TEST FIGE :
 *   1. les 18 sont proposees sur Base, verifiees, a la MEME adresse dans paires.js ET index.html ;
 *   2. aucune ne pretend qu un block NEUF peut s y coter : V8 ne les admet pas (lu sur fork :
 *      `deviseAdmise()` == false), donc `hookDeLancementPour` rend null et Create le dit en clair ;
 *   3. TEMOIN NEGATIF : une adresse hors liste n est JAMAIS promue action verifiee — ni les 25
 *      ecartees (supply nulle, pas de pool, pool a 88 pour cent, liquidite hors plage), ni une inventee ;
 *   4. hors Base mainnet, une action Coinbase est refusee.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { ACTIONS_COINBASE, pairesProposees, qualifierPaire, hookDeLancementPour, refusPrixNouveauBlock,
  etiquettePaire } from './paires.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const AJOUTEES = [
  ['AMDc', '0xb2000000000000000000000d8ce462e99ee7a47b'],
  ['ASTSc', '0xb200000000000000000000b1a29cf17a1819288a'],
  ['CAKEc', '0xb200000000000000000000f215e4c890cfb7176b'],
  ['DJTc', '0xb200000000000000000000428e3a3eebbb20692b'],
  ['DUOLc', '0xb200000000000000000000a613d12deafbbb1db7'],
  ['LLYc', '0xb200000000000000000000f1a0f91e34892e4718'],
  ['MRNAc', '0xb200000000000000000000e215e9b76ecba02468'],
  ['MRVLc', '0xb200000000000000000000ec3c4c7395cc609813'],
  ['NFLXc', '0xb20000000000000000000058b8c947e44011dfe6'],
  ['NVAXc', '0xb200000000000000000000c597c476fcf9aed3a8'],
  ['ORCLc', '0xb200000000000000000000347afba223d7b6b63c'],
  ['PTONc', '0xb2000000000000000000009272a491812842aa84'],
  ['PYPLc', '0xb200000000000000000000450ad3abe5d4846c6e'],
  ['QUBTc', '0xb200000000000000000000ca425ab42e07c35bc3'],
  ['RBLXc', '0xb2000000000000000000005bd7ae89b9e6189bb5'],
  ['RDDTc', '0xb20000000000000000000066242d4067724cb7a1'],
  ['TTWOc', '0xb200000000000000000000f720c26062bc3067da'],
  ['WENc', '0xb20000000000000000000044e3cd7a0e1028e57a'],
];

const DEHORS = [
  ['HTZc', '0xb2000000000000000000002601c5c94f435da168'],
  ['PFEc', '0xb20000000000000000000018fe7ec7d6dfeeb528'],
  ['GMEc', '0xb2000000000000000000007790ed6e48e06ed935'],
  ['PMc', '0xb2000000000000000000008fc2a8c23cf5937b66'],
  ['SOUNc', '0xb2000000000000000000002137743d4a01fe4e88'],
  ['AEOc', '0xb2000000000000000000006064f8ec027f042294'],
  ['AMCc', '0xb200000000000000000000cd7e6b8042cb7c2bb5'],
  ['BIRDc', '0xb200000000000000000000535fe96f18204bfd96'],
  ['BMNRc', '0xb200000000000000000000ea2df44a307cab279c'],
  ['BYNDc', '0xb200000000000000000000801830b13b8e493423'],
  ['CIFRc', '0xb200000000000000000000690275843b6e246286'],
  ['CLSKc', '0xb200000000000000000000fa63cfff5c794dbb95'],
  ['CRCLc', '0xb20000000000000000000019f6e7c675b73c2e4d'],
  ['CRWVc', '0xb200000000000000000000f111184a74720787e6'],
  ['HUTc', '0xb2000000000000000000006ee1c139a723872e09'],
  ['KSSc', '0xb200000000000000000000105a1f43ff3605c5de'],
  ['LCIDc', '0xb20000000000000000000081050ac3d4395df527'],
  ['MARAc', '0xb200000000000000000000a310e034e09186fb2d'],
  ['OPENc', '0xb200000000000000000000259694b27bf052e7d7'],
  ['RIOTc', '0xb200000000000000000000bd0c7627b663c581a6'],
  ['USDEc', '0xb2000000000000000000009426b660396ebcf343'],
  ['VVVc', '0xb200000000000000000000fec679b39992f67627'],
  ['WULFc', '0xb200000000000000000000432a1d2bd864acec82'],
  ['WWc', '0xb20000000000000000000089221e238277d52515'],
  ['XYZc', '0xb20000000000000000000067c8c151f24e1c9924'],
];

v('les 18 sont dans paires.js, a la bonne adresse, une seule fois', () => {
  assert.equal(AJOUTEES.length, 18);
  for (const [s, a] of AJOUTEES) {
    const l = ACTIONS_COINBASE.filter((x) => x.symbole === s);
    assert.equal(l.length, 1, s + ' absente ou en double dans ACTIONS_COINBASE');
    assert.equal(l[0].adr, a, 'adresse divergente pour ' + s);
    assert.match(a, /^0xb2[0-9a-f]{38}$/);
  }
});

v('les 18 sont dans le jumeau index.html, a la meme adresse', () => {
  for (const [s, a] of AJOUTEES) {
    const ligne = html.split('\n').find((l) => l.includes("{ symbol: '" + s + "', "));
    assert.ok(ligne, s + ' absente de STOCKS_BASE_REGISTRY');
    assert.ok(ligne.includes("adr: '" + a + "' }"), 'adresse divergente dans index.html pour ' + s);
  }
});

v('proposees et verifiees sur Base mainnet', () => {
  const p = pairesProposees(8453);
  for (const [s, a] of AJOUTEES) {
    const e = p.find((x) => x.adr === a);
    assert.ok(e && e.type === 'ACTION' && e.symbole === s, s + ' non proposee comme action');
    const q = qualifierPaire('0x' + a.slice(2).toUpperCase(), 8453);
    assert.equal(q.etat, 'OK');
    assert.equal(q.paire.verifiee, true, s + ' devrait etre verifiee');
    assert.equal(q.paire.type, 'ACTION');
    assert.ok(etiquettePaire(q.paire).startsWith(s + ' — '));
  }
});

v('aucune ne cote un block NEUF aujourd hui : V8 ne les admet pas, Create le dit sans jargon', () => {
  for (const [s, a] of AJOUTEES) {
    assert.equal(hookDeLancementPour(a, 8453), null, s + ' ne doit pas ouvrir sur V8');
    const r = refusPrixNouveauBlock(a, 8453, { routable: true, symbole: s });
    assert.equal(typeof r, 'string');
    assert.ok(!/hook|V8|V9|0x|PoolKey|admis/i.test(r), 'jargon technique dans la copie : ' + r);
  }
  /* temoin : une action deja admise par V8 ouvre bien sur V8 — le test discrimine */
  assert.equal(hookDeLancementPour('0xb20000000000000000000078ee7ce2fe4908108c', 8453), 'V8');
});

v('TEMOIN NEGATIF : une adresse hors liste reste refusee comme action', () => {
  const connues = new Set(ACTIONS_COINBASE.map((x) => x.adr));
  const bas = html.toLowerCase();
  for (const [s, a] of [...DEHORS, ['INVENTEE', '0xb2000000000000000000000000000000deadbeef']]) {
    assert.ok(!connues.has(a), s + ' ne doit PAS etre dans la liste');
    assert.ok(!bas.includes("adr: '" + a + "'"), s + ' ne doit PAS etre dans index.html');
    const q = qualifierPaire(a, 8453);
    assert.notEqual(q.paire && q.paire.verifiee, true, s + ' promue verifiee alors qu elle est hors liste');
    assert.notEqual(q.paire && q.paire.type, 'ACTION', s + ' promue action');
    assert.equal(hookDeLancementPour(a, 8453), null, s + ' ne doit ouvrir aucun lancement');
  }
});

v('hors Base mainnet, une action ajoutee est refusee', () => {
  for (const [s, a] of AJOUTEES) {
    assert.equal(qualifierPaire(a, 84532).etat, 'REFUSE', s + ' acceptee hors Base');
    assert.equal(hookDeLancementPour(a, 84532), null);
  }
  assert.deepEqual(pairesProposees(84532).filter((p) => p.type === 'ACTION'), []);
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok new-stocks-26 — ' + n + ' cas · 18 ajoutees · ' + DEHORS.length + ' ecartees + 1 inventee refusees');
