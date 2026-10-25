/* test-keeper-fix3-20261024.mjs — REVUE fix2 (2026-10-24, verdict FAIL) : le regleur (slots-regleur.js) et la porte des duels, round 3.
 * Chaque cas EXECUTE le vrai code (creerRegleur sur un FAUX noeud local, la cle de TEST publique n 1 : rien n est signe pour Base, rien
 * n est envoye ailleurs que dans la memoire de ce banc). Le temps de bloc du faux noeud est FIXE par ses horodatages (200 ms) ou INJECTE :
 * aucun verdict ne depend de la vitesse de la machine.
 * AFFIRME (chacun ROUGE sur f127b72 et sur l integration 57622ec, vert apres le correctif) :
 *   A. [defaut 1, chemin A — eviction] la victime (#7, le createur gagne, 5 USDC) rejoint, puis 201 egalites de l attaquant juste apres :
 *      le settle de la victime part dans [cible + 16, cible + 255] (le PoC de la revue poc-tie-flood.mjs, tel quel, logs seuls) ; avec la
 *      liste par l ETAT (joints + connu, le cache de /api/duels) : idem, et AUCUN duels(id) lu pour une egalite connue de l etat ;
 *   B. [defaut 1, chemin B — budget de lecture] 160 egalites a cible plus ANCIENNE, 200 ms/bloc, tours de 10 s : la victime part dans sa
 *      fenetre (PoC tel quel) ; 1 000 egalites connues de l etat : la victime part au premier tour ou elle est prete, 0 duels(id) d egalite ;
 *   B2. [defaut 1, classement] 300 egalites a cible plus RECENTE, victime vue a cible + 180 : classee (et envoyee) au premier tour ;
 *   L. [defaut 1] liste de l etat PERIMEE (joints jette) et duels vus par les logs : connu(id) classe les 201 egalites sans duels(id) ;
 *   C. [defaut 1, eviction] au-dela de suivisMax : les rejoignants gagnants sortent d abord ; un duel ou le createur gagne, dans sa fenetre,
 *      ne sort JAMAIS (les 6 partent) ;
 *   D. [defaut 1] une egalite et un final ne sont jamais re-suivis ni relus, meme si la liste par l etat (perimee) les cite a chaque tour ;
 *   E. [defaut 1, budget] les lectures de statut vont aux duels NON egaux dans l ORDRE d envoi (presses par echeance, puis createur gagnant
 *      par mise) : 40 duels a petite mise et cible plus ancienne n affament pas la grosse mise de la victime ;
 *   M. [defaut 1, statut relu des seuls candidats] un duel classe puis regle par un autre n est pas envoye ; un statut 0 (noeud en
 *      retard) avant l envoi : relu au tour suivant, pas abandonne ; un duel PRESSE passe avant une grosse mise qui a le temps ;
 *   F. [defaut 2] le temps de bloc INJECTE (msParBloc 200) remplace la mesure : marge de fin 150 blocs, tours de 10 s, meme sur un noeud
 *      qui mine a 20 ms (la mesure y donnerait 239 : le banc anvil en dependait) ;
 *   G. [defaut 3] la course perdue est relue AU BLOC DU RECU (pas 'latest') : un noeud en retard (Joined a 'latest', bloc du recu inconnu
 *      puis Settled) -> revert explique, 0 echec ; idem pour un jour de rolls arme par un autre ;
 *   H. [defaut 4] l en-tete du banc anvil dit les cles 1 a 10 (le code utilise 1 et 2..10) ;
 *   I. [porte D1] etat().contrats.duels porte la SANTE de la lecture des duels (lu, erreurLecture) ; regleurCouvre (duels-plan-app.js)
 *      l exige FRAICHE (< 3 intervalles du regleur) et sans erreur : le vrai etat() sur un faux noeud qui refuse getLogs (le PoC de la revue,
 *      50 tours), qui refuse duels(id), dont la liste par l etat est perimee -> false ; sain -> true ; sain puis 3 intervalles sans lecture
 *      -> false. Et la VRAIE tranche de serveur-web.js (lireDuelsSrv, la liste par l etat du regleur, la route /api/duels) : noeud qui refuse
 *      les lectures -> /api/duels regleDuels false ; noeud qui repond -> true.
 * Modules remplacables : REGLEUR_MODULE (une COPIE mutee de slots-regleur.js), DUELS_APP_MODULE, SERVEUR_WEB, BANC_ANVIL.
 * ⛔ PORTABLE : sources lues puis CRLF -> LF ; process.exitCode, jamais process.exit.
 * NE PROUVE PAS : Base mainnet (sequenceur, noeuds publics, 429 reels) ; le cout RPC reel sous attaque ; un noeud en retard reel (rejoue ici). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { keccak256Hex, selecteur, topic } from './keccak.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const M = await imp(process.env.REGLEUR_MODULE || 'slots-regleur.js');
const DA = await imp(process.env.DUELS_APP_MODULE || 'duels-plan-app.js');
const E = await imp('duels-etat.js');
const APPD = DA;
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const cas = async (nom, f) => { console.log('— ' + nom); try { await f(); } catch (e) { ko += 1; n += 1; console.log('KO  ' + nom + ' : exception ' + String(e && e.stack || e).slice(0, 300)); } };

const CLE = '0x' + '0'.repeat(63) + '1'; /* la cle de TEST publique n 1 */
const D = '0x' + 'd0'.repeat(20), R = '0x' + 'e0'.repeat(20);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const S_DUELS = selecteur('duels(uint256)'), S_TODAY = selecteur('today()'), S_BUYERS = selecteur('buyerCount(uint32)'), S_DAYPOTS = selecteur('dayPots(uint32)');
const T_JOINED = topic('Joined(uint256,address,uint8[5],uint256)'), T_DSETTLED = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
/* la face d un hash depuis la SPEC de BlockDuels.faceOf (ecrite ici, independante du module) ; un guess emballe / deballe (_pack / _unpack) */
const faceT = (h) => { const k = keccak256Hex(Buffer.from('0x' + String(h).toLowerCase().slice(2, 42), 'utf8')); const o = (i) => parseInt(k.slice(2 + 2 * i, 4 + 2 * i), 16); const te = (o(0) * 256 + o(1)) % 361; return [Math.floor(((te + 30) % 360) / 60), o(6) % 10, o(7) % 19, o(8) % 9, o(9) % 8]; };
const packT = (g) => (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
const unpackT = (p) => [(p >> 16) & 0x0f, (p >> 12) & 0x0f, (p >> 7) & 0x1f, (p >> 3) & 0x0f, p & 0x07];

/* ---------------------------------------------------------------- le faux noeud */
function chaine({ tete = 100000, msBloc = 200 } = {}) {
  const ch = { tete, logs: [], duels: new Map(), appels: [], envoyes: [], recus: new Map(), refusLogs: false, refusDuels: false, jours: new Map(), aujourdhui: 20000,
    ts: (b) => 1_700_000_000 + Math.floor((b * msBloc) / 1000), duelA: null, jourA: null, refusSim: new Set() };
  ch.hash = (b) => '0x' + u(BigInt(b) * 7919n + 1n);
  /* un duel REJOINT, cible t : son gagnant choisi depuis la face du hash de la cible (spec ci-dessus), sa mise, son statut ; `log` : son Joined */
  ch.duel = (id, t, { gagnant = 'createur', mise = 1_000_000n, statut = 2, log = true } = {}) => {
    const f = faceT(ch.hash(t)), autre = f.map((x, i) => (x + 1) % [6, 10, 19, 9, 8][i]);
    const [gA, gB] = gagnant === 'createur' ? [packT(f), packT(autre)] : gagnant === 'rejoignant' ? [packT(autre), packT(f)] : [packT(autre), packT(autre)];
    ch.duels.set(String(id), { t, statut, gA, gB, mise: BigInt(mise) });
    if (log) ch.logs.push({ address: D, blockNumber: hx(t - 2), topics: [T_JOINED, '0x' + u(id), '0x' + '0'.repeat(24) + 'b2'.repeat(20)], data: '0x' + unpackT(gB).map(u).join('') + u(t) });
  };
  /* ce que le cache de /api/duels sait d un duel (duels-etat.js duelDepuisEtat : guesses DEBALLES, mise BigInt) */
  ch.vuParEtat = (id) => { const d = ch.duels.get(String(id)); return d ? { id: String(id), targetBlock: d.t, guessA: unpackT(d.gA), guessB: unpackT(d.gB), stake: d.mise, final: d.statut >= 3 } : null; };
  ch.jour = (d, { n = 3, pot = 15_000_000n, etat = 0, t = 0 } = {}) => ch.jours.set(String(d), { n: BigInt(n), pot: BigInt(pot), etat, t });
  ch.rpc = async (m, p) => {
    ch.appels.push([m, p]);
    switch (m) {
      case 'eth_chainId': return hx(8453);
      case 'eth_blockNumber': return hx(ch.tete);
      case 'eth_getBlockByNumber': { const b = p[0] === 'latest' ? ch.tete : parseInt(p[0], 16); if (b > ch.tete) return null; return { number: hx(b), hash: ch.hash(b), timestamp: hx(ch.ts(b)), baseFeePerGas: hx(1_000_000) }; }
      case 'eth_getLogs': {
        if (ch.refusLogs) throw new Error('429 Too Many Requests');
        const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16);
        return ch.logs.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a && l.address === f.address && l.topics[0] === f.topics[0]; });
      }
      case 'eth_call': {
        const d = p[0].data, to = p[0].to, tag = p[1];
        if (to === D && d.startsWith(S_DUELS)) {
          if (ch.refusDuels) throw new Error('429 Too Many Requests');
          const id = String(BigInt('0x' + d.slice(10)));
          const x = ch.duelA ? ch.duelA(id, tag) : ch.duels.get(id);
          const v = x || { t: 0, statut: 0, gA: 0, gB: 0, mise: 0n };
          return '0x' + [0, 0, v.statut, v.gA, 0, v.t, v.gB, 0, v.mise].map(u).join('');
        }
        if (to === R) {
          if (d === S_TODAY) return '0x' + u(ch.aujourdhui);
          const k = String(BigInt('0x' + (d.slice(10) || '0')));
          const j = (ch.jourA ? ch.jourA(k, tag) : ch.jours.get(k)) || { n: 0n, pot: 0n, etat: 0, t: 0 };
          if (d.startsWith(S_BUYERS)) return '0x' + u(j.n);
          if (d.startsWith(S_DAYPOTS)) return '0x' + u(j.pot) + u(j.t) + u(j.etat);
        }
        throw new Error('unexpected eth_call');
      }
      case 'eth_maxPriorityFeePerGas': return hx(1000);
      case 'eth_estimateGas': if (ch.refusSim.has(String(p[0].data))) throw new Error('execution reverted: NotJoined()'); return hx(200000);
      case 'eth_getTransactionCount': return hx(5);
      case 'eth_sendRawTransaction': ch.envoyes.push(p[0]); return null;
      case 'eth_getTransactionReceipt': return ch.recus.has(p[0]) ? ch.recus.get(p[0]) : null;
      case 'eth_getTransactionByHash': return null;
      default: throw new Error('unexpected method ' + m);
    }
  };
  ch.inclureDuel = (hash, id) => { ch.duels.get(String(id)).statut = 3; ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: [{ address: D, topics: [T_DSETTLED, '0x' + u(id)], data: '0x' }] }); };
  ch.lusDuel = (id) => ch.appels.filter(([m, p]) => m === 'eth_call' && p[0].to === D && p[0].data === S_DUELS + u(id)).length;
  ch.lusDuels = (filtre) => ch.appels.filter(([m, p]) => m === 'eth_call' && p[0].to === D && p[0].data.startsWith(S_DUELS) && filtre(String(BigInt('0x' + p[0].data.slice(10))))).length;
  return ch;
}
/* la liste par l etat, comme serveur-web.js la passe au regleur : joints() = les rejoints non finaux connus ; connu(id) = ce que le cache sait */
const parEtat = (ch, ids = null) => ({
  joints: () => [...ch.duels.keys()].filter((id) => !ids || ids.has(id)).map((id) => ch.vuParEtat(id)).filter((x) => x && !x.final),
  connu: (id) => (!ids || ids.has(String(id)) ? ch.vuParEtat(id) : null),
});
const keeper = (ch, { duels = {}, ...extra } = {}) => {
  let t = 1_000_000;
  const r = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: () => t, journal: () => {}, duels: { contrat: D, bloc: 0, ...duels }, ...extra });
  return { r, avancer: (ms) => { t += ms; }, maintenant: () => t };
};
/* des tours de 10 s a 200 ms/bloc (50 blocs) jusqu a la fin de la fenetre de la victime ; rend la tete a laquelle son settle est parti */
async function jouer(ch, o, idVictime, cible, { pas = 50, max = 40, apres = null } = {}) {
  let envoye = null;
  for (let k = 0; k < max && ch.tete + 1 <= cible + 256; k++) {
    ch.tete += pas; o.avancer(10000);
    const t = await o.r.tour();
    if (t.fait && t.cible === 'duels') { if (t.ids[0] === String(idVictime) && envoye === null) envoye = ch.tete; ch.inclureDuel(t.hash, t.ids[0]); }
    if (apres) apres(k);
  }
  return envoye;
}
const dansFenetre = (x, T) => x !== null && x >= T + 16 && x + 1 <= T + 256;

/* ================================================================ A. chemin A : eviction */
await cas('A. defaut 1 chemin A (eviction) : 201 egalites rejointes apres la victime', async () => {
  /* le PoC de la revue tel quel : logs seuls (pas de liste par l etat) */
  const ch = chaine(); const o = keeper(ch);
  const T7 = ch.tete - 2; ch.duel(7, T7, { mise: 5_000_000n });
  await o.r.tour();
  for (let k = 0; k < 201; k++) ch.duel(1000 + k, ch.tete + 1, { gagnant: 'egalite' });
  let envoye = null;
  for (let k = 0; k < 60 && ch.tete + 1 <= T7 + 256; k++) { ch.tete += 5; o.avancer(10000); const t = await o.r.tour(); if (t.fait) { if (t.ids[0] === '7' && envoye === null) envoye = ch.tete; ch.inclureDuel(t.hash, t.ids[0]); } }
  vu(dansFenetre(envoye, T7) && o.r.etat().etat === 'ON', 'logs seuls (PoC tel quel) : settle de la victime #7 envoye a la tete ' + envoye + ' (fenetre [' + (T7 + 16) + ', ' + (T7 + 255) + ']), etat ' + o.r.etat().etat);
  /* la liste par l ETAT (production) : les egalites connues du cache ne coutent aucun duels(id) */
  const ch2 = chaine(); const o2 = keeper(ch2, { duels: parEtat(ch2) });
  const V = ch2.tete - 2; ch2.duel(7, V, { mise: 5_000_000n, log: false });
  await o2.r.tour();
  for (let k = 0; k < 201; k++) ch2.duel(1000 + k, ch2.tete + 1, { gagnant: 'egalite', log: false });
  let env2 = null;
  for (let k = 0; k < 60 && ch2.tete + 1 <= V + 256; k++) { ch2.tete += 5; o2.avancer(10000); const t = await o2.r.tour(); if (t.fait) { if (t.ids[0] === '7' && env2 === null) env2 = ch2.tete; ch2.inclureDuel(t.hash, t.ids[0]); } }
  const lusEgalites = ch2.lusDuels((id) => Number(id) >= 1000);
  vu(dansFenetre(env2, V), 'liste par l etat : settle de la victime #7 envoye a la tete ' + env2);
  vu(lusEgalites === 0 && o2.r.etat().compteurs.duelsEgalites === 201, 'egalites connues de l etat : ' + lusEgalites + ' duels(id) lus pour elles, ' + o2.r.etat().compteurs.duelsEgalites + ' classees egalites (attendu 0 et 201)');
});

/* ================================================================ L. connu(id) sert aussi aux duels vus par les LOGS (liste perimee) */
await cas('L. defaut 1 : liste de l etat perimee (joints jette), duels vus par les logs : connu(id) les classe sans duels(id)', async () => {
  const ch = chaine();
  /* serveur-web.js duelsJointsKeeper jette au-dela de 90 s ; duelConnuKeeper repond toujours (guesses et mise immuables une fois ecrits) */
  const o = keeper(ch, { duels: { joints: () => { throw new Error('duels state list stale'); }, connu: (id) => ch.vuParEtat(id) } });
  const T7 = ch.tete - 2; ch.duel(7, T7, { mise: 5_000_000n });
  for (let k = 0; k < 201; k++) ch.duel(6000 + k, T7 - 1, { gagnant: 'egalite' });
  const env = await jouer(ch, o, 7, T7, { pas: 5, max: 60 });
  const lusE = ch.lusDuels((id) => Number(id) >= 6000);
  vu(dansFenetre(env, T7) && lusE === 0 && o.r.etat().compteurs.duelsEgalites === 201, 'logs + connu : victime envoyee a la tete ' + env + ', ' + lusE + ' duels(id) lus pour 201 egalites (attendu 0), ' + o.r.etat().compteurs.duelsEgalites + ' classees');
});

/* ================================================================ B. chemin B : budget de lecture */
await cas('B. defaut 1 chemin B (budget) : egalites a cible plus ANCIENNE que la victime', async () => {
  const ch = chaine(); const o = keeper(ch);
  const T7 = ch.tete;
  for (let k = 0; k < 160; k++) ch.duel(2000 + k, T7 - 1, { gagnant: 'egalite' });
  ch.duel(7, T7, { mise: 5_000_000n });
  const parTour = [];
  const env = await jouer(ch, o, 7, T7, { max: 10, apres: () => parTour.push(ch.lusDuels(() => true)) });
  vu(dansFenetre(env, T7), 'logs seuls, 160 egalites (PoC tel quel) : settle de la victime envoye a la tete ' + env + ' (fin ' + (T7 + 256) + ')');
  const deltas = parTour.map((x, i) => x - (i ? parTour[i - 1] : 0));
  vu(deltas.every((x) => x <= M.BORNES_DEFAUT.classementsParTour + M.BORNES_DEFAUT.simulationsParTour), 'duels(id) par tour bornes (classement 60 + statuts des candidats 12 au plus) : ' + deltas.join(', '));
  /* 1 000 egalites connues de l etat, cibles plus anciennes : la victime part au premier tour ou elle est prete */
  const ch2 = chaine(); const o2 = keeper(ch2, { duels: parEtat(ch2) });
  const V = ch2.tete;
  for (let k = 0; k < 1000; k++) ch2.duel(3000 + k, V - 1 - (k % 40), { gagnant: 'egalite', log: false });
  ch2.duel(7, V, { mise: 5_000_000n, log: false });
  const env2 = await jouer(ch2, o2, 7, V, { max: 10 });
  const lusE = ch2.lusDuels((id) => Number(id) >= 3000);
  vu(env2 === V + 50, '1 000 egalites connues de l etat : la victime part au PREMIER tour pret (tete ' + env2 + ', attendu ' + (V + 50) + ')');
  vu(lusE === 0, 'aucun duels(id) lu pour les egalites (' + lusE + ')');
  /* les en-tetes : 250 egalites connues de l etat, a 250 cibles DISTINCTES dans la fenetre -> au plus max(64, 2 tours de blocs = 100) par tour */
  /*   (le temps de bloc INJECTE, 200 ms : aucun en-tete n est lu pour le mesurer, chaque en-tete compte est un en-tete de cible) */
  const ch3 = chaine(); const o3 = keeper(ch3, { duels: parEtat(ch3), msParBloc: 200 });
  for (let k = 0; k < 250; k++) ch3.duel(5000 + k, ch3.tete - 1 - k, { gagnant: 'egalite', log: false });
  const parT = [], classees = [];
  for (let k = 0; k < 3; k++) {
    const e0 = ch3.appels.length; await o3.r.tour();
    parT.push(ch3.appels.slice(e0).filter(([m, p]) => m === 'eth_getBlockByNumber' && p[0] !== 'latest').length);
    classees.push(o3.r.etat().compteurs.duelsEgalites);
    ch3.tete += 1; o3.avancer(10000);
  }
  vu(parT.every((x) => x <= 100) && classees.join() === '100,200,250', 'en-tetes de cible par tour bornes : ' + parT.join(', ') + ' (<= 100 chacun) ; egalites classees ' + classees.join(', ') + ' (attendu 100, 200, 250)');
});

/* ================================================================ B2. classement : l echeance la plus PROCHE d abord */
await cas('B2. defaut 1 : 300 egalites a cible plus RECENTE, victime pres de sa fin : classee la premiere', async () => {
  /* logs seuls (inconnues du cache : une lecture chacune, 60 par tour) ; la victime est vue a cible + 180, il lui reste 1 tour */
  const ch = chaine(); const o = keeper(ch);
  const T7 = ch.tete - 180; ch.duel(7, T7, { mise: 5_000_000n });
  for (let k = 0; k < 300; k++) ch.duel(7000 + k, ch.tete - 1 - (k % 10), { gagnant: 'egalite' });
  const env = await jouer(ch, o, 7, T7, { max: 3 });
  vu(env === T7 + 230, 'victime (cible ' + T7 + ', fin ' + (T7 + 256) + ') envoyee au premier tour : tete ' + env + ' (attendu ' + (T7 + 230) + ')');
});

/* ================================================================ B'. le RESTE dit (mesure, pas une assertion) : une victime INCONNUE du cache */
await cas('B\'. reste dit dans slots-regleur.js : 400 egalites inconnues du cache, victime inconnue aussi (MESURE, pas une assertion)', async () => {
  const ch = chaine(); const o = keeper(ch);
  const T7 = ch.tete;
  for (let k = 0; k < 400; k++) ch.duel(4000 + k, T7 - 1, { gagnant: 'egalite' });
  ch.duel(7, T7, { mise: 5_000_000n });
  const env = await jouer(ch, o, 7, T7, { max: 10 });
  /* imprime, jamais compte comme une assertion : le reste est dit dans l en-tete de slots-regleur.js, avec ses chiffres */
  console.log('    MESURE (non comptee) : 400 egalites (logs seuls, cible plus ancienne), classementsParTour ' + M.BORNES_DEFAUT.classementsParTour + ' : settle de la victime ' + (env === null ? 'JAMAIS envoye (le reste dit : > 60 egalites nouvelles par tour)' : 'envoye a la tete ' + env));
});

/* ================================================================ J. emballerGuess = l inverse de duels-plan.js deballer (la forme du cache) */
await cas('J. emballerGuess(deballer(x)) = x ; meme vainqueur depuis le cache (deballe) et depuis duels(id) (emballe)', async () => {
  const P = await imp('duels-plan.js');
  let justes = 0, memes = 0;
  for (let k = 0; k < 400; k++) {
    const g = [k % 6, (k * 7) % 10, (k * 5) % 19, (k * 3) % 9, (k * 11) % 8], x = packT(g);
    if (typeof M.emballerGuess === 'function' && M.emballerGuess(P.deballer(x)) === x && M.emballerGuess(x) === x) justes += 1;
    const h = '0x' + u(BigInt(k) * 104729n + 7n), g2 = [(k + 1) % 6, (k * 3) % 10, (k * 7) % 19, (k * 5) % 9, (k * 3) % 8];
    const att = P.scoresDuel(h, g, g2), v = M.vainqueurDuel(h, packT(g), packT(g2));
    if ((att.gagnant === 'A' ? 'createur' : att.gagnant === 'B' ? 'rejoignant' : 'egalite') === v) memes += 1;
  }
  vu(justes === 400, 'emballerGuess(deballer(x)) = x sur 400 guesses (' + justes + ')');
  vu(memes === 400, 'vainqueurDuel du regleur = scoresDuel de duels-plan.js (jumeau independant) sur 400 hashes (' + memes + ')');
  vu(typeof M.emballerGuess === 'function' && M.emballerGuess([6, 0, 0, 0, 0]) === packT([6, 0, 0, 0, 0]) && M.emballerGuess([16, 0, 0, 0, 0]) === null && M.emballerGuess([0, 0, 0, 0]) === null && M.emballerGuess('x') === null, 'hors bornes du paquet / mauvaise longueur / texte : null');
});

/* ================================================================ C. eviction : jamais un createur gagnant dans sa fenetre */
await cas('C. eviction au-dela de suivisMax : les rejoignants d abord, jamais un createur gagnant', async () => {
  const ch = chaine(); const o = keeper(ch, { bornes: { suivisMax: 5 } });
  for (let k = 1; k <= 6; k++) ch.duel(k, ch.tete - 20 - k, { mise: BigInt(k) * 1_000_000n });
  for (let k = 11; k <= 14; k++) ch.duel(k, ch.tete - 20, { gagnant: 'rejoignant' });
  const envoyes = [];
  for (let k = 0; k < 10; k++) { const t = await o.r.tour(); if (t.fait) { envoyes.push(t.ids[0]); ch.inclureDuel(t.hash, t.ids[0]); } ch.tete += 1; o.avancer(10000); }
  const crea = envoyes.filter((x) => Number(x) <= 6).sort();
  vu(crea.join() === '1,2,3,4,5,6', 'les 6 duels ou le createur gagne partent tous (' + envoyes.join(', ') + ')');
  vu(envoyes.slice(0, 6).join() === '6,5,4,3,2,1', 'par mise decroissante (' + envoyes.slice(0, 6).join(', ') + ')');
});

/* ================================================================ D. egalites et finals jamais relus */
await cas('D. une egalite et un final ne sont jamais relus, meme cites a chaque tour par une liste perimee', async () => {
  const ch = chaine();
  ch.duel(5, ch.tete - 30, { statut: 3 }); ch.duel(6, ch.tete - 30, { gagnant: 'egalite' });
  /* une liste par l etat PERIMEE : joints() cite #5 (deja Settled sur la chaine) et #6 a chaque tour, connu() ne sait rien */
  const perime = { joints: () => [{ id: '5', targetBlock: ch.duels.get('5').t }, { id: '6', targetBlock: ch.duels.get('6').t }], connu: () => null };
  const o = keeper(ch, { duels: perime });
  for (let k = 0; k < 5; k++) { await o.r.tour(); ch.tete += 1; o.avancer(10000); }
  vu(ch.lusDuel(5) === 1 && ch.lusDuel(6) === 1, '5 tours : #5 (final) lu ' + ch.lusDuel(5) + ' fois, #6 (egalite) lu ' + ch.lusDuel(6) + ' fois (attendu 1 et 1)');
  vu(o.r.etat().contrats.duels.suivis === 0 && ch.envoyes.length === 0, 'ni suivis, ni envoyes');
  /* un final CONNU du cache (connu(id).final) : jamais lu du tout */
  const c2 = chaine(); c2.duel(8, c2.tete - 30, { statut: 3, log: false });
  const o2 = keeper(c2, { duels: { joints: () => [{ id: '8', targetBlock: c2.duels.get('8').t }], connu: (id) => c2.vuParEtat(id) } });
  for (let k = 0; k < 3; k++) { await o2.r.tour(); c2.tete += 1; o2.avancer(10000); }
  vu(c2.lusDuel(8) === 0 && o2.r.etat().contrats.duels.suivis === 0, 'final connu du cache, cite par une liste perimee : ' + c2.lusDuel(8) + ' lecture (attendu 0)');
});

/* ================================================================ K. la borne de fenetre d un duel deja SUIVI */
await cas('K. un duel suivi dont la tete atteint cible + 256 n est plus envoye (minerait a + 257)', async () => {
  const ch = chaine(); const o = keeper(ch);
  const T = ch.tete - 20; ch.duel(7, T);
  ch.refusSim.add(M.SEL_SETTLE + u(7)); /* la simulation refuse : suivi, pas envoye */
  const t1 = await o.r.tour();
  ch.refusSim.clear(); ch.tete = T + 256; o.avancer(10000);
  const t2 = await o.r.tour();
  vu(t1.fait === false && t2.fait === false && ch.envoyes.length === 0, 'suivi a cible + 20 (simulation refusee), tete = cible + 256 : rien envoye (' + t2.pourquoi + ')');
  const c2 = chaine(); const o2 = keeper(c2); const T2 = c2.tete - 20; c2.duel(7, T2); c2.refusSim.add(M.SEL_SETTLE + u(7));
  await o2.r.tour(); c2.refusSim.clear(); c2.tete = T2 + 255; o2.avancer(10000);
  const t3 = await o2.r.tour();
  vu(t3.fait === true && t3.ids[0] === '7', 'temoin : tete = cible + 255 : envoye (minerait a + 256)');
});

/* ================================================================ E. le budget de lecture va aux non egaux, dans l ordre d envoi */
await cas('E. 40 petites mises a cible plus ancienne n affament pas la grosse mise de la victime', async () => {
  const ch = chaine(); const o = keeper(ch);
  for (let k = 0; k < 40; k++) ch.duel(500 + k, ch.tete - 40 - (k % 5), { mise: 100_000n });
  ch.duel(7, ch.tete - 20, { mise: 5_000_000n });
  /* le 1er tour classe chaque duel (une lecture chacun) et envoie le premier dans l ordre d envoi */
  const t1 = await o.r.tour(); if (t1.fait) ch.inclureDuel(t1.hash, t1.ids[0]);
  vu(t1.fait && t1.ids[0] === '7', 'le premier envoi est la victime (5 USDC) : ' + (t1.fait ? '#' + t1.ids[0] : t1.pourquoi));
  /* le 2e tour (recu lu, puis un envoi) : les statuts ne sont relus que pour les candidats, dans l ordre d envoi, au plus simulationsParTour */
  ch.tete += 1; o.avancer(10000);
  const a0 = ch.appels.length;
  const t2 = await o.r.tour();
  const lus = ch.appels.slice(a0).filter(([m, p]) => m === 'eth_call' && p[0].to === D).length;
  vu(t2.fait && lus <= M.BORNES_DEFAUT.simulationsParTour, 'tour suivant : ' + lus + ' duels(id) relus (<= ' + M.BORNES_DEFAUT.simulationsParTour + ', les candidats a envoyer), pas 30 ni 40');
});

/* ================================================================ M. le statut RELU avant l envoi (un duel deja classe) */
await cas('M. un duel classe puis regle par un autre n est pas envoye ; statut 0 (noeud en retard) : relu, pas abandonne ; presse d abord', async () => {
  /* classe a cible + 2 (createur gagne, pas encore pret : cible + 16), puis Settled par un autre avant cible + 16 */
  const ch = chaine(); const o = keeper(ch, { msParBloc: 200 });
  const T = ch.tete - 2; ch.duel(7, T);
  await o.r.tour();
  const classe = o.r.etat().contrats.duels.suivis === 1 && ch.envoyes.length === 0;
  ch.duels.get('7').statut = 3; ch.tete = T + 20; o.avancer(10000);
  const t = await o.r.tour();
  vu(classe && t.fait === false && ch.envoyes.length === 0 && o.r.etat().contrats.duels.suivis === 0, 'classe (suivi, rien envoye : ' + classe + '), regle par un autre : statut relu, rien envoye, plus suivi (' + (t.pourquoi || t.fait) + ')');
  /* meme classement ; a cible + 20, le noeud repond statut 0 UNE fois (en retard) : relu au tour suivant, puis envoye */
  const c2 = chaine(); const o2 = keeper(c2, { msParBloc: 200 });
  const T2 = c2.tete - 2; c2.duel(7, T2);
  await o2.r.tour();
  let zero = 1; c2.duelA = (id) => { const d = c2.duels.get(id); if (c2.tete >= T2 + 16 && zero-- > 0) return { ...d, statut: 0, gA: 0, gB: 0, t: 0, mise: 0n }; return d; };
  c2.tete = T2 + 20; o2.avancer(10000); const a = await o2.r.tour();
  c2.tete += 1; o2.avancer(10000); const b = await o2.r.tour();
  vu(a.fait === false && b.fait === true && b.ids[0] === '7', 'statut 0 une fois avant l envoi : rien ce tour-la (' + (a.pourquoi || a.fait) + '), envoye au suivant (' + (b.fait ? '#' + b.ids[0] : b.pourquoi) + ')');
  /* l ordre : un duel PRESSE (petite mise) part avant un createur gagnant a grosse mise qui a le temps */
  /*   (dans les DEUX ordres de decouverte : un comparateur faux peut tomber juste dans un seul) */
  const premiers = [];
  for (const ordre of [[1, 2], [2, 1]]) {
    const c3 = chaine(); const o3 = keeper(c3, { msParBloc: 200 });
    for (const id of ordre) if (id === 1) c3.duel(1, c3.tete - 20, { mise: 5_000_000n }); else c3.duel(2, c3.tete - 200, { mise: 100_000n });
    const t3 = await o3.r.tour();
    premiers.push(t3.fait ? t3.ids[0] : t3.pourquoi);
  }
  vu(premiers.join() === '2,2', 'presse (cible - 200, fin dans 56 blocs, 0,10 USDC) avant la grosse mise qui a le temps, decouverts dans les deux ordres : ' + premiers.join(', ') + ' (attendu 2, 2)');
});

/* ================================================================ F. defaut 2 : temps de bloc injecte */
await cas('F. defaut 2 : le temps de bloc INJECTE remplace la mesure (noeud a 20 ms/bloc)', async () => {
  const ch = chaine({ msBloc: 20 });
  const mes = keeper(ch); await mes.r.tour();
  const em = mes.r.etat();
  const ch2 = chaine({ msBloc: 20 });
  const inj = keeper(ch2, { msParBloc: 200 }); await inj.r.tour();
  const ei = inj.r.etat();
  vu(em.msParBlocMesure === 20 && em.bornes.margeFinDuelBlocs === 239, 'temoin : mesure sur ce noeud = ' + em.msParBlocMesure + ' ms, marge ' + em.bornes.margeFinDuelBlocs + ' (la saturation que le banc anvil subissait)');
  vu(ei.msParBlocMesure === 200 && ei.intervalleMs === 10000 && ei.bornes.margeFinDuelBlocs === 150 && ei.tempsDeBloc === 'injecte', 'injecte 200 ms : marge ' + ei.bornes.margeFinDuelBlocs + ', intervalle ' + ei.intervalleMs + ' ms, tempsDeBloc ' + ei.tempsDeBloc + ' (attendu 150, 10000, injecte)');
  const mesures = ch2.appels.filter(([m, p]) => m === 'eth_getBlockByNumber' && p[0] !== 'latest').length;
  vu(mesures === 0, 'injecte : aucun en-tete lu pour mesurer (' + mesures + ')');
  const B = lire(process.env.BANC_ANVIL || 'banc-slots-regleur-anvil-20261023.mjs');
  vu(/duels: \{ contrat: duels, bloc: blocDuels \}, rolls: \{ contrat: rolls \}, msParBloc: 200 \}\)/.test(B) && /marge === 150/.test(B), 'banc anvil : le regleur des duels recoit msParBloc: 200 et le banc exige la marge 150');
});

/* ================================================================ G. defaut 3 : la course relue au bloc du recu */
await cas('G. defaut 3 : course relue AU BLOC DU RECU (noeud en retard a latest)', async () => {
  const ch = chaine(); const o = keeper(ch);
  ch.duel(7, ch.tete - 20);
  const t = await o.r.tour();
  const Rb = ch.tete + 1;
  ch.recus.set(t.hash, { status: '0x0', blockNumber: hx(Rb), logs: [] });
  /* le duel a ete regle par un autre AU bloc Rb ; le noeud qui repond aux eth_call est en retard : 'latest' = Joined ; Rb inconnu une fois */
  let inconnu = 1; const tags = [];
  ch.duelA = (id, tag) => { const d = ch.duels.get(id); tags.push(tag); if (tag === 'latest') return d; if (parseInt(tag, 16) >= Rb) { if (inconnu-- > 0) throw new Error('header not found'); return { ...d, statut: 3 }; } return d; };
  ch.tete += 1; o.avancer(10000); await o.r.tour();
  ch.tete += 1; o.avancer(10000); await o.r.tour();
  const e = o.r.etat();
  vu(e.compteurs.reverts === 0 && e.echecsSuite === 0 && e.compteurs.revertsExpliques === 1 && e.etat === 'ON', 'duel : revert EXPLIQUE (' + e.compteurs.revertsExpliques + '), ' + e.compteurs.reverts + ' compte, ' + e.echecsSuite + ' echec (attendu 1, 0, 0)');
  vu(tags.includes(hx(Rb)) && !tags.includes('latest'), 'la relecture porte le bloc du recu ' + hx(Rb) + ' (tags lus : ' + [...new Set(tags)].join(', ') + ')');
  /* rolls : closeDay perdu, un autre a arme AU bloc du recu ; 'latest' (en retard) dit encore Open */
  const c2 = chaine(); c2.jour(19999, { etat: 0 });
  const r2 = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: c2.rpc, maintenant: () => 1_000_000, journal: () => {}, rolls: { contrat: R } });
  const t2 = await r2.tour();
  const b2 = c2.tete + 1; c2.recus.set(t2.hash, { status: '0x0', blockNumber: hx(b2), logs: [] });
  const tagsR = [];
  c2.jourA = (k, tag) => { const j = c2.jours.get(k); tagsR.push(tag); if (tag && tag !== 'latest' && parseInt(tag, 16) >= b2) return { ...j, etat: 1, t: b2 + 2 }; return j; };
  c2.tete += 1; await r2.tour();
  vu(t2.quoi === 'closeDay' && r2.etat().compteurs.revertsExpliques === 1 && r2.etat().echecsSuite === 0 && tagsR.includes(hx(b2)), 'rolls : closeDay perdu relu au bloc du recu : explique, 0 echec (tags ' + [...new Set(tagsR)].join(', ') + ')');
});

/* ================================================================ H. defaut 4 : l en-tete du banc anvil */
await cas('H. defaut 4 : l en-tete du banc anvil dit les cles 1 a 10', async () => {
  const B = lire(process.env.BANC_ANVIL || 'banc-slots-regleur-anvil-20261023.mjs');
  const tete = B.slice(0, B.indexOf('*/'));
  vu(/les entiers 1 a 10/.test(tete) && !/1 a 11/.test(tete) && /\[2, 3, 4, 5, 6, 7, 8, 9, 10\]\.map/.test(B) && /const CLE = cleTest\(1\);/.test(B), 'en-tete : « les entiers 1 a 10 » ; le code : cleTest(1) et [2..10]');
});

/* ================================================================ I. porte des duels : la sante de la lecture */
const DC = '0x6b7647b326a635c0902eaed41ab0b41746b9602c';
const TABLE = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000'];
/* un faux noeud minimal (la forme du PoC de la revue poc-duels-read-fail.mjs) : refus de getLogs / de duels(id) au choix */
const noeudPorte = (o = {}) => async (m, p) => {
  if (m === 'eth_chainId') return '0x2105';
  /* round 4 : o.tete (defaut 100000) — un cas qui fait passer le temps fait AVANCER la tete (figee, ce serait une tete GELEE : DEGRADE) */
  if (m === 'eth_blockNumber') return hx(o.tete || 100000);
  if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? (o.tete || 100000) : parseInt(p[0], 16); return { number: hx(b), hash: '0x' + u(BigInt(b) * 7919n + 1n), timestamp: hx(1_700_000_000 + Math.floor(b / 5)), baseFeePerGas: '0xf4240' }; }
  if (m === 'eth_getLogs') { if (o.refusLogs) throw new Error('429 Too Many Requests'); return []; }
  if (m === 'eth_call') { if (o.refusAppels) throw new Error('429 Too Many Requests'); return '0x' + [0, 0, 2, 0, 0, 99990, 1, 0, 1_000_000].map(u).join(''); }
  if (m === 'eth_estimateGas') return '0x30d40';
  if (m === 'eth_maxPriorityFeePerGas') return '0x3e8';
  if (m === 'eth_getTransactionCount') return '0x5';
  if (m === 'eth_sendRawTransaction') return null;
  if (m === 'eth_getTransactionReceipt') return null;
  throw new Error('nope ' + m);
};
const regPorte = (rpc, duels = {}, t = { v: 1_000_000 }) => M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, table: TABLE, rpc, maintenant: () => t.v, journal: () => {}, duels: { contrat: () => DC, bloc: () => 99000, ...duels } });
/* round 4 (decision du lead) : la PORTE (regleurCouvre) est FERMEE sur BlockDuels v1 ; les gardes de SANTE jugees ici sont celles de
 *   regleurLitLesDuels (gardees pour un v2) — « couvre » dans ce cas = « lit les duels » */
const couvre = (e, a) => { try { return DA.regleurLitLesDuels(e, DC, a); } catch (x) { return 'EXC ' + x.message; } };
await cas('I. porte D1 : regleurLitLesDuels exige une lecture des duels FRAICHE et sans erreur (vrai etat()) ; regleurCouvre fermee (round 4)', async () => {
  const t = { v: 1_000_000 };
  const sain = regPorte(noeudPorte(), {}, t);
  await sain.tour();
  const es = sain.etat();
  vu(es.contrats.duels.lu === new Date(t.v).toISOString() && es.contrats.duels.erreurLecture === null && couvre(es, t.v) === true, 'noeud sain, un tour : contrats.duels.lu = ' + es.contrats.duels.lu + ', erreurLecture ' + es.contrats.duels.erreurLecture + ', lit ' + couvre(es, t.v));
  vu(DA.regleurCouvre(es, DC, t.v) === false, 'round 4 : ce regleur sain ne couvre PAS BlockDuels v1 (regleurCouvre false)');
  vu(couvre(regPorte(noeudPorte(), {}, { v: t.v }).etat(), t.v) === false, 'aucun tour encore (jamais lu) : ne couvre pas');
  /* duels-plan-app.js n a pas d horloge (test-duels-plan-app) : l heure est passee ; absente -> ne couvre pas (fail-closed) */
  const esMaintenant = { ...es, contrats: { ...es.contrats, duels: { ...es.contrats.duels, lu: new Date().toISOString() } } };
  vu(DA.regleurLitLesDuels(esMaintenant, DC, Date.now()) === true && DA.regleurLitLesDuels(esMaintenant, DC) === false && DA.regleurCouvre(esMaintenant, DC, Date.now()) === false, 'lu a l instant : lit avec l heure passee ; sans heure passee : non ; la porte reste fermee');
  /* le PoC de la revue : getLogs refuse, 50 tours */
  const poc = regPorte(noeudPorte({ refusLogs: true }), {}, t);
  for (let k = 0; k < 50; k++) await poc.tour();
  const ep = poc.etat();
  vu(ep.etat === 'ON' && /429/.test(String(ep.contrats.duels.erreurLecture)) && couvre(ep, t.v) === false, 'PoC de la revue (getLogs refuse, 50 tours) : etat ' + ep.etat + ', erreurLecture « ' + ep.contrats.duels.erreurLecture + ' », couvre ' + couvre(ep, t.v) + ' (attendu false)');
  /* logs refuses, liste par l etat fournie, mais chaque duels(id) refuse */
  const ap = regPorte(noeudPorte({ refusLogs: true, refusAppels: true }), { joints: () => [{ id: '9', targetBlock: 99990 }] }, t);
  await ap.tour();
  vu(couvre(ap.etat(), t.v) === false && ap.etat().contrats.duels.erreurLecture, 'duels(id) tous refuses (liste par l etat fournie) : ne couvre pas (« ' + ap.etat().contrats.duels.erreurLecture + ' »)');
  /* liste par l etat perimee (le serveur la refuse : elle jette) et logs refuses */
  const per = regPorte(noeudPorte({ refusLogs: true }), { joints: () => { throw new Error('duels state list stale'); } }, t);
  await per.tour();
  vu(couvre(per.etat(), t.v) === false, 'logs refuses et liste par l etat perimee : ne couvre pas');
  const fr = regPorte(noeudPorte({ refusLogs: true }), { joints: () => [] }, t);
  await fr.tour();
  vu(couvre(fr.etat(), t.v) === true, 'logs refuses, liste par l etat fraiche (vide) : couvre (la liste par l etat suffit)');
  /* sain, puis une lecture ratee : ferme TOUT DE SUITE ; puis revient */
  const bas = { refusLogs: false }; const vas = regPorte(async (m, p) => noeudPorte(bas)(m, p), {}, t);
  await vas.tour(); const c1 = couvre(vas.etat(), t.v);
  bas.refusLogs = true; t.v += 10000; bas.tete = 100050; await vas.tour(); const c2 = couvre(vas.etat(), t.v);
  bas.refusLogs = false; t.v += 10000; bas.tete = 100100; await vas.tour(); const c3 = couvre(vas.etat(), t.v);
  vu(c1 === true && c2 === false && c3 === true, 'sain -> lecture ratee -> sain : ' + c1 + ', ' + c2 + ', ' + c3 + ' (attendu true, false, true)');
  /* fraicheur : 3 intervalles (30 s a 200 ms/bloc) sans lecture -> ferme */
  const iv = vas.etat().intervalleMs;
  vu(iv === 10000 && couvre(vas.etat(), t.v + 2 * iv) === true && couvre(vas.etat(), t.v + 3 * iv) === false, 'lu il y a 2 intervalles : couvre ; 3 intervalles (' + 3 * iv + ' ms) : ne couvre plus');
});

/* ================================================================ I2. la vraie tranche de serveur-web.js : /api/duels regleDuels */
await cas('I2. serveur-web.js (tranche executee) : lecture des duels ratee -> /api/duels regleDuels false', async () => {
  const SRV = lire(process.env.SERVEUR_WEB || 'serveur-web.js');
  const tr = (a, b) => { const i = SRV.indexOf(a), j = SRV.indexOf(b, i + 1); if (!(i > 0 && j > i)) throw new Error('tranche introuvable : ' + a); return SRV.slice(i, j); };
  const srcLecteur = tr('/* ══ LES DUELS LUS SUR LA CHAINE (2026-10-18', "setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }");
  const srcRoute = tr("if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
  const C = '0x' + '6b'.repeat(20), USDC = '0x' + '83'.repeat(20), TETE = 60_000_000;
  const nd = { refus: false };
  const rpcServeur = async (m, p) => {
    if (nd.refus && (m === 'eth_call' || m === 'eth_getLogs')) throw new Error('429 Too Many Requests');
    if (m === 'eth_chainId') return hx(8453);
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') throw new Error('429 Too Many Requests'); /* comme mainnet.base.org : getLogs toujours refuse */
    if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? TETE : parseInt(p[0], 16); return { number: hx(b), hash: '0x' + u(BigInt(b) * 7919n + 1n), timestamp: hx(1_700_000_000 + Math.floor(b / 5)), baseFeePerGas: hx(1_000_000) }; }
    if (m === 'eth_call') { if (p[0].data === selecteur('nextId()')) return '0x' + u(1); throw new Error('unexpected eth_call'); }
    if (m === 'eth_maxPriorityFeePerGas') return hx(1000);
    throw new Error('unexpected ' + m);
  };
  const corps = srcLecteur + '\nasync function route(req, res, chemin) {\n' + srcRoute + '\n}\nreturn { lireDuelsSrv, duelsSrv, route, joints: typeof duelsJointsKeeper === "function" ? duelsJointsKeeper : null, connu: typeof duelConnuKeeper === "function" ? duelConnuKeeper : null };';
  const noms = ['DUELS_DEPLOIEMENT', 'rpcServeur', 'MISE_MIN_DUEL', 'EXP_MIN_DUEL', 'EXP_MAX_DUEL', 'FINIS_DUEL', 'etatDuelSrv', 'regleurCouvre', 'regleurSlots', 'createurParBlock', 'duelEnJson', 'partageDuel',
    'appelNextIdEtat', 'appelDuelEtat', 'lireNextIdDuels', 'duelDepuisEtat', 'reglerDepuisHash', 'idsDuelsATour',
    /* integration 2026-10-25 : la route sert la v2 si sa fiche a une adresse (duelsV2()) ; ici v1, comme la prod tant que v2 n est pas signee */
    'duelsV2'];
  const fiche = { adresse: C, bloc: 52_778_966, chaine: 8453, constructeur: { usdc: USDC, devWallet: '0x' + 'dd'.repeat(20), rewardPool: '0x' + 'ee'.repeat(20) } };
  let regleur = null;
  const proxy = { etat: () => regleur.etat() };
  const x = new Function(...noms, corps)(fiche, rpcServeur, APPD.MISE_MIN, APPD.EXPIRATION_MIN_S, APPD.EXPIRATION_MAX_S, APPD.FINIS, APPD.etatDuel, DA.regleurCouvre, proxy, new Map(), APPD.duelEnJson, APPD.partage,
    E.appelNextIdEtat, E.appelDuelEtat, E.lireNextId, E.duelDepuisEtat, E.reglerDepuisHash, E.idsDuelsATour, () => null);
  vu(typeof x.joints === 'function' && typeof x.connu === 'function', 'la tranche du lecteur definit duelsJointsKeeper et duelConnuKeeper (la liste par l etat du regleur)');
  /* le regleur du serveur, cable comme serveur-web.js le cable (joints / connu de la tranche), horloge reelle (la route appelle regleurCouvre a Date.now()) */
  regleur = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: rpcServeur, journal: () => {}, duels: { contrat: () => C, bloc: () => 0, joints: () => x.joints(C), connu: (id) => x.connu(C, id) } });
  const get = async () => { const res = { corps: null, writeHead() {}, end(s) { this.corps = s; } }; await x.route({ method: 'GET' }, res, '/api/duels'); return JSON.parse(res.corps); };
  /* noeud qui REFUSE les lectures : lireDuelsSrv echoue, la liste par l etat jette (jamais lue), getLogs refuse -> la lecture des duels du regleur echoue */
  nd.refus = true; x.duelsSrv.lu = 0; await x.lireDuelsSrv(); await regleur.tour();
  const j1 = await get();
  vu(j1.regleur && j1.regleur.etat === 'ON' && j1.regleur.regleDuels === false, 'noeud qui refuse : regleur ON mais /api/duels regleDuels ' + (j1.regleur && j1.regleur.regleDuels) + ' (attendu false)');
  /* le noeud repond (getLogs toujours refuse, nextId 1) : la liste par l etat est fraiche -> le regleur LIT ; round 4 : regleDuels reste false
   *   (un regleur ne ferme pas l option ; la fermeture vient du contrat, pas de la sante : regleurLitLesDuels dit true) */
  nd.refus = false; x.duelsSrv.lu = 0; await x.lireDuelsSrv(); await regleur.tour();
  const j2 = await get();
  const lit2 = DA.regleurLitLesDuels(regleur.etat(), C, Date.now());
  vu(j2.ok === true && j2.regleur.regleDuels === false && lit2 === true, 'noeud qui repond (getLogs refuse, liste par l etat fraiche) : le regleur lit (' + lit2 + ') mais regleDuels ' + j2.regleur.regleDuels + ' (attendu false, round 4)');
  const fn = typeof x.joints === 'function' && typeof x.connu === 'function';
  /* liste FRAICHE : ce contrat est servi, un autre contrat jette (la fraicheur ne masque pas ce controle-ci) */
  let ceContrat = false; try { ceContrat = Array.isArray(x.joints(C)); } catch (_) { ceContrat = false; }
  let autre = false; try { x.joints('0x' + '11'.repeat(20)); } catch (_) { autre = true; }
  vu(fn && ceContrat && autre && x.connu('0x' + '11'.repeat(20), 1) === null, 'liste fraiche : ce contrat servi (' + ceContrat + ') ; autre contrat : joints jette (' + autre + '), connu null');
  /* la liste par l etat vieillit (dernier succes il y a plus de 90 s) : joints jette */
  x.duelsSrv.luOk = Date.now() - 91_000;
  let jette = false; try { x.joints(C); } catch (_) { jette = true; }
  vu(fn && jette, 'liste par l etat plus vieille que 90 s : duelsJointsKeeper jette (le regleur ne s y fie plus)');
});

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS Base mainnet, le cout RPC reel, un vrai noeud en retard');
process.exitCode = ko ? 1 : 0;
