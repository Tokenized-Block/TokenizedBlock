/* test-plan-eth-block.mjs — LE CHEMIN ETH : DEUX SAUTS, TROIS GESTES, ET UN MINIMUM PRUDENT.
 *
 * ⛔⛔ CE QUE CE FICHIER PROTEGE. Un chemin a deux sauts a DEUX endroits ou se tromper : chaque pool
 *     prend son propre `fee` sur son propre segment. Cumuler les deux frais sur l entree rendrait un
 *     minimum trop haut (des swaps valides reverteraient) ; n en deduire qu un le rendrait trop
 *     optimiste (un cadeau a qui regarde la mempool). Les deux erreurs se paient, en sens opposes.
 *
 * ⛔⛔ TOUTES LES VALEURS SONT LUES SUR LA CHAINE le 2026-09-28, et j ai DEJA fabrique un
 *     `sqrtPriceX96` dans cette session — faux d un facteur 12 627. Celles-ci viennent de
 *     `pools-pivot-weth-usdc.json` et `pools-aerodrome.json`.
 *     ⛔ TEMOIN DE SENS : les trois pools pivot cotent 1 ETH a ~2 679 USDC, a moins d un dollar
 *       pres. Une direction inversee donnerait ~0,00037 — absurde, et le test le verrait.
 *     ⚠️ ET LE `fee` DE LA POOL ts=50 A CHANGE ENTRE DEUX LECTURES LE MEME JOUR (725 puis 550) :
 *       les frais Aerodrome bougent. C est pourquoi on les LIT et qu on ne les cache jamais.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat aboutisse. Le prix spot ignore la profondeur, et deux
 *   sauts donnent deux occasions d echouer pour un seul clic.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { planEthVersAction, sortieDeuxSauts, meilleurePoolPivot, WETH_BASE, SELECTEUR_DEPOSIT } from './plan-eth-block.js';
import { sortieSpot, USDC_BASE, TOLERANCE_MAX_BPS } from './plan-usdc-block.js';
import { ROUTEUR_AERODROME_CL, SELECTEURS } from './calldata-aerodrome.js';
import { selecteur } from './pool.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* ── les trois pools pivot WETH/USDC, LUES ─────────────────────────────────────────────────── */
/* ⛔⛔ L ORDRE DE CETTE LISTE EST DELIBERE, ET IL VIENT D UNE MUTATION QUI PASSAIT. La pool qui rend
 *     le PLUS (tickSpacing 1, fee 80) etait EN PREMIER : « prendre le premier » et « prendre le
 *     meilleur » coincidaient, donc remplacer le choix par `candidates[0]` ne se voyait pas.
 *     ⇒ La meilleure est desormais en DERNIER. L ordre des donnees d un test peut le rendre aveugle,
 *       et c est au test de s en proteger. */
const PIVOTS = [
  { pool: '0x493e74eda2720e127baccc1a19b2d567bc14ab43', tickSpacing: 10, fee: 500, wethEst0: true,
    sqrtPriceX96: '4102067387922704494368960' },
  { pool: '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a', tickSpacing: 50, fee: 550, wethEst0: true,
    sqrtPriceX96: '4101598917909346791088713' },
  { pool: '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd', tickSpacing: 1, fee: 80, wethEst0: true,
    sqrtPriceX96: '4101408828941892267032113' },
];
/* ── la pool de l action : NVDAc / USDC sur Aerodrome, LUE ──────────────────────────────────── */
const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
const POOL_ACTION = { pool: '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9', tickSpacing: 10, fee: 500,
  actionEst0: false, sqrtPriceX96: '52267783314573183670416926724' };
const RECIPIENT = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const MAINTENANT = 1790625759n;
const DEADLINE = MAINTENANT + 300n;
const UN_ETH = 10n ** 18n;
const base = { action: NVDAc, montantWei: UN_ETH, poolAction: POOL_ACTION, poolsPivot: PIVOTS,
  recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };

cas('⛔ WETH vient du depot, et `deposit()` est le selecteur mesure', () => {
  assert.equal(WETH_BASE.toLowerCase(), '0x4200000000000000000000000000000000000006');
  /* ⛔ LE SELECTEUR EST RECALCULE : un selecteur nu est un nombre magique.
   * ⛔⛔ ET IL DOIT ETRE PREFIXE `0x` : `selecteur()` rend HUIT caracteres hex SANS prefixe, alors
   *     qu un `data` de transaction en exige un. C est cette meme inconsistance qui avait produit six
   *     `eth_call` invalides dans `echange-v3.js`. Ici la constante est prefixee — et le test exige
   *     LES DEUX : la bonne valeur, et le prefixe. */
  assert.equal(SELECTEUR_DEPOSIT, '0x' + selecteur('deposit()').replace(/^0x/, ''));
  assert.ok(SELECTEUR_DEPOSIT.startsWith('0x'), 'un data de transaction doit etre prefixe');
  assert.notEqual(SELECTEUR_DEPOSIT.replace(/^0x/, ''), selecteur('withdraw(uint256)').replace(/^0x/, ''));
});

cas('⛔⛔ LE SENS : 1 ETH vaut ~2 679 USDC par chacune des trois pools', () => {
  /* ⛔ LE TEMOIN QUI PROUVE LA DIVISION. Inverser donnerait ~0,00037 USDC — absurde. Et la borne est
   *   serree (5 %), donc une erreur de facteur 6 comme celle des pools Uniswap casserait aussi. */
  for (const p of PIVOTS) {
    const apres = (UN_ETH * (1000000n - BigInt(p.fee))) / 1000000n;
    const usdc = sortieSpot({ entree: apres, sqrtPriceX96: p.sqrtPriceX96, entreeEst0: p.wethEst0 });
    const enDollars = Number(usdc) / 1e6;
    assert.ok(Math.abs(enDollars - 2679) / 2679 < 0.05,
      'pool ts=' + p.tickSpacing + ' : 1 ETH -> ' + enDollars.toFixed(2) + ' USDC, attendu ~2679');
  }
});

cas('⛔⛔ CHAQUE POOL PREND SON FEE SUR SON PROPRE SEGMENT', () => {
  /* ⛔⛔ LE CŒUR DU FICHIER. On recalcule a la main, segment par segment, et on exige l EGALITE
   *     EXACTE. Cumuler les deux frais sur l entree, ou n en deduire qu un, casse ici. */
  const p = PIVOTS[1];
  const saut2 = { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: !POOL_ACTION.actionEst0 };
  const r = sortieDeuxSauts({ entree: UN_ETH, saut1: { ...p, entreeEst0: p.wethEst0 }, saut2 });
  assert.ok(r, 'le calcul a deux sauts doit aboutir');
  /* segment 1 : fee du pivot sur l ETH */
  const apres1 = (UN_ETH * (1000000n - BigInt(p.fee))) / 1000000n;
  const usdc = sortieSpot({ entree: apres1, sqrtPriceX96: p.sqrtPriceX96, entreeEst0: true });
  assert.equal(r.intermediaire, usdc, 'l intermediaire ne correspond pas au premier segment');
  /* segment 2 : fee de la pool d action sur l USDC REELLEMENT rendu, pas sur l ETH */
  const apres2 = (usdc * (1000000n - BigInt(POOL_ACTION.fee))) / 1000000n;
  const attendu = sortieSpot({ entree: apres2, sqrtPriceX96: POOL_ACTION.sqrtPriceX96, entreeEst0: true });
  assert.equal(r.sortie, attendu, 'la sortie ne correspond pas au second segment');
  /* ⛔ ET LE TEMOIN QUI DISTINGUE : cumuler les deux frais d un coup donne un AUTRE nombre */
  const cumule = (UN_ETH * (1000000n - BigInt(p.fee) - BigInt(POOL_ACTION.fee))) / 1000000n;
  const faux = sortieSpot({ entree: sortieSpot({ entree: cumule, sqrtPriceX96: p.sqrtPriceX96, entreeEst0: true }),
    sqrtPriceX96: POOL_ACTION.sqrtPriceX96, entreeEst0: true });
  assert.notEqual(r.sortie, faux, 'cumuler les frais sur l entree donne le meme resultat : suspect');
});

cas('⛔⛔ LE PIVOT EST CHOISI PAR DEVIS, PAS PAR `liquidity()`', () => {
  /* ⛔⛔ `liquidity()` est un uint128 brut : comparable entre pools du MEME couple, mais ce n est pas
   *     une profondeur en dollars et ca ne dit pas ce qu un montant DONNE ressortira. On calcule la
   *     sortie par chacune et on garde la meilleure. */
  const saut2 = { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: !POOL_ACTION.actionEst0 };
  const cands = PIVOTS.map((p) => ({ ...p, entreeEst0: p.wethEst0 }));
  const choisi = meilleurePoolPivot({ entree: UN_ETH, candidates: cands, saut2 });
  assert.ok(choisi, 'un pivot doit etre choisi');
  /* ⛔ LE CHOIX DOIT ETRE LE MAXIMUM, verifie a la main sur les trois */
  const toutes = cands.map((c) => ({ pool: c.pool, sortie: sortieDeuxSauts({ entree: UN_ETH, saut1: c, saut2 }).sortie }));
  const max = toutes.reduce((a, b) => (b.sortie > a.sortie ? b : a));
  assert.equal(choisi.pivot.pool, max.pool, 'le pivot choisi n est pas celui qui rend le plus');
  /* ⛔ ET LE PLUS FAIBLE FEE GAGNE ICI : ts=1 / fee=80. Si ce n etait pas le cas, le devis mentirait. */
  assert.equal(choisi.pivot.fee, 80, 'a prix quasi egal, le fee le plus faible doit gagner');
  /* ⛔⛔ ET LE GAGNANT N EST PAS LE PREMIER DE LA LISTE — la mutation « prendre le premier » doit
   *     casser. Sans cette assertion, l ordre des donnees rendait le test aveugle. */
  assert.notEqual(choisi.pivot.pool, cands[0].pool,
    'le pivot choisi est le premier de la liste : le test ne distingue plus « meilleur » de « premier »');
  assert.equal(choisi.pivot.pool, cands[cands.length - 1].pool, 'le meilleur est le dernier ici');
  /* ⛔ ET SA SORTIE EST STRICTEMENT SUPERIEURE AUX DEUX AUTRES */
  for (const c of cands.slice(0, -1)) {
    assert.ok(choisi.sortie > sortieDeuxSauts({ entree: UN_ETH, saut1: c, saut2 }).sortie,
      'le choisi ne rend pas plus que ' + c.pool);
  }
  /* le plan doit dire COMBIEN de pivots ont ete compares : sans ce chiffre, « la meilleure » est
   * une affirmation et pas une mesure */
  const plan = planEthVersAction(base);
  assert.equal(plan.pivotsCompares, 3);
  assert.equal(plan.pivot, max.pool.toLowerCase());
});

cas('⛔⛔ TROIS APPELS, DANS L ORDRE, ET LA VALEUR NE PART QU AU PREMIER', () => {
  const r = planEthVersAction(base);
  assert.equal(r.etat, 'PRET', r.pourquoi || '');
  assert.equal(r.appels.length, 3);
  assert.deepEqual(r.appels.map((a) => a.role), ['wrap', 'approve', 'swap']);
  /* ⛔ `deposit()` prend l ETH en `msg.value` : la valeur part LA, et nulle part ailleurs. */
  assert.equal(r.appels[0].to, WETH_BASE.toLowerCase());
  assert.equal(r.appels[0].data, SELECTEUR_DEPOSIT);
  assert.equal(BigInt(r.appels[0].value), UN_ETH);
  /* ⛔ les deux suivants echangent des ERC-20 : aucune valeur, sinon elle resterait sur le contrat */
  assert.equal(r.appels[1].value, '0x0');
  assert.equal(r.appels[2].value, '0x0');
  /* ⛔ l approbation porte sur le WETH et vise le routeur AERODROME */
  assert.equal(r.appels[1].to, WETH_BASE.toLowerCase());
  assert.ok(r.appels[1].data.toLowerCase().includes(ROUTEUR_AERODROME_CL.replace(/^0x/, '').toLowerCase()));
  /* ⛔ le swap part vers le routeur Aerodrome avec le selecteur `exactInput` */
  assert.equal(r.appels[2].to.toLowerCase(), ROUTEUR_AERODROME_CL.toLowerCase());
  assert.ok(r.appels[2].data.startsWith(SELECTEURS.exactInput));
  /* ⛔⛔ LES TROIS `data` DOIVENT ETRE PREFIXES `0x`, ET LES TROIS `to` AUSSI. Un `data` non prefixe
   *     est refuse par un vrai noeud, et cette faute exacte a deja produit six `eth_call` invalides
   *     dans `echange-v3.js` — trouvee par un test, pas par une relecture. */
  for (const a of r.appels) {
    assert.ok(a.data.startsWith('0x'), a.role + ' : data non prefixe (' + a.data.slice(0, 12) + '…)');
    assert.ok(/^0x[0-9a-f]{40}$/.test(a.to), a.role + ' : destinataire mal forme (' + a.to + ')');
    assert.ok(a.value.startsWith('0x'), a.role + ' : value non prefixee');
    assert.ok(a.nom && a.nom.length > 8, a.role + ' : le geste n est pas nomme pour l ecran');
  }
});

cas('⛔⛔ LA BORNE DIT LA NON-ATOMICITE ET LE GLISSEMENT CUMULE', () => {
  /* ⛔⛔ Qui s arrete apres le premier geste detient du WETH. Ce n est pas une perte, mais c est un
   *     etat inattendu, et le taire serait la vraie faute. */
  const r = planEthVersAction(base);
  assert.match(r.borne, /NOT one transaction/i, 'la borne ne dit plus que les trois gestes sont separes');
  assert.match(r.borne, /you hold WETH/i, 'la borne ne dit plus ce qu on detient si on s arrete');
  assert.match(r.borne, /converts back/i, 'la borne ne dit plus que le WETH est reversible');
  assert.match(r.borne, /slippage adds up/i, 'la borne ne dit plus que le glissement s accumule');
  assert.match(r.borne, /final block only/i, 'la borne ne dit plus sur quoi porte le minimum');
  assert.match(r.borne, /not from a depth simulation/i);
  assert.equal(r.aSimuler, true);
});

cas('⛔ le chemin encode fait 66 octets : WETH -> USDC -> action', () => {
  const r = planEthVersAction(base);
  /* les deux tickSpacings sont RENDUS separement, et ils viennent de DEUX pools differentes */
  assert.equal(r.tickSpacingPivot, 1, 'le pivot choisi est celui a tickSpacing 1');
  assert.equal(r.tickSpacingAction, 10, 'la pool NVDAc est a tickSpacing 10');
  /* ⛔ les deux jetons du milieu et les deux espacements doivent etre dans le calldata */
  const d = r.appels[2].data.toLowerCase();
  assert.ok(d.includes(WETH_BASE.replace(/^0x/, '').toLowerCase()), 'WETH absent du chemin');
  assert.ok(d.includes(USDC_BASE.replace(/^0x/, '').toLowerCase()), 'USDC absent du chemin');
  assert.ok(d.includes(NVDAc.replace(/^0x/, '').toLowerCase()), 'l action est absente du chemin');
  /* longueur du chemin : 0x42 = 66 */
  assert.ok(d.includes('0000000000000000000000000000000000000000000000000000000000000042'),
    'le chemin ne fait pas 66 octets (20 + 23 + 23)');
});

cas('⛔ le minimum suit la tolerance, et le plafond tient', () => {
  const strict = planEthVersAction({ ...base, toleranceBps: 0 });
  assert.equal(BigInt(strict.minSortie), BigInt(strict.sortieAttendue));
  const large = planEthVersAction({ ...base, toleranceBps: 500 });
  assert.equal(BigInt(large.minSortie), (BigInt(large.sortieAttendue) * 9500n) / 10000n);
  assert.equal(planEthVersAction({ ...base, toleranceBps: Number(TOLERANCE_MAX_BPS) + 1 }).etat, 'REFUSE');
  assert.equal(planEthVersAction({ ...base, toleranceBps: Number(TOLERANCE_MAX_BPS) }).etat, 'PRET');
  assert.equal(planEthVersAction({ ...base, toleranceBps: -1 }).etat, 'REFUSE');
});

cas('⛔ les lectures manquantes sont refusees, jamais devinees', () => {
  /* ⛔ `actionEst0` et les deux `tickSpacing` doivent etre LUS. Un defaut viserait une pool
   *   inexistante — et `tickSpacing` n est PAS le `fee` (ts 10 -> fee 500). */
  for (const v of [undefined, null, 0, 1, 'false']) {
    assert.equal(planEthVersAction({ ...base, poolAction: { ...POOL_ACTION, actionEst0: v } }).etat, 'REFUSE');
  }
  for (const ts of [undefined, null, 0, -1]) {
    const r = planEthVersAction({ ...base, poolAction: { ...POOL_ACTION, tickSpacing: ts } });
    assert.equal(r.etat, 'REFUSE');
    /* ⛔⛔ ON EXIGE LE MESSAGE DE CETTE COUCHE, PAS D UNE AUTRE. Une mutation retirant cette garde
     *     PASSAIT : `calldataExactInputCL` refuse aussi, et son message contient les memes mots
     *     « NOT its fee ». La defense en profondeur tenait, mais le test ne savait pas QUI avait
     *     parle — il ne protegeait donc pas la garde qu il croyait. */
    assert.match(r.pourquoi, /the action pool needs its tickSpacing/i,
      'ce n est pas le PLAN qui refuse : le message vient de la couche basse');
  }
  /* ⛔ une pool d action non resolue est refusee */
  for (const p of [undefined, null, {}, { pool: '0x12' }]) {
    assert.equal(planEthVersAction({ ...base, poolAction: p }).etat, 'REFUSE');
  }
  /* ⛔ AUCUN PIVOT = REFUS, avec un message qui dit qu il y en a trois de mesurees */
  const sansPivot = planEthVersAction({ ...base, poolsPivot: [] });
  assert.equal(sansPivot.etat, 'REFUSE');
  assert.match(sansPivot.pourquoi, /three were measured/i);
  /* ⛔ des pivots mal formes sont ecartes, et s il n en reste aucun on refuse */
  assert.equal(planEthVersAction({ ...base, poolsPivot: [{ pool: 'x' }, { wethEst0: true }] }).etat, 'REFUSE');
});

cas('⛔ l action ne peut pas etre le pivot ni le WETH', () => {
  /* ⛔ Un chemin qui boucle sur lui-meme serait accepte par l encodeur et refuse par la chaine. */
  assert.equal(planEthVersAction({ ...base, action: USDC_BASE }).etat, 'REFUSE');
  assert.equal(planEthVersAction({ ...base, action: WETH_BASE }).etat, 'REFUSE');
  for (const a of ['', '0x', 'pas-une-adresse']) {
    assert.equal(planEthVersAction({ ...base, action: a }).etat, 'REFUSE');
  }
});

cas('⛔ un montant trop petit est refuse, en nommant le MONTANT', () => {
  const r = planEthVersAction({ ...base, montantWei: 1n, toleranceBps: 0 });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /amount/i);
  assert.ok(!/toleran/i.test(r.pourquoi), 'le refus parle de tolerance : mauvais reglage suggere');
  for (const m of [0, 0n, -1, null, undefined]) {
    assert.equal(planEthVersAction({ ...base, montantWei: m }).etat, 'REFUSE');
  }
});

cas('⛔⛔ LA SORTIE DU PLAN EST CELLE DU BON SENS DES DEUX POOLS', () => {
  /* ⛔⛔ UNE MUTATION PASSAIT : inverser le sens du SECOND saut (`entreeEst0: actionEst0` au lieu de
   *     `!actionEst0`). Mon test du calcul passait `saut2` explicitement, donc il n exercait pas la
   *     DERIVATION faite par le planificateur. On compare desormais sa sortie a un calcul a la main
   *     avec le sens CORRECT — et on verifie que le sens inverse donnerait autre chose. */
  const r = planEthVersAction({ ...base, toleranceBps: 0 });
  assert.equal(r.etat, 'PRET');
  const pivot = PIVOTS.find((p) => p.pool === r.pivot);
  assert.ok(pivot, 'le pivot rendu doit etre l une des pools fournies');
  const juste = sortieDeuxSauts({ entree: UN_ETH,
    saut1: { ...pivot, entreeEst0: pivot.wethEst0 },
    saut2: { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: !POOL_ACTION.actionEst0 } });
  assert.equal(BigInt(r.sortieAttendue), juste.sortie, 'la sortie du plan ne suit pas le bon sens');
  assert.equal(BigInt(r.usdcIntermediaire), juste.intermediaire, 'l intermediaire USDC ne correspond pas');
  /* ⛔ ET LE SENS INVERSE DONNE UN AUTRE NOMBRE : sinon la derivation serait decorative. */
  const inverse = sortieDeuxSauts({ entree: UN_ETH,
    saut1: { ...pivot, entreeEst0: pivot.wethEst0 },
    saut2: { sqrtPriceX96: POOL_ACTION.sqrtPriceX96, fee: POOL_ACTION.fee, entreeEst0: POOL_ACTION.actionEst0 } });
  if (inverse) {
    assert.notEqual(juste.sortie, inverse.sortie, 'les deux sens donnent le meme resultat : suspect');
  }
  /* ⛔⛔ LE MINIMUM NUL EST REFUSE PAR LE PLAN, AVEC SON MESSAGE — ET SANS CONDITION.
   *     Ma premiere version enveloppait cette assertion dans un `if (etat === 'REFUSE')` : quand la
   *     garde etait retiree, le plan atteignait PRET et le `if` sautait l assertion. Une assertion
   *     conditionnelle ne verifie que ce qui arrive deja.
   *   ⛔ 2 000 000 000 wei, ET CE CHIFFRE EST MESURE : a ce montant la sortie spot vaut EXACTEMENT 1
   *     (tolerance 0), donc 10 % de tolerance l ecrase a 0. En dessous, c est le devis qui refuse ;
   *     au-dessus, le minimum reste positif. La garde n est atteignable QUE la. */
  const ecrase = planEthVersAction({ ...base, montantWei: 2000000000n, toleranceBps: Number(TOLERANCE_MAX_BPS) });
  assert.equal(ecrase.etat, 'REFUSE', 'le minimum ecrase a zero doit etre refuse');
  assert.match(ecrase.pourquoi, /both pool fees and your tolerance/i,
    'ce n est pas le PLAN qui refuse : son message nomme les DEUX frais, la couche basse ne parle '
    + 'que du minimum');
  assert.match(ecrase.pourquoi, /raise the amount/i, 'le refus doit dire quoi corriger');
  /* temoin positif : un cran au-dessus, le plan passe — sinon la garde refuserait tout */
  assert.equal(planEthVersAction({ ...base, montantWei: 5000000000n,
    toleranceBps: Number(TOLERANCE_MAX_BPS) }).etat, 'PRET');
});

cas('⛔⛔ LE FRAIS D INTERFACE EST PORTE PAR LE CHEMIN ETH', () => {
  /* ⛔⛔ MEME RAISON QUE COTE USDC : une mutation coupant le frais dans ce planificateur ne cassait
   *     RIEN. Un frais desactive en silence ne se voit qu en comptant des revenus qui n arrivent
   *     pas — c est le defaut le plus cher a decouvrir tard. */
  const FEE = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
  const sans = planEthVersAction(base);
  const avec = planEthVersAction({ ...base, beneficiaireFrais: FEE });
  assert.equal(sans.etat, 'PRET'); assert.equal(avec.etat, 'PRET');
  assert.equal(sans.fraisBps, 0, 'un frais s applique sans beneficiaire : il serait cache');
  assert.equal(avec.fraisBps, 10, 'le frais doit valoir 10 bps (0,1 %)');
  assert.equal(avec.beneficiaireFrais, FEE);
  assert.ok(BigInt(avec.minUtilisateur) < BigInt(avec.minSortie), 'le minimum utilisateur doit baisser');
  assert.equal(BigInt(avec.minUtilisateur), (BigInt(avec.minSortie) * 9990n) / 10000n);
  /* ⛔ LE TROISIEME APPEL (le swap) CHANGE, les deux premiers NON : envelopper et autoriser ne
   *   dependent pas du frais, et les voir changer signalerait une confusion. */
  assert.notEqual(sans.appels[2].data, avec.appels[2].data, 'le swap est identique : le frais ne part pas');
  assert.equal(sans.appels[0].data, avec.appels[0].data, 'l enveloppement ne doit pas dependre du frais');
  assert.equal(sans.appels[1].data, avec.appels[1].data, 'l approbation ne doit pas dependre du frais');
  assert.ok(avec.appels[2].data.toLowerCase().includes(FEE.replace(/^0x/, '')),
    'le wallet de frais n est pas dans le calldata du swap');
  /* ⛔ ET LA RETENUE EST DITE DANS LA BORNE, en chiffres. */
  assert.match(avec.borne, /keeps 0\.10%/i, 'la borne ne dit plus combien on retient');
});

cas('⛔ le module reste PUR, et les montants sortent en chaines exactes', () => {
  const src = readFileSync(new URL('./plan-eth-block.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['fetch(', 'Date.now', 'new Date', 'Math.random', 'eth_sendTransaction',
    'wallet_sendCalls', 'personal_sign', 'document']) {
    assert.ok(!src.includes(interdit), 'plan-eth-block.js contient ' + interdit);
  }
  const r = planEthVersAction(base);
  for (const champ of ['montantWei', 'usdcIntermediaire', 'sortieAttendue', 'minSortie']) {
    assert.equal(typeof r[champ], 'string', champ + ' doit sortir en chaine exacte');
    assert.match(r[champ], /^[0-9]+$/);
  }
  /* ⛔ ET `sortieDeuxSauts` N UTILISE PAS Number : borne a SA fonction. */
  const i = src.indexOf('export function sortieDeuxSauts');
  assert.ok(!src.slice(i, src.indexOf('\n}', i)).includes('Number('),
    'sortieDeuxSauts utilise Number : le calcul doit rester en entiers');
});

assert.equal(n, 14, 'compte de cas inattendu : ' + n);
console.log('✓ test-plan-eth-block : ' + n + ' cas');
console.log('   Trois pools pivot REELLES (1 ETH ~ 2 679 USDC) ; chaque fee sur son propre segment.');
console.log('   ⚠️ NE PROUVE PAS qu un achat aboutisse : deux sauts, deux occasions d echouer.');
