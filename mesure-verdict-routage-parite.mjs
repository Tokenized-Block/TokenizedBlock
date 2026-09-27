/* mesure-verdict-routage-parite.mjs — LE NOUVEAU VERDICT CHANGE-T-IL QUI VOIT « BUY » ?
 *
 * ⛔⛔ POURQUOI CETTE SONDE EXISTE. Le 2026-09-27 j ai remplace la garde `!poolAdr` par un verdict
 *     qui exige EN PLUS `dex === 'uniswap'`. Mesure faite avant de deployer : sur les 155 lignes
 *     servies, `poolAdr` nul ⟺ uniswap v4 (140 = 143 uniswap - 3 en v3), donc les deux gardes
 *     designent EXACTEMENT le meme ensemble. Le changement etait purement explicatif.
 *   ⛔ MAIS « identique aujourd hui » n est pas « identique demain ». Le jour ou un block ouvre une
 *     pool v4 sur un dex qui n est pas Uniswap, l ancienne garde montrerait Buy et la nouvelle non —
 *     a raison, puisque notre router ne connait pas cette factory. Cette sonde le VERRA au lieu de
 *     laisser la divergence passer pour un bug d affichage.
 *
 * ⛔ CE QU ELLE MESURE : la parite entre les deux gardes sur les donnees REELLEMENT SERVIES, et la
 *   repartition des verdicts. Rien d autre.
 * ⚠️ CE QU ELLE NE PROUVE PAS : qu un achat aboutisse, ni que la repartition soit stable. Elle
 *   photographie l instant et nomme chaque ecart.
 * ⛔ LECTURE SEULE, `x-ms-monitor: 1`. Aucune signature.
 */
import { verdictRoutage } from './routage.js';

const H = { 'x-ms-monitor': '1' };
const r = await fetch('https://tokenizedblock.space/api/trending', { headers: H });
if (!r.ok) { console.error('⛔ /api/trending a repondu ' + r.status + ' — SONDE NON CONCLUANTE, pas un succes'); process.exit(1); }
const lignes = (await r.json()).lignes || [];
if (!lignes.length) { console.error('⛔ aucune ligne servie — SONDE NON CONCLUANTE'); process.exit(1); }

/* ⛔ L ANCIENNE GARDE, RECOPIEE TELLE QUELLE pour que la comparaison ait un sens. Si on la
 *   reecrivait « en mieux », on comparerait le nouveau code a lui-meme. */
const ancienneGarde = (l) => Boolean(l) && !Boolean(l.poolAdr);

const compte = {}; const ecarts = []; let sansDex = 0;
for (const l of lignes) {
  if (!l.dex) sansDex += 1;
  const v = verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr });
  compte[v.verdict] = (compte[v.verdict] || 0) + 1;
  if (v.achetableIci !== ancienneGarde(l)) {
    ecarts.push({ sym: l.sym || l.adr, dex: l.dex, poolAdr: l.poolAdr ? 'oui' : 'non',
      ancien: ancienneGarde(l), nouveau: v.achetableIci, verdict: v.verdict,
      liq: Math.round(Number(l.liquiditeUsd) || 0) });
  }
}

console.log('lignes servies          : ' + lignes.length);
console.log('lignes sans champ `dex` : ' + sansDex
  + (sansDex ? '   ⛔ un dex absent tombe en FRANCHISSEMENT — Buy masque' : '   (le champ est toujours servi)'));
console.log('\nrepartition des verdicts :');
for (const [k, v] of Object.entries(compte).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(20) + v);

console.log('\n=== PARITE AVEC L ANCIENNE GARDE ===');
if (!ecarts.length) {
  console.log('  0 ecart sur ' + lignes.length + ' lignes : les deux gardes designent le meme ensemble.');
} else {
  /* ⛔ ON NE DIT PAS « ECHEC » : un ecart peut etre le nouveau verdict qui a RAISON. On le montre,
   *   avec sa profondeur, et c est un humain qui tranche. */
  console.log('  ' + ecarts.length + ' ecart(s) — a lire un par un, ce n est pas forcement un defaut :');
  for (const e of ecarts) {
    console.log('    ' + String(e.sym).padEnd(16) + 'dex=' + String(e.dex).padEnd(13)
      + 'poolAdr=' + e.poolAdr.padEnd(4) + 'ancien=' + String(e.ancien).padEnd(6)
      + 'nouveau=' + String(e.nouveau).padEnd(6) + e.verdict.padEnd(20) + '$' + e.liq.toLocaleString('en-US'));
  }
}

/* ⛔ LE CHIFFRE QUI ORIENTE LE TRAVAIL, ET DANS LES DEUX SENS : ce qui reste a gagner, et ce qui
 *   marche deja. Ne publier que le premier serait de la vente. */
const somme = (p) => lignes.filter((l) => verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr }).verdict === p)
  .reduce((s, l) => s + (Number(l.liquiditeUsd) || 0), 0);
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
console.log('\n=== CE QUI RESTE SUR LA TABLE ===');
console.log('  deja servi  (IN_APP)            : ' + (compte.IN_APP || 0) + ' blocks, ' + usd(somme('IN_APP')));
console.log('  une commande v3 a ecrire        : ' + (compte.CALLDATA_MANQUANT || 0) + ' blocks, ' + usd(somme('CALLDATA_MANQUANT')));
console.log('  franchissement de familles      : ' + (compte.FRANCHISSEMENT || 0) + ' blocks, ' + usd(somme('FRANCHISSEMENT')));
