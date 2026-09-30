/* Le cas REEL que ce module empeche, mesure en production le 2026-09-30 :
 *   le selecteur du Brain proposait DEUX « · USDC · … » — 0xb2…9901 (name « UpSideDownCat ») et
 *   0xb2…2701 (name « FatCatBatRatWifHat »), tous deux de VRAIS B20 (code 0xef). Le vrai USDC
 *   est 0x833589fC… et n est meme pas un B20. La liste n affichait que le SYMBOLE.
 */
import { MARQUEUR, VERDICTS, symboleTrompeur, symbolePourListe, phraseTrompeur } from './symbole-trompeur.js';
import { DEVISES_BASE } from './paires.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
/* ⛔ Les adresses viennent de la MESURE, pas de mon souvenir. */
const SOSIE_A = '0xb200000000000000000000945f82034201b39901';   /* name() « UpSideDownCat » */
const SOSIE_B = '0xb200000000000000000000816cfe3b2bd73f2701';   /* name() « FatCatBatRatWifHat » */
const VRAI_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

console.log('symboleTrompeur — LE CAS REEL');
ok('le sosie A est marque TROMPEUR', (() => {
  const v = symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE);
  return v.verdict === 'TROMPEUR' && v.devise === 'USDC';
})(), symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE));
ok('le sosie B aussi', symboleTrompeur('USDC', SOSIE_B, DEVISES_BASE).verdict === 'TROMPEUR');
/* ⛔⛔ ET LA VRAIE DEVISE N EST PAS MARQUEE — c est tout le sujet : on distingue l original de
 *     son homonyme, on ne marque pas le MOT. */
ok('le VRAI USDC n est PAS marque', (() => {
  const v = symboleTrompeur('USDC', VRAI_USDC, DEVISES_BASE);
  return v.verdict === 'LIBRE' && v.pourquoi === 'EST_LA_VRAIE';
})(), symboleTrompeur('USDC', VRAI_USDC, DEVISES_BASE));
ok('la casse de l adresse ne change rien',
  symboleTrompeur('USDC', VRAI_USDC.toLowerCase(), DEVISES_BASE).verdict === 'LIBRE');
ok('la casse du symbole ne change rien',
  symboleTrompeur('usdc', SOSIE_A, DEVISES_BASE).verdict === 'TROMPEUR');

console.log('symboleTrompeur — sur la VRAIE liste du produit');
ok('DEVISES_BASE n est pas vide', DEVISES_BASE.length > 0, DEVISES_BASE.length);
ok('chaque devise reelle se reconnait elle-meme', DEVISES_BASE.every((d) =>
  symboleTrompeur(d.symbole, d.adr, DEVISES_BASE).verdict === 'LIBRE'),
  DEVISES_BASE.filter((d) => symboleTrompeur(d.symbole, d.adr, DEVISES_BASE).verdict !== 'LIBRE').map((d) => d.symbole));
ok('un sosie de CHAQUE devise est attrape', DEVISES_BASE.every((d) =>
  symboleTrompeur(d.symbole, SOSIE_A, DEVISES_BASE).verdict === 'TROMPEUR'));

console.log('symboleTrompeur — les symboles ordinaires passent');
/* ⛔ TEMOIN DE SUR-MARQUAGE : si tout etait marque, le marqueur ne voudrait plus rien dire —
 *   c est la faute mesuree de `fail-closed-sur-une-affordance` (13 puces tombees a 2 EN PROD). */
ok('BLUEPILL n est pas marque', symboleTrompeur('BLUEPILL', SOSIE_A, DEVISES_BASE).verdict === 'LIBRE');
ok('SI n est pas marque', symboleTrompeur('SI', SOSIE_A, DEVISES_BASE).verdict === 'LIBRE');
/* ⛔⛔ MON TEST S EST TROMPE ICI, PAS LE CODE, ET LE RESULTAT EST MEILLEUR QUE PREVU.
 *    J avais ecrit « TBLOCK n est pas marque » en le prenant pour un symbole ordinaire. Or
 *    TBLOCK EST dans `DEVISES_BASE` (0xb2…272e, type TBLOCK) : c est une devise d echange de
 *    cette app. Donc un AUTRE block qui se reclame « TBLOCK » est exactement le cas que cette
 *    garde doit attraper — elle protege NOTRE nom, pas seulement ceux des autres. */
ok('un FAUX TBLOCK est marque (la garde protege notre propre nom)',
  symboleTrompeur('TBLOCK', SOSIE_A, DEVISES_BASE).verdict === 'TROMPEUR',
  symboleTrompeur('TBLOCK', SOSIE_A, DEVISES_BASE));
ok('le VRAI TBLOCK n est PAS marque', (() => {
  const vrai = DEVISES_BASE.find((d) => d.symbole === 'TBLOCK');
  return symboleTrompeur('TBLOCK', vrai.adr, DEVISES_BASE).verdict === 'LIBRE';
})());
/* Un symbole vraiment ordinaire, absent de la liste, reste nu. */
ok('MOON n est pas marque', symboleTrompeur('MOON', SOSIE_A, DEVISES_BASE).verdict === 'LIBRE');
ok('un symbole qui CONTIENT usdc sans l etre passe',
  symboleTrompeur('USDCASH', SOSIE_A, DEVISES_BASE).verdict === 'LIBRE');

console.log('symboleTrompeur — les refus');
ok('liste absente -> NON_VERIFIABLE (jamais LIBRE)', (() => {
  const v = symboleTrompeur('USDC', SOSIE_A, null);
  return v.verdict === 'NON_VERIFIABLE' && v.pourquoi === 'LISTE_DEVISES_ABSENTE';
})());
ok('liste vide -> NON_VERIFIABLE', symboleTrompeur('USDC', SOSIE_A, []).verdict === 'NON_VERIFIABLE');
ok('symbole vide -> NON_VERIFIABLE', symboleTrompeur('', SOSIE_A, DEVISES_BASE).verdict === 'NON_VERIFIABLE');
ok('symbole null -> NON_VERIFIABLE', symboleTrompeur(null, SOSIE_A, DEVISES_BASE).verdict === 'NON_VERIFIABLE');
/* ⛔ SANS ADRESSE, on ne peut PAS distinguer l original du sosie : on marque, parce que le doute
 *   doit profiter au lecteur, pas au block. */
ok('sans adresse, un symbole de devise est marque',
  symboleTrompeur('USDC', null, DEVISES_BASE).verdict === 'TROMPEUR');
ok('les entrees sans symbole dans la liste sont ignorees, pas fatales',
  symboleTrompeur('USDC', SOSIE_A, [{ adr: '0x1' }, ...DEVISES_BASE]).verdict === 'TROMPEUR');
ok('les verdicts sont geles', Object.isFrozen(VERDICTS));

console.log('symbolePourListe');
ok('le sosie recoit le marqueur', symbolePourListe('USDC', SOSIE_A, DEVISES_BASE) === 'USDC ' + MARQUEUR);
/* ⛔ ON N EFFACE PAS LE SYMBOLE : le cacher priverait le lecteur de ce que le block dit de lui. */
ok('le symbole d origine reste LISIBLE dans le libelle',
  symbolePourListe('USDC', SOSIE_A, DEVISES_BASE).startsWith('USDC'));
ok('la vraie devise garde son libelle NU', symbolePourListe('USDC', VRAI_USDC, DEVISES_BASE) === 'USDC');
ok('un symbole ordinaire reste nu', symbolePourListe('BLUEPILL', SOSIE_A, DEVISES_BASE) === 'BLUEPILL');
ok('symbole absent -> « ? », pas une chaine vide', symbolePourListe('', SOSIE_A, DEVISES_BASE) === '?');
ok('liste absente -> aucun marquage (on ne marque pas au hasard)',
  symbolePourListe('USDC', SOSIE_A, null) === 'USDC');

console.log('phraseTrompeur');
/* ⛔ LE MARQUEUR DOIT AVOIR UNE CAUSE : un « ⚠ » qu on ne comprend pas ne protege personne. */
ok('la phrase NOMME la devise usurpee', (() => {
  const p = phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE));
  return /USDC/.test(p) && /not USDC itself/i.test(p);
})(), phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE)));
ok('elle dit que c est un BLOCK', /is a block/i.test(phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE))));
/* ⛔⛔ TROU TROUVE PAR MUTATION (M5) : la phrase tient sur DEUX lignes, et mes assertions
 *    passaient avec la PREMIERE effacee — la seconde portait deja « USDC » et « is a block ».
 *    Un test qui ne tient qu une moitie laisse l autre se perdre en silence. On tient les deux. */
ok('elle dit POURQUOI (« reads like »), pas seulement quoi', (() => {
  const p = phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE));
  return /reads like/i.test(p) && /ticker/i.test(p);
})(), phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE)));
ok('elle porte le MARQUEUR en tete', phraseTrompeur(symboleTrompeur('USDC', SOSIE_A, DEVISES_BASE)).startsWith(MARQUEUR));
ok('la vraie devise -> silence', phraseTrompeur(symboleTrompeur('USDC', VRAI_USDC, DEVISES_BASE)) === '');
ok('un symbole ordinaire -> silence', phraseTrompeur(symboleTrompeur('BLUEPILL', SOSIE_A, DEVISES_BASE)) === '');
ok('null -> silence', phraseTrompeur(null) === '');

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
