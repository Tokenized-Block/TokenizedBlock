/* Ce que ce test tient — et pourquoi chaque cas existe.
 *
 * Le dimensionnement decide combien d unites un utilisateur recoit. Une perte d arrondi
 * SILENCIEUSE afficherait « 1:1 » et livrerait autre chose : c est le defaut a ne pas
 * expedier. Les cas d arrondi sont donc les plus nombreux ici, pas les plus rares.
 */
import {
  DECIMALES_MIN, DECIMALES_MAX, ETATS,
  avertissementNonAdosse, dimensionner, prixInitialPourFdvEgale, ecartDeParite, phraseDimension,
  planDeFrais, phraseFraisChemin, planDepuisJetonAvecSupplyScellee, phrasePlanScelle, ratioParBlock,
  VERDICTS_COLLISION, collisionAvecEmetteur, phraseCollision,
} from './tokeniser-un-jeton.js';
/* ⛔ La liste des actions de l emetteur vient de sa source unique, jamais recopiee ici. */
import { ACTIONS_COINBASE } from './paires.js';
import { FEE_WALLET, FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { FRAIS_INTERFACE_BPS } from './echange.js';
/* ⛔ La supply SCELLEE vient de sa source unique, jamais ecrite a la main ici. */
import { SUPPLY_FIXE } from './tokenomics.js';

let n = 0, ko = 0;
const j = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x));
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + j(vu)));
}

/* Les vrais chiffres du TBLOCK d openlaunch, LUS sur la chaine le 2026-09-30. */
const TBLOCK_SUPPLY = 1000000000000000000000000000n;   /* 1e27 */
const TBLOCK_DEC = 18;

console.log('dimensionner — le cas reel');
ok('parite sur TBLOCK : meme supply, memes decimales', (() => {
  const d = dimensionner({ supplySource: TBLOCK_SUPPLY, decimalesSource: TBLOCK_DEC });
  return d.etat === 'OK' && d.supplyB20 === TBLOCK_SUPPLY;
})(), dimensionner({ supplySource: TBLOCK_SUPPLY, decimalesSource: TBLOCK_DEC }));

ok('ratio 1:2 rend la MOITIE', (() => {
  const d = dimensionner({ supplySource: 1000n, decimalesSource: 18, ratio: { haut: 1n, bas: 2n } });
  return d.etat === 'OK' && d.supplyB20 === 500n;
})(), dimensionner({ supplySource: 1000n, decimalesSource: 18, ratio: { haut: 1n, bas: 2n } }));

ok('ratio 3:1 rend le TRIPLE', (() => {
  const d = dimensionner({ supplySource: 1000n, decimalesSource: 18, ratio: { haut: 3n, bas: 1n } });
  return d.etat === 'OK' && d.supplyB20 === 3000n;
})());

console.log('dimensionner — les decimales, la ou ca casse');
ok('source a 6 decimales -> B20 a 18 : x 1e12', (() => {
  const d = dimensionner({ supplySource: 1000000n, decimalesSource: 6, decimalesB20: 18 });
  return d.etat === 'OK' && d.supplyB20 === 1000000n * (10n ** 12n);
})(), dimensionner({ supplySource: 1000000n, decimalesSource: 6, decimalesB20: 18 }));

ok('source a 18 -> B20 a 6 : / 1e12', (() => {
  const d = dimensionner({ supplySource: 10n ** 24n, decimalesSource: 18, decimalesB20: 6 });
  return d.etat === 'OK' && d.supplyB20 === 10n ** 12n;
})());

/* ⛔ MULTIPLIER AVANT DE DIVISER. Si le module divisait d abord, ce cas rendrait 0. */
ok('ratio applique APRES l echelle (sinon ce cas rend 0)', (() => {
  const d = dimensionner({ supplySource: 1n, decimalesSource: 0, decimalesB20: 18, ratio: { haut: 1n, bas: 3n } });
  return d.etat === 'OK' && d.supplyB20 === (10n ** 18n) / 3n;
})(), dimensionner({ supplySource: 1n, decimalesSource: 0, decimalesB20: 18, ratio: { haut: 1n, bas: 3n } }));

console.log('dimensionner — les refus (aucun calcul muet)');
ok('supply 0 -> REFUSE', dimensionner({ supplySource: 0n, decimalesSource: 18 }).etat === 'REFUSE');
ok('supply negative -> REFUSE', dimensionner({ supplySource: -1n, decimalesSource: 18 }).etat === 'REFUSE');
ok('supply en Number -> REFUSE (pas de flottant sur un montant)',
  dimensionner({ supplySource: 1000, decimalesSource: 18 }).etat === 'REFUSE');
ok('aucun argument -> REFUSE', dimensionner().etat === 'REFUSE');
ok('decimales > MAX -> REFUSE',
  dimensionner({ supplySource: 1000n, decimalesSource: DECIMALES_MAX + 1 }).etat === 'REFUSE');
ok('decimales negatives -> REFUSE',
  dimensionner({ supplySource: 1000n, decimalesSource: DECIMALES_MIN - 1 }).etat === 'REFUSE');
ok('decimales non entieres -> REFUSE',
  dimensionner({ supplySource: 1000n, decimalesSource: 6.5 }).etat === 'REFUSE');
ok('ratio.bas = 0 -> REFUSE (pas de division par zero)',
  dimensionner({ supplySource: 1000n, decimalesSource: 18, ratio: { haut: 1n, bas: 0n } }).etat === 'REFUSE');
ok('ratio null -> REFUSE',
  dimensionner({ supplySource: 1000n, decimalesSource: 18, ratio: null }).etat === 'REFUSE');
/* ⛔ UN ARRONDI VERS ZERO EST UN REFUS, PAS UN RESULTAT. */
ok('arrondi a zero -> REFUSE, jamais supply 0', (() => {
  const d = dimensionner({ supplySource: 1n, decimalesSource: 18, decimalesB20: 0, ratio: { haut: 1n, bas: 1n } });
  return d.etat === 'REFUSE' && d.pourquoi === 'ARRONDI_A_ZERO' && d.supplyB20 === null;
})(), dimensionner({ supplySource: 1n, decimalesSource: 18, decimalesB20: 0 }));
ok('chaque refus PORTE un motif', (() => {
  const cas = [dimensionner(), dimensionner({ supplySource: 0n, decimalesSource: 18 }),
    dimensionner({ supplySource: 1n, decimalesSource: 99 })];
  return cas.every((c) => c.etat === 'REFUSE' && typeof c.pourquoi === 'string' && c.pourquoi.length > 0);
})());

console.log('ecartDeParite');
ok('parite exacte -> ecart 0 et exact=true', (() => {
  const e = ecartDeParite({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 });
  return e.etat === 'OK' && e.ecart === 0n && e.exact === true;
})(), ecartDeParite({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 }));
/* ⛔ UNE PERTE D ARRONDI DOIT SE VOIR — c est le defaut a ne pas livrer en silence. */
ok('perte d arrondi -> ecart NON NUL et exact=false', (() => {
  const e = ecartDeParite({ supplySource: 10n, decimalesSource: 18, decimalesB20: 18, ratio: { haut: 1n, bas: 3n } });
  return e.etat === 'OK' && e.ecart > 0n && e.exact === false;
})(), ecartDeParite({ supplySource: 10n, decimalesSource: 18, ratio: { haut: 1n, bas: 3n } }));
ok('entree refusee -> REFUSE avec le motif', (() => {
  const e = ecartDeParite({ supplySource: 0n, decimalesSource: 18 });
  return e.etat === 'REFUSE' && e.ecart === null && typeof e.pourquoi === 'string';
})());

console.log('prixInitialPourFdvEgale');
ok('meme supply -> prix identique (fraction egale)', (() => {
  const p = prixInitialPourFdvEgale({ supplySource: 1000n, prixSourceNumerateur: 7n, supplyB20: 1000n });
  return p.etat === 'OK' && p.prix.haut === 7000n && p.prix.bas === 1000n;
})(), prixInitialPourFdvEgale({ supplySource: 1000n, prixSourceNumerateur: 7n, supplyB20: 1000n }));
ok('supply DOUBLE -> prix de MOITIE (fdv conservee)', (() => {
  const p = prixInitialPourFdvEgale({ supplySource: 1000n, prixSourceNumerateur: 8n, supplyB20: 2000n });
  /* 8000/2000 = 4 = moitie de 8 */
  return p.prix.haut === 8000n && p.prix.bas === 2000n;
})());
ok('rend une FRACTION, pas un flottant', (() => {
  const p = prixInitialPourFdvEgale({ supplySource: 3n, prixSourceNumerateur: 1n, supplyB20: 7n });
  return typeof p.prix.haut === 'bigint' && typeof p.prix.bas === 'bigint';
})());
ok('supplyB20 = 0 -> REFUSE',
  prixInitialPourFdvEgale({ supplySource: 1000n, prixSourceNumerateur: 7n, supplyB20: 0n }).etat === 'REFUSE');
ok('prix source 0 -> REFUSE',
  prixInitialPourFdvEgale({ supplySource: 1000n, prixSourceNumerateur: 0n, supplyB20: 1000n }).etat === 'REFUSE');
ok('denominateur 0 -> REFUSE', prixInitialPourFdvEgale({
  supplySource: 1000n, prixSourceNumerateur: 7n, prixSourceDenominateur: 0n, supplyB20: 1000n }).etat === 'REFUSE');
ok('aucun argument -> REFUSE', prixInitialPourFdvEgale().etat === 'REFUSE');

console.log('avertissementNonAdosse — la phrase qui ne peut pas manquer');
ok('dit que ce n est PAS une creance', /not a claim/i.test(avertissementNonAdosse()));
ok('dit que RIEN ne l adosse', /nothing backs it/i.test(avertissementNonAdosse()));
ok('dit que PERSONNE ne le rachete', /no one redeems/i.test(avertissementNonAdosse()));
ok('dit que le prix peut S ECARTER', /drift/i.test(avertissementNonAdosse()));

console.log('phraseDimension');
ok('null PARLE', phraseDimension(null).length > 0, phraseDimension(null));
ok('etat inconnu PARLE', phraseDimension({ etat: 'PIZZA' }).length > 0);
/* ⛔ UN REFUS MUET PASSE POUR UN ACCORD. */
ok('un REFUS PARLE et dit « nothing to sign »', (() => {
  const p = phraseDimension(dimensionner({ supplySource: 0n, decimalesSource: 18 }));
  return /nothing to sign/i.test(p);
})(), phraseDimension(dimensionner({ supplySource: 0n, decimalesSource: 18 })));
ok('un refus PORTE son motif dans la phrase', (() => {
  const p = phraseDimension(dimensionner({ supplySource: 1n, decimalesSource: 18, decimalesB20: 0 }));
  return /ARRONDI_A_ZERO/.test(p);
})(), phraseDimension(dimensionner({ supplySource: 1n, decimalesSource: 18, decimalesB20: 0 })));
/* ⛔⛔ LE SUCCES AUSSI DOIT PORTER L AVERTISSEMENT — sinon on vend un adossement inexistant. */
ok('le SUCCES porte l avertissement non-adosse', (() => {
  const p = phraseDimension(dimensionner({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 }), 'TBLOCK');
  return /not a claim/i.test(p) && /nothing backs it/i.test(p);
})(), phraseDimension(dimensionner({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 }), 'TBLOCK'));
ok('le succes nomme le symbole source', (() => {
  const p = phraseDimension(dimensionner({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 }), 'TBLOCK');
  return /TBLOCK/.test(p);
})());
ok('les etats sont geles', Object.isFrozen(ETATS));

console.log('collisionAvecEmetteur — pas de sosie d action tokenisee');
/* ⛔⛔ UNE GARDE SUR UNE LISTE ABSENTE EST TOUJOURS FAUSSE : ici elle doit REFUSER. */
ok('liste absente -> NON_VERIFIABLE (jamais LIBRE)', (() => {
  const c = collisionAvecEmetteur('MOON', null);
  return c.verdict === 'NON_VERIFIABLE' && c.pourquoi === 'LISTE_EMETTEUR_ABSENTE';
})(), collisionAvecEmetteur('MOON', null));
ok('liste VIDE -> NON_VERIFIABLE (une liste vide laisserait tout passer)',
  collisionAvecEmetteur('MOON', []).verdict === 'NON_VERIFIABLE');
ok('symbole vide -> NON_VERIFIABLE', collisionAvecEmetteur('', ['AAPLc']).verdict === 'NON_VERIFIABLE');
ok('symbole d espaces -> NON_VERIFIABLE', collisionAvecEmetteur('   ', ['AAPLc']).verdict === 'NON_VERIFIABLE');
ok('un symbole libre -> LIBRE', collisionAvecEmetteur('MOON', ['AAPLc', 'METAc']).verdict === 'LIBRE');
/* Les trois formes de collision. */
ok('EGAL -> COLLISION et nomme le jeton reel', (() => {
  const c = collisionAvecEmetteur('AAPLc', ['AAPLc']);
  return c.verdict === 'COLLISION' && c.pourquoi === 'EGAL' && c.contre === 'AAPLc';
})(), collisionAvecEmetteur('AAPLc', ['AAPLc']));
/* ⛔ LE CAS DANGEREUX : « AAPL » a cote du vrai « AAPLc ». */
ok('AAPL contre AAPLc -> COLLISION', (() => {
  const c = collisionAvecEmetteur('AAPL', ['AAPLc']);
  return c.verdict === 'COLLISION' && c.pourquoi === 'SUFFIXE_EMETTEUR' && c.contre === 'AAPLc';
})(), collisionAvecEmetteur('AAPL', ['AAPLc']));
ok('AAPLc contre AAPL -> COLLISION (sens inverse)', (() => {
  const c = collisionAvecEmetteur('AAPLc', ['AAPL']);
  return c.verdict === 'COLLISION' && c.pourquoi === 'SUFFIXE_AJOUTE';
})(), collisionAvecEmetteur('AAPLc', ['AAPL']));
ok('la casse est ignoree', collisionAvecEmetteur('aApLc', ['AAPLc']).verdict === 'COLLISION');
ok('les espaces autour sont ignores', collisionAvecEmetteur('  AAPLc ', ['AAPLc']).verdict === 'COLLISION');
/* ⛔ MON TEST S EST TROMPE ICI, PAS LE CODE. J avais ecrit « AAPLcc = deux lettres d ecart
 *   donc LIBRE » : c est UNE lettre de plus que AAPLc, et un AAPLcc pose a cote d un AAPLc
 *   reel est precisement le sosie qu on refuse. Le cas garde donc sa vraie valeur. */
ok('AAPLcc contre AAPLc -> COLLISION (une lettre ajoutee)',
  collisionAvecEmetteur('AAPLcc', ['AAPLc']).verdict === 'COLLISION',
  collisionAvecEmetteur('AAPLcc', ['AAPLc']));
/* ⛔ TEMOIN DE SUR-REFUS : la garde ne doit PAS refuser tout, sinon elle efface le produit
 *   (13 puces tombees a 2 EN PROD). Deux lettres de plus ne collisionnent pas. */
ok('DEUX lettres de plus -> LIBRE (la garde ne sur-refuse pas)',
  collisionAvecEmetteur('AAPLczz', ['AAPLc']).verdict === 'LIBRE',
  collisionAvecEmetteur('AAPLczz', ['AAPLc']));
ok('un prefixe COMMUN mais plus court -> LIBRE', collisionAvecEmetteur('AA', ['AAPLc']).verdict === 'LIBRE');
/* ⚠️ BORNE DECLAREE, PAS UN TROU CACHE : une variante de MEME longueur n est PAS attrapee.
 *   `AAPLx` passe. La garde couvre l egalite et l ecart d UNE lettre en fin ; elle ne fait
 *   pas de distance d edition. Je l ecris ici pour que personne ne la croie complete. */
ok('BORNE : meme longueur, derniere lettre differente -> LIBRE (non couvert, et c est dit)',
  collisionAvecEmetteur('AAPLx', ['AAPLc']).verdict === 'LIBRE',
  collisionAvecEmetteur('AAPLx', ['AAPLc']));
ok('les entrees vides de la liste sont ignorees, pas fatales',
  collisionAvecEmetteur('MOON', ['', null, 'AAPLc']).verdict === 'LIBRE');
ok('les verdicts sont geles', Object.isFrozen(VERDICTS_COLLISION));

console.log('collisionAvecEmetteur — sur la VRAIE liste du produit');
const SYMS = ACTIONS_COINBASE.map((a) => a.symbole);
ok('la liste du produit n est pas vide', SYMS.length > 0, SYMS.length);
ok('le premier symbole reel collisionne avec lui-meme',
  collisionAvecEmetteur(SYMS[0], SYMS).verdict === 'COLLISION', SYMS[0]);
ok('sa forme sans le suffixe collisionne aussi', (() => {
  const s = SYMS.find((x) => /c$/.test(x));
  if (!s) return true;   /* rien a tester si aucun ne finit par c */
  return collisionAvecEmetteur(s.slice(0, -1), SYMS).verdict === 'COLLISION';
})(), SYMS.find((x) => /c$/.test(x)));
ok('un symbole inventé reste LIBRE sur la vraie liste',
  collisionAvecEmetteur('ZZQXWV', SYMS).verdict === 'LIBRE');

console.log('phraseCollision');
ok('null PARLE', phraseCollision(null).length > 0);
ok('NON_VERIFIABLE PARLE et dit qu on refuse de remplir', (() => {
  const s = phraseCollision(collisionAvecEmetteur('MOON', null));
  return /refusing to fill/i.test(s) && /LISTE_EMETTEUR_ABSENTE/.test(s);
})(), phraseCollision(collisionAvecEmetteur('MOON', null)));
/* ⛔ LE REFUS DOIT NOMMER LE JETON REEL, sinon il passe pour un bug. */
ok('COLLISION nomme le jeton reel ET dit « back nothing »', (() => {
  const s = phraseCollision(collisionAvecEmetteur('AAPL', ['AAPLc']));
  return /AAPLc/.test(s) && /back nothing/i.test(s) && /will not fill it in/i.test(s);
})(), phraseCollision(collisionAvecEmetteur('AAPL', ['AAPLc'])));
ok('LIBRE est MUET (seul un succes a le droit de se taire)',
  phraseCollision(collisionAvecEmetteur('MOON', ['AAPLc'])) === '');

console.log('planDepuisJetonAvecSupplyScellee — la supply N EST PAS choisissable');
/* ⛔⛔ LE CAS QUI M A ARRETE : sans supply scellee, un appelant supposerait la sienne. */
ok('supply scellee ABSENTE -> REFUSE', (() => {
  const p = planDepuisJetonAvecSupplyScellee({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 });
  return p.etat === 'REFUSE' && p.pourquoi === 'SUPPLY_SCELLEE_ABSENTE';
})(), planDepuisJetonAvecSupplyScellee({ supplySource: TBLOCK_SUPPLY, decimalesSource: 18 }));
ok('supply scellee a 0 -> REFUSE', planDepuisJetonAvecSupplyScellee({
  supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: 0n }).etat === 'REFUSE');
/* Le cas REEL : le TBLOCK d openlaunch porte la MEME supply que nos blocks. */
ok('TBLOCK : parite EXACTE (meme supply, memes decimales)', (() => {
  const p = planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE });
  return p.etat === 'OK' && p.pariteExacte === true && p.supplySourceRamenee === SUPPLY_FIXE;
})(), planDepuisJetonAvecSupplyScellee({
  supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
ok('une supply DIFFERENTE -> parite FAUSSE (pas de « 1 pour 1 » menteur)', (() => {
  const p = planDepuisJetonAvecSupplyScellee({
    supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE });
  return p.etat === 'OK' && p.pariteExacte === false;
})());
ok('decimales differentes, meme nombre d unites -> parite EXACTE', (() => {
  /* 1 milliard d unites a 6 decimales == 1 milliard d unites a 18 decimales. */
  const p = planDepuisJetonAvecSupplyScellee({
    supplySource: 1000000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE });
  return p.etat === 'OK' && p.pariteExacte === true;
})(), planDepuisJetonAvecSupplyScellee({
  supplySource: 1000000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE }));
ok('sans prix source -> prixInitial null (on n invente pas un prix)', (() => {
  const p = planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE });
  return p.prixInitial === null;
})());
ok('avec prix source -> une FRACTION entiere', (() => {
  const p = planDepuisJetonAvecSupplyScellee({
    supplySource: 1000n, decimalesSource: 18, supplyScellee: 2000n, prixSourceNumerateur: 8n });
  return p.etat === 'OK' && typeof p.prixInitial.haut === 'bigint' && p.prixInitial.bas === 2000n;
})(), planDepuisJetonAvecSupplyScellee({
  supplySource: 1000n, decimalesSource: 18, supplyScellee: 2000n, prixSourceNumerateur: 8n }));
ok('prix source invalide -> REFUSE', planDepuisJetonAvecSupplyScellee({
  supplySource: 1000n, decimalesSource: 18, supplyScellee: 2000n,
  prixSourceNumerateur: 0n }).etat === 'REFUSE');

console.log('phrasePlanScelle');
ok('null PARLE', phrasePlanScelle(null).length > 0);
ok('un REFUS PARLE', /nothing to sign/i.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({}))));
/* ⛔⛔ LA SUPPLY FIXE DOIT ETRE DITE DANS LES DEUX CAS — sinon on croit l avoir choisie. */
ok('parite exacte : dit la supply FIXE ET « one block stands for one <jeton> »', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO');
  return /fixed 1 billion/i.test(s) && /do not choose/i.test(s)
    && /one block stands for one AERO/.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO'));
/* ⛔ LE SYMBOLE NE S INVENTE PAS : sans lui, « source token », jamais un ticker devine. */
ok('sans symbole -> « source token », pas un nom invente', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return /one source token/.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));
ok('un symbole vide ou blanc retombe sur « source token »',
  /source token/.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), '   ')));
ok('parite FAUSSE : dit la supply fixe SANS promettre 1 pour 1', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return /fixed 1 billion/i.test(s) && !/one block stands for one token/i.test(s)
    && /pool price carries the difference/i.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));

/* ⛔⛔ LE RATIO : UNE VALEUR QUI ETAIT CALCULEE PUIS JETEE.
 *   `planDepuisJetonAvecSupplyScellee` rend `supplySourceRamenee` ; la phrase ne s en servait que
 *   pour un booleen et abandonnait la grandeur. Le lecteur voyait « the opening pool price carries
 *   the difference » sans le SENS ni le FACTEUR — un facteur sans son montant, la meme faute que
 *   le frais sans chiffre. Trouve par Phil sur l ecran AERO (2026-09-30), corrige AU GLOBAL. */
console.log('ratioParBlock — en entiers, et le zero est interdit');
/* La vraie supply d AERO, LUE sur Base mainnet le 2026-09-30 : 1 988 034 890,229641792427930557 */
const AERO_SUPPLY = 1988034890229641792427930557n;
ok('AERO mesure -> 1.988034 (calcul en bigint, pas en flottant)', (() => {
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return r.etat === 'OK' && r.texte === '1.988034' && r.exact === false;
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));
ok('un rapport EXACT est marque exact (pas de « ~ » en trop)', (() => {
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: 2000000000n * 10n ** 18n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return r.etat === 'OK' && r.texte === '2' && r.exact === true;
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: 2000000000n * 10n ** 18n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));
ok('un ratio SOUS 1 s affiche (le sens compte autant que le chiffre)', (() => {
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: 500000000n * 10n ** 18n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return r.etat === 'OK' && r.texte === '0.5';
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: 500000000n * 10n ** 18n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));
/* ⛔⛔ LE « ~ » NE DOIT PAS MENTIR, DANS LES DEUX SENS. Un ratio de 1,2 est EXACT a 6 decimales :
 *   l afficher « ~1.2 » apprend au lecteur a ignorer le « ~ », et il l ignorera sur AERO, ou le
 *   « ~ » est vrai. Defaut trouve en lisant la sortie rendue, pas le code. */
ok('un ratio non entier mais EXACT a l affichage n est PAS marque approximatif', (() => {
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: 1200000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE }));
  return r.etat === 'OK' && r.texte === '1.2' && r.exact === true;
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: 1200000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE })));
ok('et la phrase ne porte alors AUCUN « ~ »',
  !/~/.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: 1200000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE }), 'SIX')),
  phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: 1200000000n * 10n ** 6n, decimalesSource: 6, supplyScellee: SUPPLY_FIXE }), 'SIX'));
/* ⛔ ET DANS L AUTRE SENS : AERO est coupe, donc le « ~ » DOIT y etre. Sans cette moitie, un
 *   `exact: true` constant passerait les deux assertions precedentes. */
ok('un ratio COUPE porte bien le « ~ » (AERO)',
  /~1\.988034/.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO')),
  phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO'));
/* ⛔⛔ LE CAS QUI COMPTE LE PLUS : un ratio reel mais invisible a cette precision. Rendre « 0 »
 *   ferait lire « ce block ne represente rien », ce qui est FAUX — les deux supplies sont > 0. */
ok('un ratio plus petit que la precision -> SOUS_PRECISION, JAMAIS « 0 »', (() => {
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  return r.etat === 'SOUS_PRECISION' && r.texte === null;
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));
ok('et la phrase le DIT au lieu de rester vague', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'TINY');
  return /not shown here/i.test(s) && /smaller than this screen/i.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: 42n, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'TINY'));
ok('un plan REFUSE -> REFUSE, pas un ratio inventé',
  ratioParBlock(planDepuisJetonAvecSupplyScellee({})).etat === 'REFUSE');
ok('sans plan du tout -> REFUSE', ratioParBlock(null).etat === 'REFUSE'
  && ratioParBlock().etat === 'REFUSE');
/* ⛔⛔ MON PREMIER TEST ICI ETAIT FAUX, ET SA JUSTIFICATION ETAIT UN OVERCLAIM. Il prenait deux
 *   supplies separees d un wei et attendait des ratios differents « impossibles en flottant ».
 *   Or cet ecart tombe SOUS les 6 decimales affichees : les deux rendent « 1 », correctement, et
 *   `a.exact === b.exact`. Et surtout : a 6 decimales sur un ratio proche de 1, le flottant a
 *   largement assez de chiffres — il ne perdrait rien de VISIBLE. L assertion ne prouvait pas ce
 *   qu elle annonçait.
 * ✅ LA OU LE FLOTTANT CASSE VRAIMENT, C EST LA PARTIE ENTIERE D UN TRES GROS RATIO : au-dela de
 *   2^53, `Number` ne represente plus les entiers exactement, et un ratio affiche serait faux dans
 *   ses derniers chiffres — cru, parce qu il a l air precis. Le bigint, lui, les rend tous. */
ok('un ratio au-dela de 2^53 garde TOUS ses chiffres (la ou le flottant casse)', (() => {
  /* ramenee / scellee == 2^80 exactement : un entier que Number ne peut pas porter. */
  const attendu = (2n ** 80n).toString();
  const r = ratioParBlock(planDepuisJetonAvecSupplyScellee({
    supplySource: (2n ** 80n) * SUPPLY_FIXE, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }));
  const parFlottant = String(Number((2n ** 80n) * SUPPLY_FIXE) / Number(SUPPLY_FIXE));
  /* ⛔ Le test ne vaut que si le flottant se trompe VRAIMENT ici — sinon il ne prouve rien. */
  return r.etat === 'OK' && r.texte === attendu && r.exact === true && parFlottant !== attendu;
})(), ratioParBlock(planDepuisJetonAvecSupplyScellee({
  supplySource: (2n ** 80n) * SUPPLY_FIXE, decimalesSource: 18, supplyScellee: SUPPLY_FIXE })));

console.log('phrasePlanScelle — le ratio a l ecran, et ce qu il ne promet PAS');
ok('AERO : la phrase porte LE FACTEUR et LE SENS', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO');
  return /1\.988034/.test(s) && /one block stands for/.test(s) && /AERO/.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO'));
/* ⛔ ET ELLE DIT « by supply » : un ratio de SUPPLY n est pas un ancrage de PRIX. */
ok('elle nomme la SUPPLY, pas une valeur',
  /by supply/i.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO')));
/* ⛔⛔ LA GARDE ANTI-ADOSSEMENT : le ratio ne doit JAMAIS se lire comme un rachat ou une garantie.
 *   C est la seule crainte qui justifiait de ne pas l afficher — donc elle se teste. */
ok('la phrase ne promet ni adossement, ni rachat, ni garantie', (() => {
  const s = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO');
  return !/backed/i.test(s) && !/redeem/i.test(s) && !/guarantee/i.test(s)
    && !/worth/i.test(s) && !/equals/i.test(s) && !/pegged/i.test(s);
})(), phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
  supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO'));
/* ⛔ ET LE MEME VERBE DANS LES DEUX BRANCHES : seul le NOMBRE change. Un verbe different ferait
 *   lire le cas non-exact comme une promesse d une autre nature. */
ok('le verbe est le MEME a parite exacte et hors parite', (() => {
  const exact = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: TBLOCK_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'X');
  const pas = phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'X');
  return /one block stands for/.test(exact) && /one block stands for/.test(pas);
})());
/* ⛔ ET LA SUPPLY FIXE RESTE DITE DANS TOUS LES CAS — sinon on croit l avoir choisie. */
ok('la supply fixe est dite meme avec le ratio affiche',
  /fixed 1 billion/i.test(phrasePlanScelle(planDepuisJetonAvecSupplyScellee({
    supplySource: AERO_SUPPLY, decimalesSource: 18, supplyScellee: SUPPLY_FIXE }), 'AERO')));

console.log('planDeFrais — fail-closed, un chemin gratuit ne se produit pas');
/* ⛔⛔ LE CAS QUI PROTEGE LE REVENU : oublier le frais doit REFUSER, pas livrer gratuit. */
ok('frais d ouverture absent -> REFUSE', (() => {
  const p = planDeFrais({ bpsInterface: 50n, beneficiaire: FEE_WALLET });
  return p.etat === 'REFUSE' && p.pourquoi === 'FRAIS_OUVERTURE_ABSENT';
})(), planDeFrais({ bpsInterface: 50n, beneficiaire: FEE_WALLET }));
ok('frais d ouverture a 0 -> REFUSE (0 n est pas un frais)',
  planDeFrais({ fraisOuvertureWei: 0n, bpsInterface: 50n, beneficiaire: FEE_WALLET }).etat === 'REFUSE');
ok('taux d interface absent -> REFUSE', (() => {
  const p = planDeFrais({ fraisOuvertureWei: 1000n, beneficiaire: FEE_WALLET });
  return p.etat === 'REFUSE' && p.pourquoi === 'TAUX_INTERFACE_ABSENT';
})());
ok('aucun argument -> REFUSE', planDeFrais().etat === 'REFUSE');
console.log('planDeFrais — le beneficiaire');
ok('beneficiaire absent -> REFUSE', (() => {
  const p = planDeFrais({ fraisOuvertureWei: 1000n, bpsInterface: 50n });
  return p.etat === 'REFUSE' && p.pourquoi === 'BENEFICIAIRE_INVALIDE';
})());
/* ⛔ UNE ADRESSE TRONQUEE NE SE COMPLETE PAS — elle se refuse. */
ok('adresse TRONQUEE -> REFUSE', planDeFrais({
  fraisOuvertureWei: 1000n, bpsInterface: 50n, beneficiaire: '0xa6cf99d3' }).etat === 'REFUSE');
ok('adresse trop LONGUE -> REFUSE', planDeFrais({
  fraisOuvertureWei: 1000n, bpsInterface: 50n, beneficiaire: FEE_WALLET + 'ab' }).etat === 'REFUSE');
ok('adresse sans 0x -> REFUSE', planDeFrais({
  fraisOuvertureWei: 1000n, bpsInterface: 50n, beneficiaire: FEE_WALLET.slice(2) }).etat === 'REFUSE');
ok('caractere non hexa -> REFUSE', planDeFrais({
  fraisOuvertureWei: 1000n, bpsInterface: 50n, beneficiaire: '0xZZcf99d35949c6cb911adb910078f4ca46f0f5d4' }).etat === 'REFUSE');

console.log('planDeFrais — les VRAIS chiffres du produit');
/* ⛔ AUCUN MONTANT ECRIT A LA MAIN : ils viennent des modules de frais. */
const P = planDeFrais({
  fraisOuvertureWei: FRAIS_OUVERTURE_WEI,
  bpsInterface: FRAIS_INTERFACE_BPS,
  beneficiaire: FEE_WALLET,
});
ok('plan accepte avec les constantes du produit', P.etat === 'OK', P);
ok('l ouverture est bien celle mesuree (frais-creation.js)', P.ouverture === FRAIS_OUVERTURE_WEI);
ok('le taux est bien celui d echange.js', P.bps === FRAIS_INTERFACE_BPS);
ok('le beneficiaire est le wallet de frais, en minuscules',
  P.beneficiaire === FEE_WALLET.toLowerCase());
/* ⛔ TEMOIN : le plan ne doit PAS pointer le puits interdit. */
ok('le beneficiaire n est PAS le puits legacy 37eb',
  P.beneficiaire !== '0x37eb9b7ce0b51fe12fbf092026e001918128580a');

console.log('phraseFraisChemin');
ok('null PARLE', phraseFraisChemin(null).length > 0);
ok('un REFUS PARLE et dit qu on refuse de construire', (() => {
  const s = phraseFraisChemin(planDeFrais());
  return /refusing to build/i.test(s) && /FRAIS_OUVERTURE_ABSENT/.test(s);
})(), phraseFraisChemin(planDeFrais()));
/* ⛔⛔⛔ CETTE ASSERTION TENAIT LA PHRASE FAUSSE, ET C EST PIRE QU UNE ABSENCE DE TEST.
 *   Elle exigeait « bps » et « every in-app trade » — donc elle GARANTISSAIT que l ecran annonce
 *   50 bps pour un echange qui coute 3 % sur une pool ouverte ici (`HOOK_PREVU_FRAIS_BPS = 300`).
 *   Un test vert qui tient la mauvaise moitie empeche la correction au lieu de la proteger.
 *   Trouve par Zero 1 (2026-09-30) ; verifie dans le code avant de toucher au test. */
/* ⛔⛔ ET LA MEME FAUTE UNE SECONDE FOIS, SUR LA MEME PHRASE. L assertion d avant exigeait
 *   « opening fee » et « 3% » — et passait donc VERTE sur « One-off market opening fee. », une
 *   ligne de frais SANS AUCUN MONTANT. Elle tenait la moitie du sujet (le taux d echange) et
 *   laissait l autre moitie vide (le prix a payer maintenant), alors que l onglet d a cote
 *   annonce « 0.001 ETH ». Trouve par Phil sur l ecran AERO (2026-09-30).
 *   ⇒ Le test exige desormais LE CHIFFRE. Un test qui ne reclame pas le montant autorise une
 *     phrase qui le cache. */
const FRAIS_OUVERTURE_WEI_TEST = 1000000000000000n; /* = frais-creation.js:70, 0,001 ETH */
ok('le succes dit LE MONTANT du frais de naissance', (() => {
  const s = phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST);
  return /0\.001/.test(s) && /ETH/.test(s);
})(), phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
ok('et il dit QUAND on le paie', (() => {
  const s = phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST);
  /* 2026-10-04 (Phil) : « once » retire de tous les textes de frais — la phrase dit toujours QUAND (a la signature dans Create) */
  return /when you sign in Create/.test(s) && !/once/i.test(s);
})(), phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
ok('et il garde le cout REEL du marche a cote', (() => {
  const s = phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST);
  return /3%/.test(s) && /whatever its market charges/i.test(s);
})(), phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
/* ⛔ LE NOM EST CELUI DE L AUTRE ECRAN. Deux noms pour un seul frais, c est deux frais aux yeux
 *   du lecteur. `app.html:1834` dit « Birth fee » — cet ecran-ci le dit pareil. */
ok('le frais porte le MEME nom que sur l autre ecran',
  /Birth fee/i.test(phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST)),
  phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
/* ⛔⛔ LE CAS QUI COMPTE LE PLUS : montant non passe. La phrase ne doit PAS se contenter de parler
 *   de frais sans chiffre — c est exactement l etat qu on vient de corriger. */
ok('sans montant, elle DIT que le montant manque', (() => {
  const s = phraseFraisChemin(P);
  return /not read/i.test(s) && /Create/.test(s);
})(), phraseFraisChemin(P));
ok('sans montant, elle n INVENTE aucun chiffre de frais de naissance',
  !/0\.001/.test(phraseFraisChemin(P)), phraseFraisChemin(P));
ok('un montant en Number est refuse comme un montant absent',
  /not read/i.test(phraseFraisChemin(P, 0.001)), phraseFraisChemin(P, 0.001));
ok('un montant nul est refuse comme un montant absent',
  /not read/i.test(phraseFraisChemin(P, 0n)), phraseFraisChemin(P, 0n));
/* ⛔ LE FORMATAGE NE PASSE PAS PAR LE FLOTTANT : un frais affiche faux est pire qu un frais cache. */
ok('un wei entier s affiche sans decimale parasite',
  / 1 ETH/.test(phraseFraisChemin(P, 1000000000000000000n)),
  phraseFraisChemin(P, 1000000000000000000n));
ok('un wei minuscule garde tous ses chiffres',
  /0\.000000000000000001 ETH/.test(phraseFraisChemin(P, 1n)),
  phraseFraisChemin(P, 1n));
/* ⛔ LA GARDE ANTI-RETOUR : la phrase ne doit PLUS annoncer notre taux d interface comme si
 *   c etait le prix d un echange. « 50 bps » mis en avant ici sous-evaluait d un facteur six. */
ok('la phrase n annonce PLUS « 50 bps » comme prix d un echange',
  !/50\s*bps/i.test(phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST)),
  phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
/* ⛔ ET ELLE DIT QUE LE TAUX DEPEND DU MARCHE : un chiffre unique serait faux des qu il y a
 *   plus d un marche possible, et il y en a plus d un. */
ok('elle renvoie a l ecran du marche pour le taux exact',
  /exact rate/i.test(phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST)),
  phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
/* ⛔⛔ ET L ABSOLU NON PROUVE EST INTERDIT DE RETOUR. La phrase disait « EVERY screen shows the
 *   exact rate » ; mesure : `libelleFrais` est appele sur TROIS ecrans d `app.html` (8479, 10326,
 *   10433). Trois n est pas « tous », et je ne sais pas prouver « tous » — donc la phrase nomme
 *   l ecran ou la mesure tient, et ce test refuse que l absolu revienne. */
ok('elle ne promet PLUS « every screen »',
  !/every screen/i.test(phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST)),
  phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));
ok('elle nomme l ecran de marche',
  /market screen/i.test(phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST)),
  phraseFraisChemin(P, FRAIS_OUVERTURE_WEI_TEST));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
