/* Ce que ce module rend possible, et ce qu il REFUSE de rendre possible.
 *
 * Mesure du 2026-09-30 : 15 blocks cotes contre une action tokenisee, 1 786 522 $ / 24 h, TOUS
 * sur Uniswap — donc hors du seul routeur qui sait porter notre retenue. Le banc de fork a
 * prouve 3/3 qu un `transfer` ordinaire la fait tomber quand meme.
 * ⛔ MAIS un transfert separe n est honnete que s il est INDISSOCIABLE du swap : sans lot
 *   atomique prouve, l utilisateur pourrait prendre l un sans l autre. 40,5 % des wallets
 *   mesures ne tiennent pas `wallet_sendCalls`.
 */
import { FORMES, formeDuFrais, fraisPossible, partSurMinimumGaranti,
  minimumPourLAcheteur, phraseFormeDuFrais } from './frais-hors-routeur.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu, (k, v) => (typeof v === 'bigint' ? String(v) : v))));
}

console.log('formeDuFrais — Aerodrome garde son montage');
ok('aerodrome -> ROUTEUR', formeDuFrais({ familleProuvee: 'aerodrome' }).forme === 'ROUTEUR');
ok('aerodrome sans lot atomique -> ROUTEUR quand meme (le routeur suffit)',
  formeDuFrais({ familleProuvee: 'aerodrome', lotAtomique: false }).forme === 'ROUTEUR');

console.log('formeDuFrais — LE CAS DES 15 BLOCKS : Uniswap + lot atomique');
ok('uniswap + lot atomique PROUVE -> TRANSFERT_SEPARE',
  formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }).forme === 'TRANSFERT_SEPARE',
  formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }));

console.log('formeDuFrais — SANS ATOMICITE PROUVEE, ON NE PREND RIEN');
/* ⛔⛔ C EST LE COEUR : un transfert separe qu on pourrait refuser n est pas un frais, c est un
 *    espoir. Chacune de ces formes de « pas prouve » doit rendre AUCUNE. */
for (const [nom, v] of [['false', false], ['undefined', undefined], ['null', null],
  ['la chaine "true"', 'true'], ['le nombre 1', 1], ['un objet', {}]]) {
  ok('uniswap + lotAtomique = ' + nom + ' -> AUCUNE',
    formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: v }).forme === 'AUCUNE',
    formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: v }));
}
ok('famille JAMAIS LUE -> AUCUNE, et la phrase le dit', (() => {
  const f = formeDuFrais({ lotAtomique: true });
  return f.forme === 'AUCUNE' && /never read/i.test(f.pourquoi);
})(), formeDuFrais({ lotAtomique: true }));
ok('aucun argument -> AUCUNE', formeDuFrais().forme === 'AUCUNE');
ok('chaque forme porte un POURQUOI', (() => {
  const cas = [formeDuFrais({ familleProuvee: 'aerodrome' }),
    formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }),
    formeDuFrais({ familleProuvee: 'uniswap' })];
  return cas.every((c) => typeof c.pourquoi === 'string' && c.pourquoi.length > 0);
})());
ok('les formes sont gelees', Object.isFrozen(FORMES));

console.log('fraisPossible');
ok('ROUTEUR -> possible', fraisPossible(formeDuFrais({ familleProuvee: 'aerodrome' })) === true);
ok('TRANSFERT_SEPARE -> possible',
  fraisPossible(formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true })) === true);
ok('AUCUNE -> PAS possible', fraisPossible(formeDuFrais({ familleProuvee: 'uniswap' })) === false);
ok('null -> PAS possible', fraisPossible(null) === false);

console.log('partSurMinimumGaranti — MOINS, JAMAIS PLUS');
/* ⛔⛔ LA MESURE DU BANC : 9,7 bps pris sur 10 vises, parce que la part se calcule sur le
 *    MINIMUM garanti et non sur la sortie reelle, inconnue avant signature. */
ok('10 bps sur 1 000 000 = 1 000', partSurMinimumGaranti({ minimumGaranti: 1000000n, bps: 10n }) === 1000n);
ok('l arrondi va vers le BAS (jamais au-dessus du taux affiche)', (() => {
  /* 999 * 10 / 10000 = 0,999 -> 0 */
  return partSurMinimumGaranti({ minimumGaranti: 999n, bps: 10n }) === 0n;
})(), partSurMinimumGaranti({ minimumGaranti: 999n, bps: 10n }));
ok('la part ne depasse JAMAIS le taux', (() => {
  for (const m of [1n, 7n, 999n, 123456n, 10n ** 18n]) {
    const p = partSurMinimumGaranti({ minimumGaranti: m, bps: 10n });
    if (p * 10000n > m * 10n) return false;
  }
  return true;
})());
console.log('partSurMinimumGaranti — les refus rendent 0, jamais une exception');
ok('minimum a 0 -> 0n', partSurMinimumGaranti({ minimumGaranti: 0n, bps: 10n }) === 0n);
ok('minimum negatif -> 0n', partSurMinimumGaranti({ minimumGaranti: -5n, bps: 10n }) === 0n);
ok('minimum en Number -> 0n', partSurMinimumGaranti({ minimumGaranti: 1000, bps: 10n }) === 0n);
ok('bps a 0 -> 0n', partSurMinimumGaranti({ minimumGaranti: 1000000n, bps: 0n }) === 0n);
ok('bps negatif -> 0n', partSurMinimumGaranti({ minimumGaranti: 1000000n, bps: -1n }) === 0n);
/* ⛔ UN TAUX AU-DELA DE 100 % N EST PAS UN TAUX : on refuse plutot que de tout prendre. */
ok('bps > 10000 -> 0n (on ne prend pas tout)',
  partSurMinimumGaranti({ minimumGaranti: 1000000n, bps: 10001n }) === 0n);
ok('bps illisible -> 0n', partSurMinimumGaranti({ minimumGaranti: 1000000n, bps: 'beaucoup' }) === 0n);
ok('aucun argument -> 0n', partSurMinimumGaranti() === 0n);

console.log('minimumPourLAcheteur — ce qu il verra VRAIMENT');
/* ⛔ Annoncer un minimum garanti sans en retirer notre part afficherait un chiffre que
 *   l acheteur ne recevra jamais. */
ok('1 000 000 moins 10 bps = 999 000',
  minimumPourLAcheteur({ minimumGaranti: 1000000n, bps: 10n }) === 999000n);
ok('part + reste = le minimum garanti, exactement', (() => {
  const m = 123457n, b = 10n;
  return partSurMinimumGaranti({ minimumGaranti: m, bps: b })
    + minimumPourLAcheteur({ minimumGaranti: m, bps: b }) === m;
})());
ok('sans frais, l acheteur garde TOUT',
  minimumPourLAcheteur({ minimumGaranti: 1000000n, bps: 0n }) === 1000000n);
ok('minimum absurde -> 0n', minimumPourLAcheteur({ minimumGaranti: 0n, bps: 10n }) === 0n);

console.log('phraseFormeDuFrais — un « rien » se dit aussi');
ok('null PARLE', phraseFormeDuFrais(null, 10n).length > 0);
ok('ROUTEUR dit que le frais est DANS le swap',
  /inside the swap/i.test(phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'aerodrome' }), 10n)));
/* ⛔ LA PHRASE DU TRANSFERT SEPARE DOIT DIRE LES DEUX CHOSES QUI COMPTENT : que c est un SECOND
 *   appel signe AVEC le swap, et que la part se calcule sur le MINIMUM — donc jamais plus. */
ok('TRANSFERT_SEPARE dit « second call » ET « signed together »', (() => {
  const p = phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }), 10n);
  return /second call/i.test(p) && /signed together/i.test(p);
})(), phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }), 10n));
ok('TRANSFERT_SEPARE dit « never more »', (() => {
  const p = phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'uniswap', lotAtomique: true }), 10n);
  return /never more/i.test(p) && /minimum/i.test(p);
})());
ok('AUCUNE dit qu on ne prend RIEN, et pourquoi', (() => {
  const p = phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'uniswap' }), 10n);
  return /takes nothing/i.test(p) && /atomic batching/i.test(p);
})(), phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'uniswap' }), 10n));
ok('le taux affiche est le VRAI taux (10 bps -> 0.1%)',
  /0\.1%/.test(phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'aerodrome' }), 10n)),
  phraseFormeDuFrais(formeDuFrais({ familleProuvee: 'aerodrome' }), 10n));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
