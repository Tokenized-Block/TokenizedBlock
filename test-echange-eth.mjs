/* test-echange-eth.mjs — LE LECTEUR DU CHEMIN ETH : UNE TRANSACTION, SIMULEE AVEC SA VALEUR.
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE, ET C EST UN TROU QU UNE RELECTURE ADVERSARIALE A TROUVE.
 *     `echange-eth.js` n avait AUCUN test comportemental. Le seul test qui le touchait
 *     (`test-calldata-aerodrome.mjs`) grep son TEXTE SOURCE pour `FEE_WALLET` et `porteNotreFrais`.
 *     Or ce module vient de changer deux fois le 2026-09-29 : son pre-controle du solde WETH et de
 *     l allowance a ete SUPPRIME, et son `eth_call` de simulation porte desormais la VALEUR. Les
 *     deux etaient donc NON MESURES par la suite : `simule: true` etait affirme par le module et
 *     prouve par rien. Le banc de fork en etait le seul temoin, et un banc n est pas un test.
 *
 * ⛔ CE QUE CE FICHIER PROUVE, ET SON PRIX : le rpc est SCRIPTE. Il ne prouve donc PAS qu un swap
 *   aboutisse — c est `banc-frais-arrive-fork.mjs` qui le fait, sur un vrai fork. Il prouve la
 *   FORME de ce qu on demande a la chaine, et c est exactement ce qui se cassait en silence.
 * ⛔ LE FAUX RPC VERIFIE SES ARGUMENTS : un faux complaisant laisse passer les mutations qui
 *   comptent, et ce depot l a deja paye deux fois.
 */
import assert from 'node:assert/strict';
import { planAchatEthAction, ESPACEMENTS_PIVOT_SONDES } from './echange-eth.js';
import { WETH_BASE } from './plan-eth-block.js';
import { USDC_BASE } from './plan-usdc-block.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';

let n = 0;
const cas = async (titre, f) => { n += 1; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const sansPrefixe = (s) => selecteur(s).replace(/^0x/, '');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => '0'.repeat(24) + String(a).replace(/^0x/, '').toLowerCase();

const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
const POOL_ACTION = '0x853f5f1b92b16714fe6cda67caad0856b83c7ab9';
const COMPTE = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const MAINTENANT = 1790625759;
const UN_DIXIEME = 10n ** 17n;
/* ⛔ DES PRIX REELS, LUS LE 2026-09-28 : un sqrtPrice invente donnerait des sorties plausibles et
 *   fausses, et c est exactement ce qu on ne verrait pas. */
const SQRT_ACTION = 52267783314573183670416926724n;
const SQRT_PIVOT = 4101408828941892267032113n;

/** Une adresse de pool pivot fabriquee a partir de son espacement — distincte pour chacun, pour
 *  qu une confusion entre deux pivots se voie au lieu de passer. */
const pivotDe = (ts) => '0x' + ('bb' + String(ts).padStart(4, '0')).padEnd(40, 'b');
const PIVOTS_FAUX = ESPACEMENTS_PIVOT_SONDES.map((t) => pivotDe(t).toLowerCase());

/** Un faux rpc qui EXIGE ce qu un vrai noeud exige, et qui JOURNALISE tout. */
function faireRpc(sur = {}) {
  const journal = [];
  const rpc = async (methode, params) => {
    const p = (params && params[0]) || {};
    const to = String(p.to || '').toLowerCase();
    const data = String(p.data || '');
    const sel = data.replace(/^0x/, '').slice(0, 8);
    journal.push({ methode, to, sel, value: p.value, from: p.from });
    /* ⛔⛔ UN VRAI NOEUD REFUSE UN `data` NON PREFIXE. Cette exigence a deja attrape six `eth_call`
     *     invalides dans ce depot — on la garde ici, sinon le faux serait plus tolerant que la
     *     chaine et masquerait la meme faute. */
    /* ⛔ LA GARDE NE VAUT QUE POUR LES METHODES QUI PORTENT UNE TRANSACTION. Ma premiere version
     *   l imposait a TOUTES : `eth_getBalance` prend une ADRESSE, pas un objet, donc l assertion
     *   jetait et le lecteur concluait « solde illisible » — le faux fabriquait le cas aveugle et le
     *   test du cas normal ne pouvait pas passer. Un faux trop severe est aussi faux qu un faux
     *   complaisant. */
    if (methode === 'eth_call' || methode === 'eth_estimateGas') {
      assert.ok(data.startsWith('0x'), methode + ' : data non prefixe : ' + data.slice(0, 12));
    }
    if (sur.jeter && sur.jeter({ to, sel, value: p.value })) throw new Error(sur.message || 'execution reverted: boom');
    /* ⛔ LE SOLDE ET LE PRIX DU GAZ : le faux doit savoir les rendre, sinon le lecteur croirait
     *   qu il n a pas pu les lire et on ne testerait que le cas aveugle. */
    if (methode === 'eth_getBalance') {
      if (sur.soldeIllisible) throw new Error('rpc down');
      /* defaut genereux : le montant plus largement de quoi payer le gaz */
      return '0x' + mot(sur.solde !== undefined ? sur.solde : 10n ** 18n);
    }
    if (methode === 'eth_gasPrice') return '0x' + mot(sur.prixGaz !== undefined ? sur.prixGaz : 10n ** 7n);
    if (methode === 'eth_estimateGas') return '0x' + mot(sur.gazUnites !== undefined ? sur.gazUnites : 500000n);
    /* la simulation : un `from` est present et le `to` est le routeur */
    if (p.from && to === ROUTEUR_AERODROME_CL.toLowerCase()) return '0x';
    if (to === POOL_ACTION) {
      if (sel === sansPrefixe('slot0()')) return '0x' + mot(SQRT_ACTION) + mot(0).repeat(6);
      if (sel === sansPrefixe('fee()')) return '0x' + mot(500);
      if (sel === sansPrefixe('tickSpacing()')) return '0x' + mot(10);
      if (sel === sansPrefixe('token0()')) return '0x' + motAdr(USDC_BASE);
      if (sel === sansPrefixe('token1()')) return '0x' + motAdr(NVDAc);
      if (sel === sansPrefixe('liquidity()')) {
        if (sur.liquidite === 'illisible') throw new Error('execution reverted');
        return '0x' + mot(sur.liquidite !== undefined ? sur.liquidite : 10n ** 15n);
      }
    }
    if (to === FACTORY_AERODROME_CL.toLowerCase() && sel === sansPrefixe('getPool(address,address,int24)')) {
      /* ⛔⛔ CE FAUX DISTINGUE LES DEUX TRIPLETS, ET SA PREMIERE VERSION NE LE FAISAIT PAS : elle
       *     ne repondait que pour les pivots, donc la provenance de la pool d ACTION echouait et le
       *     lecteur refusait — a juste titre. Un faux qui ne sait pas repondre n est pas un faux
       *     trop severe : c est un faux incomplet, et il faut le completer, pas relacher le code.
       *   ⛔ LE TROISIEME MOT EST LE tickSpacing, ET ON LE VERIFIE : une vraie factory rend
       *     l adresse NULLE pour un espacement qu elle ne connait pas. Repondre toujours la meme
       *     pool laisserait passer une confusion `fee` / `tickSpacing` — le piege le plus cher de
       *     ce chemin (mesure : `fee` 500 pour un `tickSpacing` 10). */
      const brut = data.replace(/^0x/, '');
      const j0 = '0x' + brut.slice(8 + 24, 8 + 64);
      const j1 = '0x' + brut.slice(8 + 64 + 24, 8 + 128);
      const paire = [j0.toLowerCase(), j1.toLowerCase()];
      const ts = Number(BigInt('0x' + brut.slice(8 + 128, 8 + 192)));
      const nulle = '0x' + motAdr('0x' + '0'.repeat(40));
      if (paire.includes(NVDAc) && paire.includes(USDC_BASE.toLowerCase())) {
        return ts === 10 ? '0x' + motAdr(POOL_ACTION) : nulle;
      }
      if (paire.includes(WETH_BASE.toLowerCase()) && paire.includes(USDC_BASE.toLowerCase())) {
        return ESPACEMENTS_PIVOT_SONDES.includes(ts) ? '0x' + motAdr(pivotDe(ts)) : nulle;
      }
      return nulle;
    }
    /* les pools pivot fabriquees juste au-dessus */
    if (PIVOTS_FAUX.includes(to)) {
      if (sel === sansPrefixe('slot0()')) return '0x' + mot(SQRT_PIVOT) + mot(0).repeat(6);
      if (sel === sansPrefixe('fee()')) return '0x' + mot(80);
      if (sel === sansPrefixe('token0()')) return '0x' + motAdr(WETH_BASE);
    }
    return '0x' + mot(0);
  };
  return { rpc, journal };
}
const base = { compte: COMPTE, action: NVDAc, pool: POOL_ACTION, montantWei: UN_DIXIEME,
  toleranceBps: 300, maintenantSec: MAINTENANT };

await cas('⛔⛔ UN SEUL APPEL, ET IL PORTE LA VALEUR', async () => {
  const { rpc } = faireRpc();
  const r = await planAchatEthAction({ rpc, ...base });
  assert.equal(r.etat, 'PRET', r.pourquoi || '');
  assert.equal(r.appels.length, 1, 'le chemin ETH doit tenir en UNE transaction');
  assert.equal(r.appels[0].role, 'swap');
  assert.equal(BigInt(r.appels[0].value), UN_DIXIEME, 'l appel unique ne porte pas la valeur');
  assert.equal(r.appels[0].to.toLowerCase(), ROUTEUR_AERODROME_CL.toLowerCase());
});

await cas('⛔⛔ LA SIMULATION PORTE LA VALEUR — sinon elle reverte pour la mauvaise raison', async () => {
  /* ⛔⛔ C EST LE CAS QUI MANQUAIT. Le module simulait avec `value: '0x0'` quand le chemin faisait
   *     trois transactions ; depuis que le routeur enveloppe l ETH, un `eth_call` sans valeur
   *     REVERTE — mesure sur fork : la meme transaction sans `value` rend `status 0x0`. Un ecran
   *     dirait alors « le marche refuse » sur un swap parfaitement valide. */
  const { rpc, journal } = faireRpc();
  const r = await planAchatEthAction({ rpc, ...base });
  assert.equal(r.etat, 'PRET');
  /* ⛔ ON FILTRE PAR METHODE : `eth_estimateGas` porte aussi un `from` et le meme `to`, et ma
   *   premiere version comptait les deux. Un compteur qui melange deux methodes ne dit rien. */
  const sims = journal.filter((x) => x.methode === 'eth_call' && x.from
    && x.to === ROUTEUR_AERODROME_CL.toLowerCase());
  assert.equal(sims.length, 1, 'il doit y avoir exactement une simulation `eth_call` du swap');
  assert.ok(sims[0].value, 'la simulation part SANS valeur : elle reverterait pour la mauvaise raison');
  assert.equal(BigInt(sims[0].value), UN_DIXIEME, 'la valeur simulee n est pas le montant demande');
  assert.equal(String(sims[0].from).toLowerCase(), COMPTE.toLowerCase(),
    'la simulation ne part pas du compte : un manque de fonds se lirait comme un refus de marche');
});

await cas('⛔⛔ `simule: true` EST ATTEIGNABLE SANS WETH ET SANS ALLOWANCE', async () => {
  /* ⛔⛔ AVANT LE 2026-09-29 CE RESULTAT ETAIT INATTEIGNABLE : le module exigeait un solde WETH et
   *     une allowance que personne n avait, donc il rendait toujours `simule: false`. C est
   *     precisement pourquoi `simule: true` n avait JAMAIS ete observe sur ce chemin. */
  const { rpc, journal } = faireRpc();
  const r = await planAchatEthAction({ rpc, ...base });
  assert.equal(r.simule, true, 'la simulation n est plus faite : le premier ecran ne prouve plus rien');
  /* ⛔ ET LE PRE-CONTROLE A BIEN DISPARU : aucune lecture de solde ni d allowance sur le WETH. */
  const surWeth = journal.filter((x) => x.to === WETH_BASE.toLowerCase()
    && (x.sel === sansPrefixe('balanceOf(address)') || x.sel === sansPrefixe('allowance(address,address)')));
  assert.equal(surWeth.length, 0,
    'le module lit encore le solde WETH ou l allowance : ' + JSON.stringify(surWeth)
    + ' — ce pre-controle n a plus d objet et ferait signer pour rien');
});

await cas('⛔ un refus de la chaine se distingue d un manque de fonds', async () => {
  const dur = faireRpc({ jeter: ({ to, value }) => to === ROUTEUR_AERODROME_CL.toLowerCase() && !!value,
    message: 'execution reverted: SPL' });
  const r1 = await planAchatEthAction({ rpc: dur.rpc, ...base });
  assert.equal(r1.etat, 'REFUSE');
  assert.equal(r1.sansFonds, false, 'un revert de marche ne doit pas se lire comme un manque de fonds');
  assert.match(r1.pourquoi, /chain refuses/i);

  const pauvre = faireRpc({ jeter: ({ to, value }) => to === ROUTEUR_AERODROME_CL.toLowerCase() && !!value,
    message: 'insufficient funds for gas * price + value' });
  const r2 = await planAchatEthAction({ rpc: pauvre.rpc, ...base });
  assert.equal(r2.etat, 'REFUSE');
  assert.equal(r2.sansFonds, true, 'un manque de fonds doit etre nomme comme tel');
  assert.match(r2.pourquoi, /not enough ETH/i, 'le message doit parler d ETH, plus de WETH');
});

await cas('⛔⛔ LE FRAIS SUIT LA PORTE : pool mince ⇒ AUCUN frais', async () => {
  /* ⛔ 1 000 de liquidite au tick fait un glissement enorme : c est le profil des lignes de
   *   trending nees a quelques secondes d intervalle avec ~4 000 $ de liquidite. */
  const mince = faireRpc({ liquidite: 1000n });
  const r = await planAchatEthAction({ rpc: mince.rpc, ...base });
  assert.equal(r.etat, 'PRET', r.pourquoi || '');
  assert.equal(Number(r.plan.fraisBps), 0, 'un frais est pris sur une pool trop mince');
  assert.equal(r.plan.beneficiaireFrais, null, 'un beneficiaire subsiste sur une pool trop mince');

  const profonde = faireRpc();
  const r2 = await planAchatEthAction({ rpc: profonde.rpc, ...base });
  assert.equal(Number(r2.plan.fraisBps), 10, 'le frais de 0,1 % a disparu sur une pool profonde');
  assert.equal(String(r2.plan.beneficiaireFrais).toLowerCase(), FEE_WALLET.toLowerCase());
});

await cas('⛔ la borne dit l atomicite, et non plus l inverse', async () => {
  const { rpc } = faireRpc();
  const r = await planAchatEthAction({ rpc, ...base });
  assert.match(r.borne, /One transaction/i, 'la borne ne dit plus que l achat tient en une transaction');
  assert.doesNotMatch(r.borne, /NOT one transaction/i,
    'la borne re-annonce une non-atomicite qui n existe plus : elle ferait renoncer pour rien');
  assert.doesNotMatch(r.borne, /you hold WETH/i, 'la borne parle encore d un WETH intermediaire');
  assert.match(r.borne, /accepted this exact transaction/i, 'la borne ne dit plus que la chaine a accepte');
});

await cas('⛔ `dejaFait` ne ment plus sur une verification qui n a pas lieu', async () => {
  /* ⛔⛔ IL RENDAIT `wethSuffisant: true, allowanceSuffisante: true` — deux `true` ECRITS EN DUR,
   *     presentes comme le resultat d une lecture qui n existe plus. Deux constantes ne sont pas
   *     une mesure, et un appelant les aurait lues comme un solde verifie. */
  const { rpc } = faireRpc();
  const r = await planAchatEthAction({ rpc, ...base });
  assert.equal(r.dejaFait.sansObjet, true);
  assert.equal('wethSuffisant' in r.dejaFait, false,
    'le booleen de solde est revenu : il affirmerait une lecture qui n a pas lieu');
  assert.equal('allowanceSuffisante' in r.dejaFait, false,
    'le booleen d allowance est revenu : il affirmerait une lecture qui n a pas lieu');
});

await cas('⛔⛔ LE GAZ EST VERIFIE A PART, PARCE QUE LA SIMULATION NE LE VOIT PAS', async () => {
  /* ⛔⛔ MESURE DU 2026-09-29, trois RPC Base, solde surcharge : la borne d un `eth_call` avec
   *     `value` est EXACTEMENT `solde >= value`. Avec un solde egal au montant, l appel PASSE —
   *     meme en imposant 600 000 de gaz a 1 000 Gwei, soixante fois le solde. Le gaz est donc HORS
   *     du controle, et `eth_estimateGas` sans `gasPrice` est aveugle pareil.
   *   ⛔ LA VICTIME EST NOMMEE : le revenant du rail fiat. L onramp lui vend de l ETH, il achete
   *     pour TOUT, il ne reste rien pour le gaz — et l ecran lui disait « the chain accepted this
   *     exact transaction ». */
  const richeJournal = faireRpc();
  const riche = await planAchatEthAction({ rpc: richeJournal.rpc, ...base,
    soldeWei: undefined });
  assert.equal(riche.etat, 'PRET', riche.pourquoi || '');
  assert.ok(riche.gaz, 'le plan ne dit rien du gaz');
  assert.equal(riche.gaz.verifie, true, 'le gaz n est pas verifie alors que les lectures ont abouti');
  assert.match(riche.borne, /covers the amount plus gas/i,
    'la borne ne dit plus que le solde couvre le montant ET le gaz');
  assert.doesNotMatch(riche.borne, /^.*The chain accepted this exact transaction just now\.$/,
    'la borne re-promet « the chain accepted » sans distinguer les pools du compte');

  /* ⛔ SOLDE EXACTEMENT EGAL AU MONTANT : la simulation passerait, le wallet refuserait. */
  const justeJournal = faireRpc({ solde: 10n ** 17n });
  const juste = await planAchatEthAction({ rpc: justeJournal.rpc, ...base });
  assert.equal(juste.etat, 'REFUSE', 'un solde egal au montant doit etre refuse : il ne reste rien pour le gaz');
  assert.equal(juste.sansFonds, true);
  assert.match(juste.pourquoi, /plus gas/i, 'le refus ne nomme pas le gaz');
  assert.match(juste.pourquoi, /\d{6,}/, 'le refus ne donne aucun chiffre : « pas assez » sans montant');
});

await cas('⛔⛔ UNE LECTURE DE SOLDE ILLISIBLE N INTERDIT PAS L ACHAT — elle se DIT', async () => {
  /* ⛔⛔ FERMER SUR L INCONNU A DEJA EFFACE LE PRODUIT UNE FOIS AUJOURD HUI (puces 13 -> 2). Ici la
   *     mesure du gaz sert a AVERTIR, pas a interdire : si on ne sait pas, on laisse passer et on
   *     le dit dans la borne. */
  const aveugle = faireRpc({ soldeIllisible: true });
  const r = await planAchatEthAction({ rpc: aveugle.rpc, ...base });
  assert.equal(r.etat, 'PRET', 'une lecture de solde illisible ne doit pas bloquer l achat');
  assert.equal(r.gaz.verifie, false, 'le plan pretend avoir verifie le gaz alors que la lecture a rate');
  assert.match(r.borne, /could not check/i, 'la borne ne dit pas qu on n a pas pu verifier le gaz');
  assert.doesNotMatch(r.borne, /covers the amount plus gas/i,
    'la borne affirme que le solde couvre le gaz alors qu elle ne l a pas lu');
});

console.log('✓ test-echange-eth : ' + n + ' cas');
console.log('   La valeur part DANS la simulation, le pre-controle WETH a disparu, et `simule: true`');
console.log('   est atteignable sans WETH ni allowance.');
console.log('   ⚠️ NE PROUVE PAS qu un achat aboutisse : le rpc est SCRIPTE. C est');
console.log('      `banc-frais-arrive-fork.mjs`, sur un vrai fork, qui le prouve.');
