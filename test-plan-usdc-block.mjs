/* test-plan-usdc-block.mjs — LE CALCUL QUI BORNE L ARGENT, SUR LES TROIS VRAIES POOLS.
 *
 * ⛔⛔ CE QUE CE FICHIER PROTEGE. `minSortie` est la SEULE chose que la transaction impose. Trop bas,
 *     l echange devient un cadeau a qui regarde la mempool ; trop haut, des swaps valides revertent
 *     apres avoir brule du gas. Et le sens de la division decide d un facteur enorme : se tromper
 *     rend un prix qui est exactement son propre inverse — plausible, et faux.
 *
 * ⛔⛔ LES TROIS POOLS SONT LUES SUR LA CHAINE, PAS INVENTEES (2026-09-28) :
 *       Micron  fee=10000  blockEst0=false  dec=8  sqrt=24536918604096807031392936937   -> ~$1053
 *       Amazon  fee=10000  blockEst0=false  dec=8  sqrt=50319545420281757870299458175   ->  ~$250
 *       SpaceX  fee=10000  blockEst0=false  dec=8  sqrt=65242800116692165469001967838   ->  ~$149
 *     ⛔ L ORDRE DE GRANDEUR EST LE TEMOIN DU SENS : AMZN a ~250 $ est credible.
 *     ⛔⛔ ET J AI CORRIGE MA PROPRE AFFIRMATION ICI. J avais ecrit qu une direction inversee donnerait
 *       « un facteur 60 000 ». C EST FAUX, mesure : le facteur reel est ~6. En unites de base, les
 *       SIX decimales de l USDC et les HUIT du block annulent presque le ratio de prix, donc les deux
 *       sens tombent dans le meme ordre de grandeur.
 *       ⇒ CA REND LE BUG DE DIRECTION PLUS DANGEREUX, PAS MOINS : une erreur de 6x se remarque bien
 *         moins qu une de 60 000x. Ce qui l attrape n est donc pas « l absurdite » mais la borne
 *         SERREE a 5 % du prix mesure — 6x donnerait 40 $ au lieu de 250 $, et elle casse.
 *     ⛔ ET LE `fee` EST 10000, PAS 3000 : la transaction temoin de `calldata-v3.js` utilisait 3000.
 *       Reutiliser ce chiffre aurait fait reverter les trois APRES signature.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un swap aboutisse. Le prix spot n est pas une simulation de
 *   profondeur ; un gros montant sortira MOINS. L appelant doit simuler la transaction exacte.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { planUsdcVersBlock, sortieSpot, USDC_BASE, TOLERANCE_MAX_BPS } from './plan-usdc-block.js';
import { calldataV3ExactIn } from './calldata-v3.js';
import { USDC_BASE as USDC_DU_DEPOT } from './prix-eth.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* ── les trois pools, lues sur la chaine le 2026-09-28 ──────────────────────────────────────── */
const POOLS = [
  { sym: 'MUc', block: '0xb200000000000000000000fd2f87532b90095211', pool: '0x8fAc72F692B6fA8ebc54806563883fB3265130aA',
    sqrtPriceX96: '24536918604096807031392936937', fee: 10000, blockEst0: false, decBlock: 8, prixAttenduUsd: 1053 },
  { sym: 'AMZNc', block: '0xb200000000000000000000d9192b6b456483c2e8', pool: '0x7F030e5fD657795C0937a3e8af2929Fd90DA91C7',
    sqrtPriceX96: '50319545420281757870299458175', fee: 10000, blockEst0: false, decBlock: 8, prixAttenduUsd: 250 },
  { sym: 'SPCXc', block: '0xb2000000000000000000007b9fcbd005511acbd5', pool: '0x127a12FC0953ab2ab89558c67Ba6D597D7140431',
    sqrtPriceX96: '65242800116692165469001967838', fee: 10000, blockEst0: false, decBlock: 8, prixAttenduUsd: 149 },
];
const RECIPIENT = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const MAINTENANT = 1790604967n;
const DEADLINE = MAINTENANT + 300n;
const CENT_USDC = 100000000n;   /* 100 USDC, six decimales */

cas('⛔ USDC vient du depot, pas de ma memoire', () => {
  /* ⛔ Deux adresses d USDC qui divergent enverraient l argent au mauvais jeton. */
  assert.equal(USDC_BASE.toLowerCase(), String(USDC_DU_DEPOT).toLowerCase(),
    'l adresse USDC diverge de celle de prix-eth.js');
});

cas('⛔⛔ LE SENS : l ordre de grandeur du prix derive est credible sur les trois pools', () => {
  for (const p of POOLS) {
    const r = planUsdcVersBlock({ ...p, montantUsdc: CENT_USDC, toleranceBps: 0,
      recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT });
    assert.equal(r.etat, 'PRET', p.sym + ' : ' + (r.pourquoi || ''));
    /* 100 USDC, frais 1 % -> 99 USDC utiles ; prix = 99 / (blocks recus) */
    const blocks = Number(BigInt(r.sortieAttendue)) / 10 ** p.decBlock;
    const prix = 99 / blocks;
    /* ⛔ A 5 % PRES DU PRIX MESURE. Une direction inversee donnerait un facteur ~60 000 sur AMZNc :
     *   cette borne-la est large pour l arrondi et impitoyable pour le sens. */
    assert.ok(Math.abs(prix - p.prixAttenduUsd) / p.prixAttenduUsd < 0.05,
      p.sym + ' : prix derive ' + prix.toFixed(2) + ' $, mesure ' + p.prixAttenduUsd + ' $ — '
      + 'la division est peut-etre du mauvais cote');
  }
});

cas('⛔⛔ INVERSER `blockEst0` change le resultat d un facteur enorme', () => {
  /* ⛔ Si ce drapeau etait decoratif, le test precedent passerait par accident. On prouve qu il
   *   pilote vraiment la division. */
  const p = POOLS[1];
  const juste = planUsdcVersBlock({ ...p, montantUsdc: CENT_USDC, toleranceBps: 0,
    recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT });
  const faux = planUsdcVersBlock({ ...p, blockEst0: true, montantUsdc: CENT_USDC, toleranceBps: 0,
    recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT });
  assert.equal(juste.etat, 'PRET');
  /* ⛔⛔ LE SEUIL EST MESURE, PAS SUPPOSE. J avais exige un facteur > 1000 : le test a casse, et il
   *     avait RAISON contre moi. Le rapport reel sur AMZNc est ~6,1 — c est `1 / ratio^2` avec un
   *     ratio proche de 0,4 en unites de base. Un seuil invente aurait fait passer ce cas pour un
   *     defaut du module alors que c etait mon attente qui etait fausse.
   *   ⛔ ON EXIGE DONC > 3 : assez pour prouver que le drapeau PILOTE la division, et honnete sur
   *     l ampleur reelle. C est la borne a 5 % du cas precedent qui attrape l erreur, pas celle-ci. */
  if (faux.etat === 'PRET') {
    const rapport = Number(BigInt(faux.sortieAttendue)) / Number(BigInt(juste.sortieAttendue));
    assert.ok(rapport > 3 || rapport < 1 / 3,
      'inverser blockEst0 ne change presque rien (rapport ' + rapport.toFixed(2)
      + ') : le drapeau ne pilote pas la division');
  }
});

cas('⛔⛔ LES FRAIS SE PRELEVENT SUR L ENTREE, pas sur la sortie', () => {
  const p = POOLS[0];
  const avec = planUsdcVersBlock({ ...p, montantUsdc: CENT_USDC, toleranceBps: 0,
    recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT });
  /* la meme pool a frais quasi nuls doit rendre PLUS, dans le rapport exact des entrees utiles */
  const sansFrais = planUsdcVersBlock({ ...p, fee: 1, montantUsdc: CENT_USDC, toleranceBps: 0,
    recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT });
  assert.equal(avec.etat, 'PRET'); assert.equal(sansFrais.etat, 'PRET');
  const attendu = sortieSpot({ entree: (CENT_USDC * 990000n) / 1000000n,
    sqrtPriceX96: p.sqrtPriceX96, entreeEst0: true });
  /* ⛔ EGALITE EXACTE avec le calcul en entiers : si les frais partaient de la sortie, ce test casse. */
  assert.equal(BigInt(avec.sortieAttendue), attendu,
    'la sortie ne correspond pas a une entree reduite de 1 % : les frais sont peut-etre du mauvais cote');
  assert.ok(BigInt(sansFrais.sortieAttendue) > BigInt(avec.sortieAttendue),
    'des frais plus faibles doivent rendre plus');
});

cas('⛔ le calcul est en ENTIERS et arrondit VERS LE BAS', () => {
  /* ⛔ Un arrondi vers le haut rendrait le minimum OPTIMISTE, donc ferait reverter des swaps
   *   valides. On verifie sur une valeur choisie pour tomber entre deux entiers. */
  const s = 1n << 96n;   /* sqrt = 2^96 => ratio 1:1 exactement */
  assert.equal(sortieSpot({ entree: 1000n, sqrtPriceX96: s, entreeEst0: true }), 1000n);
  assert.equal(sortieSpot({ entree: 1000n, sqrtPriceX96: s, entreeEst0: false }), 1000n);
  /* ratio 1:4 (sqrt = 2 x 2^96) : entree token0 -> sortie x4 ; token1 -> /4, arrondi bas */
  const s2 = 2n * (1n << 96n);
  assert.equal(sortieSpot({ entree: 1000n, sqrtPriceX96: s2, entreeEst0: true }), 4000n);
  assert.equal(sortieSpot({ entree: 1001n, sqrtPriceX96: s2, entreeEst0: false }), 250n,
    '1001 / 4 doit donner 250, jamais 251');
  /* ⛔ AUCUN FLOTTANT : une valeur enorme doit rester exacte, la ou un `Number` perdrait des bits. */
  const enorme = 10n ** 30n;
  assert.equal(sortieSpot({ entree: enorme, sqrtPriceX96: s, entreeEst0: true }), enorme);
  /* entrees invalides : null, jamais NaN ni zero silencieux */
  for (const mauvaise of [0n, -1n, null, undefined, 'abc']) {
    assert.equal(sortieSpot({ entree: mauvaise, sqrtPriceX96: s, entreeEst0: true }), null);
    assert.equal(sortieSpot({ entree: 1000n, sqrtPriceX96: mauvaise, entreeEst0: true }), null);
  }
});

cas('⛔ la tolerance abaisse le minimum, et elle est PLAFONNEE', () => {
  const p = POOLS[0];
  const base = { ...p, montantUsdc: CENT_USDC, recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };
  const strict = planUsdcVersBlock({ ...base, toleranceBps: 0 });
  const large = planUsdcVersBlock({ ...base, toleranceBps: 500 });
  assert.equal(BigInt(strict.minSortie), BigInt(strict.sortieAttendue), 'sans tolerance, minimum = attendu');
  assert.ok(BigInt(large.minSortie) < BigInt(strict.minSortie), 'la tolerance doit abaisser le minimum');
  /* 5 % pile : le minimum vaut 95 % de l attendu, a l arrondi entier pres */
  assert.equal(BigInt(large.minSortie), (BigInt(large.sortieAttendue) * 9500n) / 10000n);
  /* ⛔⛔ AU-DELA DU PLAFOND, LE MINIMUM NE BORNE PLUS RIEN : refuse. */
  /* ⛔ `Number(...) + 1n` melangeait Number et BigInt et jetait un TypeError : mon test a casse pour
   *   sa propre faute, pas pour celle du module. Le plafond se franchit en entiers JS. */
  const trop = planUsdcVersBlock({ ...base, toleranceBps: Number(TOLERANCE_MAX_BPS) + 1 });
  assert.equal(trop.etat, 'REFUSE');
  assert.match(trop.pourquoi, /stops bounding/i);
  /* temoin positif a la borne exacte */
  assert.equal(planUsdcVersBlock({ ...base, toleranceBps: Number(TOLERANCE_MAX_BPS) }).etat, 'PRET');
  assert.equal(planUsdcVersBlock({ ...base, toleranceBps: -1 }).etat, 'REFUSE');
});

cas('⛔⛔ le `fee` est EXIGE et jamais propose par defaut', () => {
  const p = POOLS[0];
  const base = { ...p, montantUsdc: CENT_USDC, recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };
  for (const fee of [undefined, null, 0, -1, 1000000, 2000000, 'abc']) {
    const r = planUsdcVersBlock({ ...base, fee });
    assert.equal(r.etat, 'REFUSE', 'fee=' + String(fee) + ' doit etre refuse');
    assert.match(r.pourquoi, /read from the pool/i);
  }
  /* ⛔ ET LE MESSAGE NOMME LE PIEGE REEL : 10000 et non 3000. */
  assert.match(planUsdcVersBlock({ ...base, fee: 0 }).pourquoi, /10000, not 3000/i);
  /* le fee mesure passe, et se retrouve dans le plan */
  assert.equal(planUsdcVersBlock(base).fee, 10000);
});

cas('⛔ la pool doit etre RESOLUE, et le sens LU', () => {
  const p = POOLS[0];
  const base = { ...p, montantUsdc: CENT_USDC, recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };
  for (const pool of [undefined, null, '', '0x', 'pas-une-adresse']) {
    const r = planUsdcVersBlock({ ...base, pool });
    assert.equal(r.etat, 'REFUSE');
    assert.match(r.pourquoi, /resolved on chain/i);
  }
  /* ⛔ `blockEst0` doit etre un BOOLEEN LU, pas une valeur truthy quelconque */
  for (const v of [undefined, null, 0, 1, 'false', '']) {
    const r = planUsdcVersBlock({ ...base, blockEst0: v });
    assert.equal(r.etat, 'REFUSE', 'blockEst0=' + JSON.stringify(v) + ' doit etre refuse');
    assert.match(r.pourquoi, /read from the pool/i);
  }
});

cas('⛔ un montant trop petit est refuse en NOMMANT la vraie cause', () => {
  const p = POOLS[0];
  const base = { ...p, recipient: RECIPIENT, deadline: DEADLINE, maintenant: MAINTENANT };
  /* 1 unite de base d USDC sur un block a ~1000 $ : la sortie spot tombe a zero */
  const minuscule = planUsdcVersBlock({ ...base, montantUsdc: 1n, toleranceBps: 0 });
  assert.equal(minuscule.etat, 'REFUSE');
  /* ⛔ LA CAUSE EST LE MONTANT, pas « le minimum est nul ». Un message sur le minimum enverrait
   *   l utilisateur regler sa tolerance alors qu il doit augmenter son montant.
   * ⛔ ON TESTE LE SENS, PAS LES MOTS : ma premiere version exigeait « too small » et le module dit
   *   « so small ». L assertion a casse sur une formulation, pas sur un defaut — et une assertion
   *   liee a une orthographe m a deja coute trois tours dans cette session. */
  assert.match(minuscule.pourquoi, /amount/i, 'le refus doit nommer le MONTANT');
  assert.ok(!/toleran/i.test(minuscule.pourquoi),
    'le refus parle de tolerance : l utilisateur irait regler le mauvais reglage');

  /* ⛔⛔ ET ON EXIGE QUE CE SOIT LA COUCHE DU PLAN QUI REFUSE, PAS CELLE D EN DESSOUS. Une mutation
   *     retirant la garde `minSortie <= 0n` du plan est PASSEE : `calldata-v3.js` refuse aussi, donc
   *     l etat restait REFUSE. La defense en profondeur avait tenu, mais mon test ne savait pas
   *     QUELLE couche avait parle — il ne protegeait donc pas celle qu il croyait.
   *   ⛔ ET LA DIFFERENCE COMPTE POUR L UTILISATEUR : le plan dit « augmente le montant », la couche
   *     basse dit « le minimum doit etre superieur a zero ». La seconde envoie regler la tolerance.
   *   ⇒ Une tolerance qui ecrase le minimum a zero sur un petit montant doit etre refusee PAR LE
   *     PLAN, avec son message a lui. */
  /* ⛔ 12 UNITES, ET CE CHIFFRE EST MESURE. A 12 unites d USDC la sortie spot vaut EXACTEMENT 1, et
   *   10 % de tolerance l ecrase a 0. J avais d abord ecrit 120 : le minimum valait 9, la garde ne
   *   tirait pas, et j etais a deux doigts de declarer un « zero par impossibilite » — c est-a-dire
   *   d accuser mon propre code d etre mort alors que c est mon montant qui etait mal choisi. */
  const ecrase = planUsdcVersBlock({ ...base, montantUsdc: 12n, toleranceBps: Number(TOLERANCE_MAX_BPS) });
  assert.equal(ecrase.etat, 'REFUSE');
  assert.match(ecrase.pourquoi, /raise the amount/i,
    'ce n est pas le PLAN qui refuse : le message vient de la couche basse et enverrait '
    + 'l utilisateur regler sa tolerance au lieu d augmenter son montant');
  for (const m of [0, 0n, -1, null, undefined]) {
    assert.equal(planUsdcVersBlock({ ...base, montantUsdc: m, toleranceBps: 0 }).etat, 'REFUSE');
  }
});

cas('⛔⛔ le plan dit QUEL JETON autoriser, et que les USDC viennent du PORTEFEUILLE', () => {
  const r = planUsdcVersBlock({ ...POOLS[0], montantUsdc: CENT_USDC, recipient: RECIPIENT,
    deadline: DEADLINE, maintenant: MAINTENANT });
  assert.equal(r.etat, 'PRET');
  /* ⛔ LE JETON PAYE EST L USDC, PAS LE BLOCK. Les confondre autoriserait le mauvais actif a
   *   Permit2 — et l echange echouerait sans que la cause soit lisible. */
  assert.equal(r.jetonPaye, USDC_BASE.toLowerCase());
  assert.notEqual(r.jetonPaye, POOLS[0].block.toLowerCase());
  /* ⛔⛔ CETTE ASSERTION A ETE REECRITE PARCE QU UNE MUTATION EST PASSEE. Elle cherchait
   *     `/payerIsUser: true/` dans la SOURCE BRUTE — et mon propre COMMENTAIRE contient cette
   *     chaine. La mutation `payerIsUser: false` est donc passee inapercue : la sonde trouvait la
   *     bonne chaine dans sa propre documentation. Troisieme fois ce motif dans la meme session.
   *   ⇒ ON COMPARE LE CALLDATA PRODUIT, ce qui est inspoofable : celui du plan doit etre IDENTIQUE
   *     a un calldata construit avec `payerIsUser: true`, et DIFFERENT de celui a `false`. */
  const memeEntree = { sauts: [{ de: USDC_BASE, vers: POOLS[0].block, fee: POOLS[0].fee }],
    recipient: RECIPIENT, amountIn: CENT_USDC, amountOutMinimum: BigInt(r.minSortie),
    deadline: DEADLINE, maintenant: MAINTENANT };
  const avecUtilisateur = calldataV3ExactIn({ ...memeEntree, payerIsUser: true });
  const avecRouteur = calldataV3ExactIn({ ...memeEntree, payerIsUser: false });
  assert.equal(avecUtilisateur.etat, 'PRET');
  assert.equal(avecRouteur.etat, 'PRET');
  assert.notEqual(avecUtilisateur.data, avecRouteur.data, 'le drapeau du payeur serait decoratif');
  assert.equal(r.appel.data, avecUtilisateur.data,
    'le plan ne fait plus payer l UTILISATEUR : le routeur paierait depuis SON solde, et l echange '
    + 'echouerait sans revert parlant');
  assert.equal(r.appel.value, '0x0', 'un achat en USDC n envoie aucun ether');
  assert.equal(r.aSimuler, true, 'le plan doit dire qu il reste a simuler');
});

cas('⛔⛔ LA BORNE VOYAGE AVEC LE PLAN : le prix spot n est pas une simulation de profondeur', () => {
  const r = planUsdcVersBlock({ ...POOLS[0], montantUsdc: CENT_USDC, recipient: RECIPIENT,
    deadline: DEADLINE, maintenant: MAINTENANT });
  assert.ok(r.borne && r.borne.length > 40, 'un chiffre de sortie sans sa borne se lit comme une promesse');
  assert.match(r.borne, /not from a depth simulation/i);
  assert.match(r.borne, /larger amount will get less/i);
  assert.match(r.borne, /guaranteed minimum/i);
});

cas('⛔ le module reste PUR : ni reseau, ni horloge, ni signature', () => {
  const src = readFileSync(new URL('./plan-usdc-block.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['fetch(', 'Date.now', 'new Date', 'Math.random', 'eth_sendTransaction',
    'wallet_sendCalls', 'personal_sign', 'document']) {
    assert.ok(!src.includes(interdit), 'plan-usdc-block.js contient ' + interdit + ' — il doit rester pur');
  }
  /* ⛔⛔ MON ASSERTION PRECEDENTE INTERDISAIT `Number(` PARTOUT, ET ELLE A CASSE A RAISON : le module
   *     s en sert legitimement pour les champs d AFFICHAGE (`fee`, `toleranceBps`). L invariant reel
   *     n est pas « aucun Number » — c est que le CALCUL reste entier et que les MONTANTS sortent en
   *     chaines exactes. Une garde trop large aurait force a contourner la regle plutot qu a la tenir.
   *   ⛔ ON VERIFIE DONC DEUX CHOSES PRECISES, sur le comportement : */
  const bornes = sortieSpot({ entree: 10n ** 30n + 1n, sqrtPriceX96: 1n << 96n, entreeEst0: true });
  assert.equal(typeof bornes, 'bigint', 'sortieSpot ne rend plus un entier exact');
  assert.equal(bornes, 10n ** 30n + 1n, 'sortieSpot a perdu des bits : un flottant est passe dans le calcul');
  const r = planUsdcVersBlock({ ...POOLS[0], montantUsdc: CENT_USDC, recipient: RECIPIENT,
    deadline: DEADLINE, maintenant: MAINTENANT });
  for (const champ of ['montantUsdc', 'sortieAttendue', 'minSortie']) {
    assert.equal(typeof r[champ], 'string',
      champ + ' sort en ' + typeof r[champ] + ' : un montant en flottant perd des unites de base');
    assert.match(r[champ], /^[0-9]+$/, champ + ' n est pas un entier decimal exact');
  }
  /* ⛔ ET `sortieSpot` LUI-MEME N UTILISE PAS Number : borne a SA fonction, pas au fichier. */
  const i = src.indexOf('export function sortieSpot');
  const corps = src.slice(i, src.indexOf('\n}', i));
  assert.ok(!corps.includes('Number('), 'sortieSpot utilise Number : le calcul doit rester en entiers');
});

assert.equal(n, 12, 'compte de cas inattendu : ' + n);
console.log('✓ test-plan-usdc-block : ' + n + ' cas');
console.log('   Trois pools REELLES ; le sens prouve par l ordre de grandeur (AMZNc ~$250).');
console.log('   ⚠️ NE PROUVE PAS qu un swap aboutisse : le prix spot ignore la profondeur.');
