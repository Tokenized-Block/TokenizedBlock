/* Ce que ce test tient — et pourquoi chaque cas existe.
 *
 * Le dimensionnement decide combien d unites un utilisateur recoit. Une perte d arrondi
 * SILENCIEUSE afficherait « 1:1 » et livrerait autre chose : c est le defaut a ne pas
 * expedier. Les cas d arrondi sont donc les plus nombreux ici, pas les plus rares.
 */
import {
  DECIMALES_MIN, DECIMALES_MAX, ETATS,
  avertissementNonAdosse, dimensionner, prixInitialPourFdvEgale, ecartDeParite, phraseDimension,
  planDeFrais, phraseFraisChemin,
} from './tokeniser-un-jeton.js';
import { FEE_WALLET, FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { FRAIS_INTERFACE_BPS } from './echange.js';

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
ok('le succes dit les DEUX lignes (ouverture + bps)', (() => {
  const s = phraseFraisChemin(P);
  return /opening fee/i.test(s) && /bps/.test(s) && /every in-app trade/i.test(s);
})(), phraseFraisChemin(P));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
