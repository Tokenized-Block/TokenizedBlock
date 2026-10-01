/* PROJECTION DE REVENU a6cf — 0,09 % NET (900 / 1e6 = 9 bps), UNE FOIS PAR SWAP.
 *
 *   node projection-revenu.mjs [/workspace/mp-data/volume-24h.json]
 *
 * ⛔ Deux familles de lignes, JAMAIS melangees :
 *   MESURE       : volume des 24 h avant le bloc de fork, lu en evenements Swap on-chain
 *                  (mesure-volume-24h.mjs), sur les pools du graphe ; c est le volume qui a EXISTE
 *                  sur ces pools, pas celui que notre interface capterait. Donc on le croise avec des
 *                  taux de CAPTURE explicitement HYPOTHETIQUES.
 *   HYPOTHETIQUE : volumes journaliers ronds (10 k$, 100 k$, 1 M$, 10 M$) — aucune mesure.
 * Revenu = floor-free en $ : volume x 900 / 1e6. L arrondi au wei par swap (floor) retire au plus
 * 1 unite de la devise du frais par swap : negligeable a ces echelles, et NOMME ici.
 * Options de recompense (recompense-actions.js, drapeau OFF) : leur cout / leur effet sur a6cf. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FRAIS_PPM, BASE_PPM } from './multipool.js';
import { OPTIONS } from './recompense-actions.js';

const V = process.argv[2] || '/workspace/mp-data/volume-24h.json';
const SORTIE = process.env.SORTIE || '/workspace/canal/projection-revenu-a6cf-2026-10-01.csv';
const taux = Number(FRAIS_PPM) / Number(BASE_PPM); /* 0.0009 */
if (taux !== 0.0009) throw new Error('le taux doit etre 0,09 %');
const vol = existsSync(V) ? JSON.parse(readFileSync(V, 'utf8')) : null;
const lignes = [['nature', 'perimetre', 'volume_jour_usd', 'capture', 'volume_capte_jour_usd', 'a6cf_jour_usd', 'a6cf_30j_usd', 'a6cf_365j_usd', 'optA_cout_coffre_jour_usd', 'optB_cout_coffre_jour_usd', 'optC_coffre_jour_usd', 'optCbis_a6cf_jour_usd', 'source']];
const r2 = (x) => (x === null ? '' : (Math.round(x * 100) / 100).toFixed(2));
function ligne(nature, perimetre, volJour, capture, source) {
  const capte = volJour * capture;
  const a6cf = capte * taux;
  /* A : 3 bps du notionnel eligible, plafonne a 200 $/jour par le coffre (hypothese : tout le capte est eligible, borne haute) */
  const optA = Math.min(capte * Number(OPTIONS.A.tauxBps) / 10000, OPTIONS.A.plafondCoffreJourUsd);
  const optB = OPTIONS.B.budgetSemaineUsd / 7;
  /* C : +1 bp paye par le swapper au coffre, pris APRES les 9 bps de a6cf (PAY_PORTION sur le reste) */
  const optC = capte * (1 - taux) * Number(OPTIONS.C.surchargeBps) / 10000;
  /* C-bis : a6cf a 8 bps au lieu de 9 — CONTRAIRE a la regle, montre pour comparaison */
  const optCbis = capte * 8 / 10000;
  lignes.push([nature, perimetre, r2(volJour), capture, r2(capte), r2(a6cf), r2(a6cf * 30), r2(a6cf * 365), r2(optA), r2(optB), r2(optC), r2(optCbis), source]);
}
if (vol && vol.resume) {
  const r = vol.resume;
  const src = 'Swap on-chain blocs ' + r.debut + '->' + r.fin + ' (' + r.pools + ' pools, ' + r.poolsAvecSwaps + ' avec swaps, tranches perdues ' + r.tranchesPerdues + ')';
  for (const [nom, v] of [['pools touchant un block', r.volumePoolsDeBlocksUsd], ['pools action (sans block)', r.volumePoolsActionsUsd], ['coeur ETH/USDC/OUSD/B20', r.volumeCoeurUsd], ['toutes pools du graphe', r.volumeTotalUsd]]) {
    if (v === undefined || v === null) continue;
    for (const c of [0.01, 0.05, 0.1]) ligne('MESURE x capture HYPOTHETIQUE', nom, v, c, src + ' · capture ' + c * 100 + ' % = HYPOTHESE');
  }
} else lignes.push(['MESURE', 'volume 24 h', 'inconnu', '', '', '', '', '', '', '', '', '', 'volume-24h.json absent : NON MESURE']);
for (const v of [10000, 100000, 1000000, 10000000]) ligne('HYPOTHETIQUE', 'volume journalier rond', v, 1, 'aucune mesure : volume suppose');
const csv = (x) => (/[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x));
writeFileSync(SORTIE, lignes.map((l) => l.map(csv).join(',')).join('\n') + '\n');
for (const l of lignes) console.log(l.slice(0, 8).join(' | '));
console.log('ecrit ' + SORTIE);
