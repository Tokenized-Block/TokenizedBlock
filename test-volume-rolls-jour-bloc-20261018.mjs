/* test-volume-rolls-jour-bloc-20261018.mjs - LA DEPENSE DE JEU VA AU JOUR DE SON BLOC, ET LE CURSEUR NE TOUCHE JAMAIS LA TETE
 *   (revue adverse 2026-10-18 : MOYEN — credit au jour du SCAN : un roll de 23:59 lu a 00:01 comptait pour le lendemain ; BAS — curseur
 *   avance jusqu a la tete exacte : un noeud en retard perdait les derniers logs pour toujours).
 * AFFIRME (EXECUTION de crediterVolumeRolls extrait de serveur-web.js ; noeud simule, vrais crediter / jourDe / depensesJeu) :
 *   (1) un roll paye au bloc horodate 23:59:59 la VEILLE, scanne aujourd hui, est credite a la VEILLE ; un pass d aujourd hui, a aujourd hui ;
 *   (2) tete 1000 : le curseur s arrete a 997 (tete - 3) et un log au bloc 999 n est pas encore credite ; il l est au tour suivant ;
 *   (3) un horodatage illisible : RIEN n est credite et le curseur ne bouge pas (la fenetre est relue) ; (4) les horodatages sont gardes
 *   (un bloc deja lu n est pas relu) ; (5) depensesJeu rend le bloc du log.
 * NE PROUVE PAS : un roll reel. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { depensesJeu, TOPIC_ROLLED, TOPIC_PASS } from './volume-rolls.js';
import { crediter, jourDe } from './tirage-saison.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* la tranche commence a la marge ; a defaut (code d avant le correctif) au drapeau du scan — pour que ce test EXECUTE aussi l ancien code
 *   et rougisse sur son comportement (jour du scan, curseur a la tete), pas seulement sur un nom absent */
const i0 = srv.indexOf('const ROLLS_MARGE_BLOCS') > 0 ? srv.indexOf('const ROLLS_MARGE_BLOCS') : srv.indexOf('let rollsScanEnVol'), i1 = srv.indexOf('setInterval(() => { void crediterVolumeRolls(); }');
vu(i0 > 0 && i1 > i0, 'la tranche crediterVolumeRolls (marge, horodatages, scan) est trouvee');
const src = srv.slice(i0, i1);
const C = '0x0c5b490196f06db40ab8af68ecb2313029460fe9', J = '0x' + 'ab'.repeat(20), K = '0x' + 'cd'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), t = (a) => '0x' + a.slice(2).padStart(64, '0');
const rolled = (h, joueur, bloc) => ({ address: C, blockNumber: '0x' + bloc.toString(16), transactionHash: h, topics: [TOPIC_ROLLED, '0x' + w(1), t(joueur)], data: '0x' + [0, 1, 2, 3, 4, bloc + 2, 0, 250000, 250000].map(w).join('') });
const pass = (h, joueur, bloc) => ({ address: C, blockNumber: '0x' + bloc.toString(16), transactionHash: h, topics: [TOPIC_PASS, t(joueur), '0x' + w(20380)], data: '0x' + [30, 1792300000, 10000000, 5000000].map(w).join('') });
const aujourdhui = jourDe(Date.now()), veille = jourDe(Date.now() - 86400000);
const tsVeille = Math.floor(veille.fin / 1000) - 1, tsAuj = Math.floor(Date.now() / 1000);
const H1 = '0x' + '11'.repeat(32), H2 = '0x' + '22'.repeat(32), H3 = '0x' + '33'.repeat(32);
const LOGS = [rolled(H1, J, 500), pass(H2, K, 990), rolled(H3, K, 999)];
function monter({ tete, tsIllisible = null }) {
  const lus = [];
  const rpcServeur = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m === 'eth_getLogs') { const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16); return LOGS.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a; }); }
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16); lus.push(b); if (b === tsIllisible) return null; return { timestamp: '0x' + (b < 900 ? tsVeille : tsAuj).toString(16) }; }
    throw new Error('inattendu ' + m);
  };
  const revenu = {};
  const f = new Function('BLOCKROLLS_DEPLOIEMENT', 'rpcServeur', 'revenu', 'revenuSale', 'walletsInternes', 'COMPTE_SONDE', 'process', 'crediter', 'jourDe', 'depensesJeu', 'TOPIC_ROLLED_SRV', 'TOPIC_PASS_SRV', 'lireUintRolls', 'rpcRails', 'appelPotRolls',
    src + '\nreturn crediterVolumeRolls;');
  const crediterVolumeRolls = f({ adresse: C, bloc: 100 }, rpcServeur, revenu, false, () => new Set(), '0x' + '00'.repeat(20), { env: {} }, crediter, jourDe, depensesJeu, TOPIC_ROLLED, TOPIC_PASS, () => null, async () => null, () => '0x');
  return { crediterVolumeRolls, revenu, lus };
}
/* (1) (2) */
{ const m = monter({ tete: 1000 });
  await m.crediterVolumeRolls();
  const jv = (m.revenu.jours || {})[veille.id] || {}, ja = (m.revenu.jours || {})[aujourdhui.id] || {};
  vu(jv[J] && jv[J].usd === 0.5 && !ja[J], 'roll paye au bloc de la VEILLE (23:59:59) : credite a la veille, pas au jour du scan');
  vu(ja[K] && ja[K].usd === 10 && ja[K].hashes.length === 1, 'pass d aujourd hui : credite a aujourd hui');
  vu(m.revenu.rollsScan === 997, 'curseur arrete a tete - 3 (lu : ' + m.revenu.rollsScan + ')');
  vu(!ja[K].hashes.includes(H3), 'log au bloc 999 (au-dela de tete - 3) : pas encore credite');
  /* tour suivant, la tete a avance */
  const avant = m.lus.length;
  /* (4) le bloc 500 deja horodate n est pas relu : seul 999 l est */
  const f2 = monter({ tete: 1010 }); f2.revenu.rollsScan = 997; f2.revenu.jours = m.revenu.jours;
  await f2.crediterVolumeRolls();
  vu(((f2.revenu.jours[aujourdhui.id] || {})[K] || { hashes: [] }).hashes.includes(H3) && f2.revenu.rollsScan === 1007, 'tour suivant : le log 999 est credite, curseur 1007');
  vu(f2.lus.join() === '999' && avant === 2, 'seuls les blocs portant une depense sont horodates (lus : ' + m.lus.join() + ' puis ' + f2.lus.join() + ')');
  /* meme instance, curseur rembobine : les horodatages viennent du cache, et le credit n est pas double (dedupe par hash) */
  m.revenu.rollsScan = 99; await m.crediterVolumeRolls();
  vu(m.lus.length === 2 && m.revenu.jours[veille.id][J].usd === 0.5, 'relecture : horodatages en cache (aucune relecture), credit non double'); }
/* (3) */
{ const m = monter({ tete: 1000, tsIllisible: 990 });
  await m.crediterVolumeRolls();
  vu(m.revenu.rollsScan === undefined && !m.revenu.jours, 'horodatage illisible : rien credite, curseur immobile (la fenetre sera relue)'); }
/* (5) */
const d = depensesJeu([rolled(H1, J, 500)], C);
vu(d.length === 1 && d[0].bloc === 500, 'depensesJeu rend le bloc du log');
console.log('ok volume-rolls-jour-bloc - ' + n + ' assertions ; NE PROUVE PAS un roll reel');
