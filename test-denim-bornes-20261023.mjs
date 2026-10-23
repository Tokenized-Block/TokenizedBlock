// test-denim-bornes-20261023.mjs — LES BORNES CONVERTIES AU TEMPS DE BLOC MESURE (Denim : 2 s -> 200 ms/bloc).
// EXECUTE des tranches de serveur-web.js (mesure sParBlocSrv, marge des scans, recul des duels) sur un noeud simule a 2 s et a 200 ms,
// et verifie dans le source que les reculs exprimes en temps ne sont plus des blocs a 2 s (journal, lancements, frais, app).
// ⛔ NE PROUVE PAS : le comportement reel de mainnet apres Denim (non active), ni le cout RPC des reculs 10x plus longs en blocs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blocsPour, sParBlocMesure, enteteVersMesure, RECUL_MESURE_BLOCS, secondesPour, intervalleSondageMs } from './temps-de-bloc.js';

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

/* 2. le recul des duels (tranche executee : lireDuelsSrv avec ses vraies bornes) */
const srcDuels = tranche(SRV, 'const DUELS_RECUL_S', "setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }");
async function lireDuels({ pas, tete = 70000000, mesure = true }) {
  const nd = noeud({ tete, pas });
  const C = '0x' + 'ab'.repeat(20);
  const f = new Function('DUELS_DEPLOIEMENT', 'rpcServeur', 'blocsPour', 'sParBlocSrv', 'TAILLE_LOGS_DUELS', 'filtreLogsDuels',
    srcDuels + '\nreturn { lireDuelsSrv, duelsSrv, duelsReculBlocs };');
  const x = f({ adresse: C, bloc: 1 }, nd.rpcServeur, blocsPour, async () => (mesure ? pas : null), 2000, ({ contrat, de, a }) => ({ address: contrat, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }));
  await x.lireDuelsSrv();
  const premier = nd.appels.find(([m]) => m === 'eth_getLogs');
  return { ...x, premierDe: premier ? parseInt(premier[1][0].fromBlock, 16) : null, tete };
}
{
  const r = await lireDuels({ pas: 2 });
  vu(r.duelsReculBlocs(2) === Math.ceil((7 * 86400) / 2) + 2 * 256 + 600, '2 s : le recul vaut EXACTEMENT l ancienne constante (303 512)');
  vu(r.premierDe === r.tete - 303512, '2 s : la premiere fenetre part de tete - 303 512 (lu : tete - ' + (r.tete - r.premierDe) + ')');
}
{
  const r = await lireDuels({ pas: 0.2 });
  vu(r.premierDe === r.tete - (3024000 + 512 + 600), 'Denim : 7 jours = tete - 3 025 112 blocs (lu : tete - ' + (r.tete - r.premierDe) + ')');
  vu(secondesPour(r.tete - r.premierDe, 0.2) >= 7 * 86400, 'Denim : le recul couvre au moins 7 jours au temps mesure');
}
{
  const r = await lireDuels({ pas: 0.2, mesure: false });
  vu(r.premierDe === null && r.duelsSrv.de === null && /block time not measured/.test(r.duelsSrv.erreur || ''), 'non mesure : aucune fenetre lue, erreur dite, le recul n est pas fige');
}

/* 3. le source : plus de « blocs a 2 s » pour une duree */
const SRV_CODE = SRV.replace(/\/\*[\s\S]*?\*\//g, ''); /* les commentaires citent l ancien calcul : les absences se cherchent dans le code */
vu(!/heures \* 1800/.test(SRV_CODE), 'lancements / frais : plus de heures * 1800');
vu((SRV.match(/blocsPour\((?:Number\()?heures\)? \* 3600, await sParBlocSrv\(\)\)/g) || []).length === 2, 'lancements ET frais : heures * 3600 s au temps mesure');
/* integration 2026-10-23 : le journal ne PREDIT plus le premier bloc du jour au temps de bloc, il le TROUVE par horodatages (premierBlocJournal) */
vu(!/sParBloc = tsT > tsA \? \(tsT - tsA\) \/ 1000 : 2/.test(SRV) && /const premier = await premierBlocJournal\(tete, j\);/.test(SRV), 'journal : plus de repli a 2 s — premier bloc du jour trouve par horodatages');
vu(!/ROLLS_MARGE_BLOCS/.test(SRV_CODE) && (SRV.match(/const sur = tete - margeBlocsRolls\(\);/g) || []).length === 3, 'les 3 scans (volume, journal, XP) : marge au temps mesure');
vu(/tempsDeBloc: tempsDeBlocJson\(\)/.test(tranche(SRV, 'function corpsTirage()', "/* ══ LE NIVEAU D UN WALLET")), '/api/tirage sert tempsDeBloc');
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
