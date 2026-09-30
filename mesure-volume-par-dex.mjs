/* OU VIT LE VOLUME DES BLOCKS COTES, ET QUEL PLAFOND NOTRE FRAIS Y ATTEINDRAIT.
 *
 * Pourquoi ca compte : `sweepTokenWithFee` n existe que sur le routeur Aerodrome. Si le
 * volume etait surtout ailleurs, notre rail dans le routeur serait aveugle a l essentiel.
 * Mesure du 2026-09-30 : l inverse est vrai — Aerodrome porte la quasi-totalite du volume.
 *
 * ⛔ LECTURE SEULE. En-tete x-ms-monitor: 1 pour ne pas polluer l entonnoir avec ma
 *   propre circulation de verification (ca m est deja arrive : 9 refus pour 10 visites).
 * ⛔ AUCUN chiffre d ici ne va a l ecran. Le plafond est arithmetique, pas une prevision.
 *
 * Usage : node mesure-volume-par-dex.mjs [base]
 */
import { agregerParDex, plafondFrais, phrasePlafond, verifierForme, DEX_ABSENT } from './volume-par-dex.js';

const BASE = process.argv[2] || 'https://tokenizedblock.space';
const eur = (x) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const r = await fetch(BASE + '/api/trending', { headers: { 'x-ms-monitor': '1' } });
if (!r.ok) { console.log('⛔ /api/trending ' + r.status + ' — rien mesure.'); process.exit(1); }
const j = await r.json();
const lignes = Array.isArray(j.lignes) ? j.lignes : [];

const forme = verifierForme(lignes);
console.log(BASE + '/api/trending');
console.log('  lignes cotees   ' + lignes.length + '   blocksSuivis ' + (j.blocksSuivis ?? '?'));
if (!forme.ok) {
  console.log('  ⛔⛔ FORME REFUSEE (' + forme.raison + ')');
  if (forme.manquants.length) console.log('     champs manquants : ' + forme.manquants.join(', '));
  console.log('     champs vus       : ' + forme.vus.join(' '));
  console.log('  ⇒ Aucun tableau rendu. Un comptage sur un champ absent fait converger');
  console.log('    toutes les lignes dans une case — ca RESSEMBLE a un resultat.');
  process.exit(1);
}
console.log('  forme           ✅ tous les champs attendus presents');
console.log('');

const a = agregerParDex(lignes);
console.log('=== PAR DEX (24 h) ===');
for (const x of a.rangs) {
  console.log('  ' + String(x.blocks).padStart(4) + ' blocks  ' + x.dex.padEnd(14)
    + ' vol ' + eur(x.vol).padStart(14) + ' $'
    + '  liq ' + eur(x.liq).padStart(12) + ' $'
    + '  trades ' + eur(x.trades).padStart(7)
    + '  ' + (100 * x.partVol).toFixed(1).padStart(5) + ' % du vol'
    + '  ticket moyen ' + (x.trades ? eur(x.vol / x.trades) : '?').padStart(7) + ' $');
}
console.log('  ' + '-'.repeat(104));
console.log('  ' + String(a.blocks).padStart(4) + ' blocks  ' + 'TOTAL'.padEnd(14)
  + ' vol ' + eur(a.volTotal).padStart(14) + ' $'
  + '  ' + ' '.repeat(18) + 'trades ' + eur(a.tradesTotal).padStart(7));
if (a.sansDex) {
  console.log('  ⚠️ ' + a.sansDex + ' ligne(s) sans `dex` lisible, rangees sous ' + DEX_ABSENT
    + ' — comptees, jamais reparties au hasard.');
}
console.log('');

const p = plafondFrais(a.volTotal);
console.log('=== PLAFOND DU FRAIS ===');
console.log('  ' + eur(p.plafond) + ' $ / 24 h  a ' + p.bps + ' bps');
console.log('  ' + phrasePlafond(p));
console.log('');
console.log('⚠️ BORNES DE CET INSTRUMENT');
console.log('   · ' + a.blocks + ' blocks COTES sur ' + (j.blocksSuivis ?? '?')
  + ' suivis : ceux sans marche lisible sont absents (et ne portent aucun frais).');
console.log('   · Volume issu d un index public — ce n est pas notre volume.');
console.log('   · `origine` N EST PAS dans cette charge : « ne chez nous » contre « ne');
console.log('     ailleurs » n est PAS separable ici. Ca demande le profil d un block.');
console.log('   · Le taux de capture reel n est pas mesure. Sans lui, le plafond ne dit');
console.log('     rien du revenu — et a6cf avait 0 entree ERC-20 sur 22 h au 2026-09-30.');
