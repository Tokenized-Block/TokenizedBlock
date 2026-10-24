// test-denim-bornes-20261023.mjs — LES BORNES CONVERTIES AU TEMPS DE BLOC MESURE (Denim : 2 s -> 200 ms/bloc).
// EXECUTE des tranches de serveur-web.js (mesure sParBlocSrv, marge des scans, lecture des duels — par l ETAT depuis 2026-10-24, sans
// recul en blocs) sur un noeud simule a 2 s et a 200 ms,
// et verifie dans le source que les reculs exprimes en temps ne sont plus des blocs a 2 s (journal, lancements, frais, app).
// ⛔ NE PROUVE PAS : le comportement reel de mainnet apres Denim (non active), ni le cout RPC des reculs 10x plus longs en blocs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blocsPour, sParBlocMesure, enteteVersMesure, RECUL_MESURE_BLOCS, secondesPour, intervalleSondageMs } from './temps-de-bloc.js';
import { selecteur } from './keccak.js';
import * as E from './duels-etat.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); assert.ok(i > 0 && j > i, 'tranche introuvable : ' + a); return t.slice(i, j); };

/* un noeud simule : ts = T0 + b * pas (secondes entieres), timestampMs optionnel */
function noeud({ tete, pas, ms = false, basIllisible = false }) {
  const T0 = 1700000000, appels = [];
  const rpcServeur = async (m, p) => {
    appels.push([m, p]);
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m === 'eth_getBlockByNumber') {
      const b = p[0] === 'latest' ? tete : parseInt(p[0], 16);
      if (basIllisible && b !== tete) return null;
      const t = T0 + b * pas;
      return { number: '0x' + b.toString(16), timestamp: '0x' + Math.floor(t + 1e-9).toString(16), ...(ms ? { timestampMs: '0x' + Math.round(t * 1000).toString(16) } : {}) };
    }
    if (m === 'eth_getLogs') return [];
    throw new Error('inattendu ' + m);
  };
  return { rpcServeur, appels };
}

/* 1. la mesure du serveur et la marge des scans (tranche executee) */
const srcMesure = tranche(SRV, 'const ROLLS_MARGE_S', 'const horodatagesBlocsRolls');
const monterMesure = (rpcServeur) => new Function('rpcServeur', 'process', 'blocsPour', 'sParBlocMesure', 'enteteVersMesure', 'RECUL_MESURE_BLOCS',
  srcMesure + '\nreturn { margeBlocsRolls, sParBlocSrv, tempsDeBlocJson, tempsDeBlocSrv };')(rpcServeur, { env: { TB_SONDES: '0' } }, blocsPour, sParBlocMesure, enteteVersMesure, RECUL_MESURE_BLOCS);
{
  const m = monterMesure(noeud({ tete: 53000000, pas: 2 }).rpcServeur);
  vu(m.margeBlocsRolls() === 3, 'non mesure : marge 3 blocs (inchangee)');
  vu(await m.sParBlocSrv() === 2, '2 s/bloc mesure');
  vu(m.margeBlocsRolls() === 3, '2 s/bloc : marge 3 blocs (= 6 s, comme avant)');
  const j = m.tempsDeBlocJson();
  vu(j.sParBloc === 2 && j.source === 'timestamp' && j.mesureEntre[1] - j.mesureEntre[0] === RECUL_MESURE_BLOCS && j.erreur === null, 'json : 2 s, secondes, entre deux blocs a ' + RECUL_MESURE_BLOCS + ' d ecart');
}
{
  const m = monterMesure(noeud({ tete: 60000000, pas: 0.2 }).rpcServeur);
  vu(await m.sParBlocSrv() === 0.2, 'Denim : 0,2 s/bloc mesure sur les secondes entieres');
  vu(m.margeBlocsRolls() === 30, 'Denim : marge 30 blocs (= 6 s), pas 3 (= 0,6 s)');
}
{
  const m = monterMesure(noeud({ tete: 60000000, pas: 0.2, ms: true }).rpcServeur);
  vu(await m.sParBlocSrv() === 0.2 && m.tempsDeBlocJson().source === 'timestampMs', 'Denim avec timestampMs : 0,2 s, source ms');
}
{
  const nd = noeud({ tete: 60000000, pas: 0.2, basIllisible: true });
  const m = monterMesure(nd.rpcServeur);
  vu(await m.sParBlocSrv() === null, 'en-tete du bas illisible : null (jamais 2 par defaut)');
  vu(m.tempsDeBlocJson().sParBloc === null && /not measurable|unreadable/.test(m.tempsDeBlocJson().erreur || ''), 'json : null et l erreur dite');
  vu(m.margeBlocsRolls() === 3, 'non mesure : marge 3 blocs');
}

/* 2. les duels (tranche executee : lireDuelsSrv tel qu il est servi).
 *   2026-10-24 — POURQUOI CETTE SECTION A CHANGE : elle verifiait le RECUL des logs (7 jours en blocs au temps mesure : 303 512 a 2 s,
 *   3 025 112 a 200 ms). Mesure prod game33 2026-10-24 : ce recul est une fenetre d ARCHIVE ; un noeud qui refuse eth_getLogs la-bas
 *   (mainnet.base.org 429) laissait /api/duels NON_LU pour toujours. lireDuelsSrv lit maintenant l ETAT (nextId + duels(id) par eth_call,
 *   duels-etat.js) : il n a PLUS de recul en blocs du tout. L intention Denim reste : AUCUNE hypothese de 2 s/bloc — ici, plus fort, la
 *   lecture ne depend plus du temps de bloc : meme resultat a 2 s et a 200 ms, sParBlocSrv jamais appele, aucun eth_getLogs, et un temps
 *   de bloc NON mesure ne bloque plus la lecture (avant : « block time not measured », aucune fenetre lue).
 *   Le detail (budget par tour, finals jamais relus, refus des logs) : test-duels-etat-20261024.mjs. */
const srcDuels = tranche(SRV, '/* ══ LES DUELS LUS SUR LA CHAINE (2026-10-18', "setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }");
async function lireDuels({ pas, tete = 70000000, mesure = true }) {
  const nd = noeud({ tete, pas });
  const C = '0x' + 'ab'.repeat(20), A = 'a1'.repeat(20), USDC = '83'.repeat(20);
  const w = (x) => BigInt(x).toString(16).padStart(64, '0');
  const S_NEXT = selecteur('nextId()'), S_DUELS = selecteur('duels(uint256)');
  let sondesTemps = 0;
  /* 3 duels OUVERTS (nextId 4) ; le reste du noeud simule (tete, en-tetes, getLogs) inchange */
  const rpc = async (m, p) => {
    if (m === 'eth_call' && p[0].data === S_NEXT) { nd.appels.push([m, p]); return '0x' + w(4); }
    if (m === 'eth_call' && p[0].data.startsWith(S_DUELS)) { nd.appels.push([m, p]); return '0x' + [A, 1900000000, 1, (1 << 16) | (2 << 12) | (3 << 7) | (4 << 3) | 5, 0, 0, 0, USDC, 200000].map((x) => (typeof x === 'string' ? x.padStart(64, '0') : w(x))).join(''); }
    return nd.rpcServeur(m, p);
  };
  const f = new Function('DUELS_DEPLOIEMENT', 'rpcServeur', 'blocsPour', 'sParBlocSrv', 'TAILLE_LOGS_DUELS', 'filtreLogsDuels',
    'appelNextIdEtat', 'appelDuelEtat', 'lireNextIdDuels', 'duelDepuisEtat', 'reglerDepuisHash', 'idsDuelsATour',
    srcDuels + '\nreturn { lireDuelsSrv, duelsSrv };');
  const x = f({ adresse: C, bloc: 1 }, rpc, blocsPour, async () => { sondesTemps += 1; return mesure ? pas : null; }, 2000, ({ contrat, de, a }) => ({ address: contrat, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }),
    E.appelNextIdEtat, E.appelDuelEtat, E.lireNextId, E.duelDepuisEtat, E.reglerDepuisHash, E.idsDuelsATour);
  await x.lireDuelsSrv();
  return { ...x, ids: [...x.duelsSrv.cache.keys()].join(), getLogs: nd.appels.filter(([m]) => m === 'eth_getLogs').length, sondesTemps, tete };
}
{
  const a2 = await lireDuels({ pas: 2 }), a02 = await lireDuels({ pas: 0.2 }), nm = await lireDuels({ pas: 0.2, mesure: false });
  vu(a2.ids === '3,2,1' && a2.duelsSrv.erreur === null && a2.duelsSrv.tete === a2.tete, '2 s : les 3 duels lus par l etat, du plus recent au plus ancien (lu : ' + a2.ids + ')');
  vu(a02.ids === a2.ids && a02.duelsSrv.erreur === null, 'Denim 200 ms : le MEME resultat qu a 2 s (lu : ' + a02.ids + ')');
  vu(a2.getLogs === 0 && a02.getLogs === 0 && nm.getLogs === 0, 'aucun eth_getLogs, a 2 s comme a 200 ms (aucune fenetre en blocs a convertir)');
  vu(a2.sondesTemps === 0 && a02.sondesTemps === 0, 'le temps de bloc n est jamais demande (aucun 2 s suppose, aucun recul)');
  vu(nm.ids === '3,2,1' && !/block time not measured/.test(nm.duelsSrv.erreur || ''), 'temps de bloc NON mesure : la lecture se fait quand meme (avant : rien de lu)');
  vu(!/duelsReculBlocs|DUELS_RECUL_S/.test(SRV.replace(/\/\*[\s\S]*?\*\//g, '')), 'plus de recul des duels en blocs dans le code du serveur');
}

/* 3. le source : plus de « blocs a 2 s » pour une duree */
const SRV_CODE = SRV.replace(/\/\*[\s\S]*?\*\//g, ''); /* les commentaires citent l ancien calcul : les absences se cherchent dans le code */
vu(!/heures \* 1800/.test(SRV_CODE), 'lancements / frais : plus de heures * 1800');
vu((SRV.match(/blocsPour\((?:Number\()?heures\)? \* 3600, await sParBlocSrv\(\)\)/g) || []).length === 2, 'lancements ET frais : heures * 3600 s au temps mesure');
/* integration 2026-10-23 : le journal ne PREDIT plus le premier bloc du jour au temps de bloc, il le TROUVE par horodatages (premierBlocJournal) */
vu(!/sParBloc = tsT > tsA \? \(tsT - tsA\) \/ 1000 : 2/.test(SRV) && /const premier = await premierBlocJournal\(tete, j\);/.test(SRV), 'journal : plus de repli a 2 s — premier bloc du jour trouve par horodatages');
vu(!/ROLLS_MARGE_BLOCS/.test(SRV_CODE) && (SRV.match(/const sur = tete - margeBlocsRolls\(\);/g) || []).length === 3, 'les 3 scans (volume, journal, XP) : marge au temps mesure');
/* 2026-10-24 (revue v2 n°2) : /api/tirage sert le temps de bloc PRUDENT (longue + courte, tempsDeBlocServiJson = tempsDeBlocJson + sParBloc
 *   prudent) ; execute par test-temps-de-bloc-bascule-20261024.mjs */
vu(/tempsDeBloc: tempsDeBlocServiJson\(\)/.test(tranche(SRV, 'function corpsTirage()', "/* ══ LE NIVEAU D UN WALLET")) && /return \{ \.\.\.tempsDeBlocJson\(\), sParBloc: sParBlocServi\(\),/.test(SRV), '/api/tirage sert tempsDeBloc (prudent)');
vu(/fenetreBlocs: balaye, sParBloc: tempsDeBlocSrv\.sParBloc/.test(SRV), '/api/activite sert sParBloc');
vu(/premierBlocApres\(rpcServeur, [^\n]*\{ sParBloc: tempsDeBlocSrv\.sParBloc \?\? undefined \}\)/.test(SRV), 'bloc E : le temps mesure passe a la recherche');

/* 4. l app : durees au temps mesure, rythme du Game derive de la fenetre */
vu(!/\* 2 \/ 60/.test(APP), 'app : plus de blocs * 2 / 60 (activite)');
vu(/const intervalleJeuMs = \(\) => intervalleSondageMs\(secondesPour\(FENETRE_ROLLS, sParBlocApp\)\);/.test(APP), 'app : intervalle du Game = f(fenetre de 256 blocs au temps mesure)');
vu(!/void peindreTirageJourPass\(\); \} \}, 20000\);/.test(APP) && /function relireJeu\(\) \{\n[^\n]*\n[^\n]*\n  setTimeout\(relireJeu, intervalleJeuMs\(\)\);\n\}\nsetTimeout\(relireJeu, intervalleJeuMs\(\)\);/.test(APP), 'app : plus de relecture fixe a 20 s (le tour se replanifie au rythme calcule)');
vu(/setTimeout\(bjRelire, bj\.pending && bj\.pending\.length \? Math\.min\(30000, intervalleJeuMs\(\)\) : 30000\);/.test(APP), 'app : le brain suit le rythme du Game quand un roll attend');
vu(!/setTimeout\(o, 2000\)\); try \{ (?:tete|t2) = parseInt/.test(APP), 'app : plus d attente de bloc fixe a 2 s');
vu(/sParBlocApp = Number\.isFinite\(s\) && s > 0 \? s : null;/.test(APP), 'app : le temps de bloc vient de /api/tirage, null sinon');
vu(intervalleSondageMs(secondesPour(256, 0.2)) <= 51200 / 8, 'Denim : au moins 8 relectures du Game dans une fenetre de reglement');

console.log('test-denim-bornes : ' + n + ' assertions, OK ; NE PROUVE PAS mainnet apres Denim ni le cout RPC');
