/* test-calldata-aerodrome.mjs — REJOUER DEUX TRANSACTIONS REELLES, A L OCTET.
 *
 * ⛔⛔ LE SEUL TEST QUI VAUT VRAIMENT ICI. Un encodeur ABI peut etre « raisonnable » et faux : un
 *     champ inverse, un mot de trop, un int24 mal signe. Aucune relecture ne l attrape de facon
 *     fiable. Donc on REJOUE deux appels que la chaine a REELLEMENT acceptes, et on exige l egalite
 *     OCTET POUR OCTET du calldata. Si le module s ecarte d un seul caractere, il a tort.
 *
 * PROVENANCE DES DEUX TEMOINS (mesures le 2026-09-28, routeur appele DIRECTEMENT) :
 *   0xf1dfb9f1212394f8d263f9b2ed7c1095b4707cca7ee0da5e524badd2b80dea17  bloc ts 1790564959
 *   0xd0b478dd40f1a90c6b05d655fd3553b00b8d45fada213e7f56b8d90fce1f7d8c  bloc ts 1790565063
 * Chacune croisee avec l event `Swap` de sa propre transaction : `amountIn` egalait au chiffre pres
 * le montant POSITIF du Swap (le jeton qui ENTRE), et `amountOutMinimum` etait <= a la sortie reelle.
 * ⛔ Ce croisement etait indispensable : `tokenIn` et `tokenOut` ont la meme forme, et j avais
 *   d abord inverse les deux en supposant que NVDAc etait `token0`. C est l ordre des adresses
 *   (0x8335… < 0xb200… donc token0 = USDC) qui a tranche, pas l habitude.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS : qu un swap aboutisse, ni que la pool visee existe. Il prouve
 *   que notre encodage est identique a celui d appels acceptes, et que les refus tiennent.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { calldataExactInputSingleCL, calldataApprove, planifierFranchissement, calldataGetPool,
  ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL, SELECTEURS } from './calldata-aerodrome.js';
import { selecteur } from './keccak.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
/* ⛔ LA POOL MESUREE, pas une invention : `getPool(USDC, NVDAc, 10)` sur la factory Aerodrome CL a
 *   rendu cette adresse, et `token0()`/`token1()`/`tickSpacing()` lus SUR elle rendent bien
 *   (USDC, NVDAc, 10). Aller-retour verifie le 2026-09-28 sur les 12 pools d actions : 12/12. */
const POOL_NVDAc_USDC = '0x853f5f1b92b16714fe6cda67caad0856b83c7ab9';

/* ── les deux temoins, recopies mot par mot depuis la chaine ────────────────────────────────── */
const TEMOIN_1 = {
  tx: '0xf1dfb9f1212394f8d263f9b2ed7c1095b4707cca7ee0da5e524badd2b80dea17',
  blocTs: 1790564959n,
  entree: { tokenIn: NVDAc, tokenOut: USDC, tickSpacing: 10,
    recipient: '0xd0e2f1c6b4d604da32ae5831e616d6553efdcc7f',
    deadline: 0x6ab9dcb5n, amountIn: 0x54e08400n, amountOutMinimum: 0xbe40b46an },
  mots: [
    '000000000000000000000000b20000000000000000000078ee7ce2fe4908108c',
    '000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    '000000000000000000000000000000000000000000000000000000000000000a',
    '000000000000000000000000d0e2f1c6b4d604da32ae5831e616d6553efdcc7f',
    '000000000000000000000000000000000000000000000000000000006ab9dcb5',
    '0000000000000000000000000000000000000000000000000000000054e08400',
    '00000000000000000000000000000000000000000000000000000000be40b46a',
    '0000000000000000000000000000000000000000000000000000000000000000',
  ],
  /* du meme Swap : amount0 negatif (USDC sort), amount1 positif (NVDAc entre) */
  swapAmount0: -3192869534n, swapAmount1: 1424000000n,
};
const TEMOIN_2 = {
  tx: '0xd0b478dd40f1a90c6b05d655fd3553b00b8d45fada213e7f56b8d90fce1f7d8c',
  blocTs: 1790565063n,
  entree: { tokenIn: NVDAc, tokenOut: USDC, tickSpacing: 10,
    recipient: '0x44792101174a7c375681dd9b698cf484cd649748',
    deadline: 0x6ab9db1cn, amountIn: 0x0122e573n, amountOutMinimum: 0x0289ca46n },
  mots: [
    '000000000000000000000000b20000000000000000000078ee7ce2fe4908108c',
    '000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    '000000000000000000000000000000000000000000000000000000000000000a',
    '00000000000000000000000044792101174a7c375681dd9b698cf484cd649748',
    '000000000000000000000000000000000000000000000000000000006ab9db1c',
    '000000000000000000000000000000000000000000000000000000000122e573',
    '000000000000000000000000000000000000000000000000000000000289ca46',
    '0000000000000000000000000000000000000000000000000000000000000000',
  ],
  swapAmount0: -42712786n, swapAmount1: 19064179n,
};

for (const [nom, T] of [['temoin 1', TEMOIN_1], ['temoin 2', TEMOIN_2]]) {
  cas('⛔⛔ ' + nom + ' : le calldata est reproduit A L OCTET (' + T.tx.slice(0, 12) + '…)', () => {
    const attendu = SELECTEURS.exactInputSingle + T.mots.join('');
    /* ⛔ LE TEMOIN EST VERIFIE AVANT D ETRE UTILISE : 4 + 8x32 octets, sinon la reference elle-meme
     *   est fausse et l egalite ne voudrait rien dire. Un temoin non verifie a deja ete la cible. */
    assert.equal(attendu.length, 2 + 8 + 8 * 64,
      'le temoin recopie ne fait pas 4 + 8x32 octets — la reference est fausse, pas le module');
    const r = calldataExactInputSingleCL({ ...T.entree, maintenant: T.blocTs });
    assert.equal(r.etat, 'PRET', r.pourquoi || '');
    assert.equal(r.to.toLowerCase(), ROUTEUR_AERODROME_CL.toLowerCase());
    assert.equal(r.value, '0x0', 'cette jambe echange deux ERC-20 : aucune valeur ne doit partir');
    assert.equal(r.data, attendu, 'calldata different de la transaction reelle');
  });

  cas('⛔ ' + nom + ' : le SENS est celui du Swap, pas une supposition', () => {
    /* ⛔ token0 est l adresse la PLUS PETITE. Ici USDC (0x8335…) < NVDAc (0xb200…), donc token0 =
     *   USDC et token1 = NVDAc. Donc `amount1` positif veut dire que NVDAc ENTRE. */
    assert.ok(USDC.toLowerCase() < NVDAc.toLowerCase(), 'hypothese d ordre des jetons fausse');
    assert.ok(T.swapAmount1 > 0n, 'amount1 doit etre positif : c est le jeton qui entre');
    assert.ok(T.swapAmount0 < 0n, 'amount0 doit etre negatif : c est le jeton qui sort');
    /* le montant d entree encode EST le montant entre dans la pool */
    assert.equal(BigInt(T.entree.amountIn), T.swapAmount1,
      'amountIn ne correspond pas au montant entre : tokenIn/tokenOut sont peut-etre inverses');
    /* et le minimum exige etait bien <= a ce qui est reellement sorti */
    assert.ok(BigInt(T.entree.amountOutMinimum) <= -T.swapAmount0,
      'amountOutMinimum > sortie reelle : la transaction n aurait pas pu passer');
    /* ⛔ et tokenIn est bien celui dont le montant est POSITIF, donc token1, donc NVDAc */
    assert.equal(T.entree.tokenIn.toLowerCase(), NVDAc.toLowerCase());
  });
}

cas('⛔ les selecteurs publies sont RECALCULES, pas crus sur parole', () => {
  /* ⛔ Un selecteur nu est un nombre magique. Celui d `approve` est verifiable depuis sa signature,
   *   donc on le verifie. Ceux du routeur ont ete lus dans le bytecode : on verifie qu ils
   *   correspondent bien aux signatures qu on a documentees. */
  assert.equal(SELECTEURS.approve, selecteur('approve(address,uint256)'));
  assert.equal(SELECTEURS.exactInputSingle,
    selecteur('exactInputSingle((address,address,int24,address,uint256,uint256,uint256,uint160))'));
  assert.equal(SELECTEURS.exactInput, selecteur('exactInput((bytes,address,uint256,uint256,uint256))'));
  assert.equal(SELECTEURS.multicall, selecteur('multicall(bytes[])'));
  assert.equal(SELECTEURS.unwrapWETH9, selecteur('unwrapWETH9(uint256,address)'));
  assert.equal(SELECTEURS.refundETH, selecteur('refundETH()'));
  /* ⛔ TEMOIN NEGATIF : la variante `uint24` (Uniswap) n est PAS celle de ce routeur. Si un jour les
   *   deux selecteurs se confondaient dans le module, ce cas casse. */
  assert.notEqual(SELECTEURS.exactInputSingle,
    selecteur('exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'));
});

cas('⛔⛔ amountOutMinimum a zero est REFUSE', () => {
  for (const min of [0, 0n, null, undefined, '0']) {
    const r = calldataExactInputSingleCL({ ...TEMOIN_1.entree, amountOutMinimum: min, maintenant: TEMOIN_1.blocTs });
    assert.equal(r.etat, 'REFUSE', 'minOut=' + JSON.stringify(String(min)) + ' doit etre refuse');
    assert.match(r.pourquoi, /greater than zero/i);
  }
});

cas('⛔ un deadline passe, ou trop lointain, est REFUSE', () => {
  const t = TEMOIN_1.blocTs;
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, deadline: t, maintenant: t }).etat, 'REFUSE');
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, deadline: t - 1n, maintenant: t }).etat, 'REFUSE');
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, deadline: t + 1801n, maintenant: t }).etat, 'REFUSE');
  /* ⛔ TEMOIN POSITIF DE LA MEME BORNE : 1800 s pile passe, sinon la garde refuserait tout et ce
   *   test serait satisfait par un module inutilisable. */
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, deadline: t + 1800n, maintenant: t }).etat, 'PRET');
  /* ⛔ ET SANS INSTANT DE REFERENCE : on n invente PAS de jugement, on le DIT */
  const sans = calldataExactInputSingleCL({ ...TEMOIN_1.entree, maintenant: null });
  assert.equal(sans.etat, 'PRET');
  assert.match(sans.noteDeadline, /not judged/i);
});

cas('⛔ le meme jeton des deux cotes, et un destinataire nul, sont REFUSES', () => {
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, tokenOut: NVDAc }).etat, 'REFUSE');
  assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree,
    recipient: '0x' + '0'.repeat(40) }).etat, 'REFUSE');
  for (const mauvaise of ['', '0x', '0xzz', NVDAc.slice(0, 20)]) {
    assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, tokenIn: mauvaise }).etat, 'REFUSE');
    assert.equal(calldataExactInputSingleCL({ ...TEMOIN_1.entree, recipient: mauvaise }).etat, 'REFUSE');
  }
});

cas('⛔⛔ une approbation ILLIMITEE est refusee', () => {
  const max = (1n << 256n) - 1n;
  const r = calldataApprove({ token: USDC, montant: max });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /unlimited/i);
  /* temoin positif : un montant exact passe, et cible bien le routeur mesure */
  const ok = calldataApprove({ token: USDC, montant: 1000000n });
  assert.equal(ok.etat, 'PRET');
  assert.equal(ok.to, USDC.toLowerCase(), 'approve s appelle sur le JETON, pas sur le routeur');
  assert.ok(ok.data.startsWith(SELECTEURS.approve));
  assert.ok(ok.data.toLowerCase().includes(ROUTEUR_AERODROME_CL.replace(/^0x/, '').toLowerCase()),
    'le beneficiaire par defaut doit etre le routeur Aerodrome mesure');
});

cas('⛔⛔ L INVARIANT DU LOT : la jambe 2 ne depense jamais plus que le minimum garanti de la jambe 1', () => {
  const jambe1 = { to: '0x6ff5693b99212DA76aD316178A184AB56D299b43', data: '0xdeadbeef', value: '0x0' };
  const commun = { jambe1, pivot: USDC, action: NVDAc, tickSpacing: 10,
    recipient: TEMOIN_1.entree.recipient, deadline: TEMOIN_1.blocTs + 300n,
    maintenant: TEMOIN_1.blocTs, minSortie2: 1n, poolResolue: POOL_NVDAc_USDC };
  /* egal : accepte */
  assert.equal(planifierFranchissement({ ...commun, minSortie1: 1000n, entree2: 1000n }).etat, 'PRET');
  /* moins : accepte */
  assert.equal(planifierFranchissement({ ...commun, minSortie1: 1000n, entree2: 999n }).etat, 'PRET');
  /* UN DE PLUS : refuse — c est la frontiere exacte, pas un ordre de grandeur */
  const trop = planifierFranchissement({ ...commun, minSortie1: 1000n, entree2: 1001n });
  assert.equal(trop.etat, 'REFUSE');
  assert.match(trop.pourquoi, /more than leg 1 is guaranteed/i);
  /* sans minimum sur la jambe 1, il n y a aucun montant honnete pour la jambe 2 */
  assert.equal(planifierFranchissement({ ...commun, minSortie1: 0n }).etat, 'REFUSE');
});

cas('⛔ le lot annonce sa poussiere et exige l atomicite', () => {
  const r = planifierFranchissement({
    jambe1: { to: '0x6ff5693b99212DA76aD316178A184AB56D299b43', data: '0xabcd' },
    pivot: USDC, action: NVDAc, tickSpacing: 10, recipient: TEMOIN_1.entree.recipient,
    deadline: TEMOIN_1.blocTs + 120n, maintenant: TEMOIN_1.blocTs, minSortie1: 5000n, minSortie2: 7n,
    poolResolue: POOL_NVDAc_USDC });
  assert.equal(r.etat, 'PRET');
  assert.equal(r.appels.length, 3, 'jambe 1, approbation, jambe 2');
  assert.equal(r.appels[1].to, USDC.toLowerCase(), 'l approbation porte sur le pivot');
  assert.equal(r.appels[2].to.toLowerCase(), ROUTEUR_AERODROME_CL.toLowerCase());
  /* ⛔ SANS ATOMICITE, la jambe 1 peut passer seule et l utilisateur garde le pivot au lieu de
   *   l action qu il voulait. Le drapeau doit etre la pour que l appelant le demande au wallet. */
  assert.equal(r.exigeAtomique, true);
  assert.match(r.poussiere, /5000/, 'la poussiere doit nommer le minimum au-dela duquel elle apparait');
  /* une jambe 1 absente ou vide est refusee : on ne construit pas un lot a une jambe en croyant deux */
  for (const mauvaise of [null, undefined, {}, { to: 'x', data: '0x1' }, { to: USDC, data: '' }]) {
    assert.equal(planifierFranchissement({ jambe1: mauvaise, pivot: USDC, action: NVDAc,
      tickSpacing: 10, recipient: TEMOIN_1.entree.recipient, deadline: TEMOIN_1.blocTs + 60n,
      minSortie1: 10n, minSortie2: 1n, poolResolue: POOL_NVDAc_USDC }).etat, 'REFUSE');
  }
  assert.equal(r.poolVisee, POOL_NVDAc_USDC.toLowerCase(), 'la pool visee doit etre relisible');
});

cas('⛔⛔ le lot REFUSE de viser une pool qui n a pas ete resolue sur la chaine', () => {
  /* ⛔⛔ CE REFUS VIENT D UNE MESURE, PAS D UN PRINCIPE. `tickSpacing` vaut 10 sur SEPT pools
   *     d actions (NVDAc, GOOGLc, METAc, AAPLc, MSTRc, MSFTc, SNDKc) et 1 sur CINQ autres (RDDTc,
   *     LLYc, NFLXc, GMEc, AVGOc) — aller-retour du 2026-09-28, 12/12. Un appelant qui prendrait 10
   *     « parce que c est le plus courant » construirait un calldata vers une pool INEXISTANTE pour
   *     cinq actions sur douze, et ca reverterait APRES la signature. */
  const commun = { jambe1: { to: '0x6ff5693b99212DA76aD316178A184AB56D299b43', data: '0xabcd' },
    pivot: USDC, action: NVDAc, tickSpacing: 10, recipient: TEMOIN_1.entree.recipient,
    deadline: TEMOIN_1.blocTs + 120n, maintenant: TEMOIN_1.blocTs, minSortie1: 5000n, minSortie2: 7n };
  for (const mauvaise of [null, undefined, '', '0x', 'pas-une-adresse']) {
    const r = planifierFranchissement({ ...commun, poolResolue: mauvaise });
    assert.equal(r.etat, 'REFUSE', 'poolResolue=' + JSON.stringify(mauvaise) + ' doit etre refuse');
    assert.match(r.pourquoi, /resolved on chain/i);
  }
  /* ⛔ ET L ADRESSE NULLE EST REFUSEE A PART, avec son propre message : c est EXACTEMENT ce que la
   *   factory rend pour un triplet inconnu (verifie : tickSpacing 7777 -> 0x000…0). L accepter
   *   serait accepter la reponse « cette pool n existe pas » comme si c etait une pool. */
  const nulle = planifierFranchissement({ ...commun, poolResolue: '0x' + '0'.repeat(40) });
  assert.equal(nulle.etat, 'REFUSE');
  assert.match(nulle.pourquoi, /zero address/i);
  assert.match(nulle.pourquoi, /knows no pool/i);
  /* temoin positif : la pool mesuree passe, sinon la garde refuserait tout */
  assert.equal(planifierFranchissement({ ...commun, poolResolue: POOL_NVDAc_USDC }).etat, 'PRET');
});

cas('⛔ calldataGetPool reproduit l appel de lecture qui a VRAIMENT resolu cette pool', () => {
  const r = calldataGetPool({ tokenA: USDC, tokenB: NVDAc, tickSpacing: 10 });
  assert.equal(r.etat, 'PRET');
  /* ⛔ LA LECTURE SE FAIT SUR LA FACTORY, pas sur le routeur — les confondre rendrait un revert
   *   illisible au lieu d une adresse. */
  assert.equal(r.to.toLowerCase(), FACTORY_AERODROME_CL.toLowerCase());
  const attendu = SELECTEURS.getPool
    + '000000000000000000000000' + USDC.replace(/^0x/, '')
    + '000000000000000000000000' + NVDAc.replace(/^0x/, '')
    + '000000000000000000000000000000000000000000000000000000000000000a';
  assert.equal(r.data, attendu, 'calldata different de celui qui a resolu la pool sur la chaine');
  /* ⛔ L ORDRE DES DEUX JETONS N IMPORTE PAS : la factory trie. Verifie — l aller-retour a reussi
   *   sur les 12 pools sans qu on trie ici. Donc l inversion doit produire un calldata VALIDE,
   *   simplement different. */
  const inverse = calldataGetPool({ tokenA: NVDAc, tokenB: USDC, tickSpacing: 10 });
  assert.equal(inverse.etat, 'PRET');
  assert.notEqual(inverse.data, r.data);
  /* refus : tickSpacing nul ou negatif, adresses incompletes */
  for (const ts of [0, -1, null, undefined]) {
    assert.equal(calldataGetPool({ tokenA: USDC, tokenB: NVDAc, tickSpacing: ts }).etat, 'REFUSE');
  }
  assert.equal(calldataGetPool({ tokenA: '0x12', tokenB: NVDAc, tickSpacing: 10 }).etat, 'REFUSE');
});

cas('⛔ la factory publiee est celle du routeur mesure', () => {
  /* ⛔ Elle est exportee pour qu une sonde puisse la RE-verifier sur la chaine (`factory()`), pas
   *   pour etre recopiee. Ce cas verifie juste sa forme et qu elle n a pas ete confondue avec la
   *   factory Uniswap v3, qui est l erreur exactement inverse de celle qu on veut eviter. */
  assert.match(FACTORY_AERODROME_CL, /^0x[0-9a-f]{40}$/);
  assert.notEqual(FACTORY_AERODROME_CL.toLowerCase(), '0x33128a8fc17869897dce68ed026d694621f6fdfd');
});

cas('⛔ le module reste PUR : ni reseau, ni horloge, ni signature', () => {
  /* ⛔ GARDE ARCHITECTURALE. Le rejeu a l octet n est possible que parce que rien ici ne varie tout
   *   seul. Un `Date.now()` glisse dedans rendrait le test non reproductible, et une sonde de
   *   deadline ne pourrait plus etre ecrite. */
  const src = readFileSync(new URL('./calldata-aerodrome.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['fetch(', 'Date.now', 'new Date', 'Math.random', 'eth_sendTransaction',
    'wallet_sendCalls', 'personal_sign', 'eth_sign', 'XMLHttpRequest', 'import(']) {
    assert.ok(!src.includes(interdit), 'calldata-aerodrome.js contient ' + interdit + ' — il doit rester pur');
  }
});

/* ⛔ LE COMPTE M A ATTRAPE : j avais ecrit 12, il y en a 13 — la boucle sur les deux temoins produit
 *   QUATRE cas, pas deux. Un compteur qui ne se verifie pas laisserait un cas disparaitre en silence
 *   lors d un refactor, et la suite resterait verte avec une assertion en moins. */
assert.equal(n, 15, 'compte de cas inattendu : ' + n);
console.log('✓ test-calldata-aerodrome : ' + n + ' cas');
console.log('   2 transactions reelles rejouees A L OCTET, sens croise avec leur event Swap.');
console.log('   Le lot EXIGE une pool resolue par getPool : tickSpacing vaut 10 sur 7 pools et 1 sur 5.');
/* ⛔ CETTE LIGNE A ETE CORRIGEE : elle disait « ne prouve pas que la pool visee existe », ce qui est
 *   devenu FAUX le jour ou le planificateur a exige `poolResolue`. Une borne perimee rassure a tort
 *   dans un sens, et sous-vend la garde dans l autre. */
console.log('   ⚠️ NE PROUVE PAS qu un swap aboutisse : une pool qui EXISTE peut etre vide, et ni le');
console.log('      glissement ni la profondeur au bloc ne sont simules ici.');
