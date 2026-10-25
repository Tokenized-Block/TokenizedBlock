/* test-temps-de-bloc-bascule-20261024.mjs — LA FENETRE DITE AVANT UN JOIN SUIT UN PASSAGE DE 2 s A 200 ms (revue BlockDuelsV2 2026-10-24, n°2).
 * EXECUTE (pas lu) : les tranches REELLES de serveur-web.js — la mesure longue (sParBlocSrv, relue toutes les 10 min), le temps de bloc SERVI
 *   (mesure courte + sParBlocPrudent) et la route /api/duels v2 — sur une fausse chaine qui passe de 2 s a 0,2 s par bloc a l instant S, avec
 *   une horloge simulee (une requete /api/duels par seconde). Horodatages en SECONDES entieres seulement (le pire cas : pas de timestampMs).
 * AFFIRME : (1) avant S : la ligne dit ~512 s (jamais moins de 500) ; (2) apres S : la ligne « Settle within about N s » ne dit PLUS que la
 *   vraie fenetre (51,2 s, +1 s d arrondi) au plus BORNE_S secondes apres S, puis ne la depasse plus jamais ; (3) en regime 200 ms : 46..52 s
 *   (jamais 512) ; (4) les fonctions pures (borne basse, prudente) et le lecteur court (TTL, echec garde la valeur, pas de rafale) ;
 *   (5) /api/tirage sert le meme temps de bloc prudent.
 * SERVEUR_WEB=<copie> rejoue le banc sur une autre version (dd0fcd4 : rouge, 601 s de fenetre surestimee). Mutants : TEMPS_DE_BLOC, TEMPS_COURT,
 *   SERVEUR_WEB.
 * ⛔ PORTABLE : process.exitCode. NE PROUVE PAS : la vraie bascule Denim sur Base (pas encore arrivee), le rafraichissement de la carte cote
 *   client (relue au plus toutes les 10 s par lireDuelsServis ; le plan du join relit /api/duels au clic). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const TB = await imp(process.env.TEMPS_DE_BLOC || 'temps-de-bloc.js');
const S2 = await imp('duels-v2-serveur.js');
const SRV = lire(process.env.SERVEUR_WEB || 'serveur-web.js');
let Court = null; try { Court = await imp(process.env.TEMPS_COURT || 'temps-de-bloc-court.js'); } catch (_) { Court = null; }
const BORNE_S = 40;

/* ── la fausse chaine : 2 s/bloc jusqu a S, puis 0,2 s/bloc ── */
const S = 3000, B0 = 60_000_000;
const blocA = (t) => (t < S ? B0 + Math.floor(t / 2) : B0 + S / 2 + Math.floor((t - S) / 0.2 + 1e-9));
const tsDe = (b) => { const k = b - B0; return k <= S / 2 ? k * 2 : S + (k - S / 2) * 0.2; };
let clock = 0;
const appels = [];
const rpcServeur = async (m, p) => {
  appels.push(m);
  if (m === 'eth_getBlockByNumber') {
    const tete = blocA(clock / 1000);
    const b = p[0] === 'latest' ? tete : parseInt(p[0], 16);
    if (b > tete) return null;
    return { number: '0x' + b.toString(16), timestamp: '0x' + (1_800_000_000 + Math.floor(tsDe(b) + 1e-9)).toString(16) };
  }
  throw new Error('unexpected ' + m);
};
class DateF extends Date { static now() { return clock; } }

/* ── les tranches reelles ── */
const srcMesure = tranche(SRV, 'const ROLLS_MARGE_S', 'const horodatagesBlocsRolls');
const srcServi = tranche(SRV, '/* ══ LE TEMPS DE BLOC SERVI', '/* fin du temps de bloc servi */');
const srcRoute = tranche(SRV, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
ok(srcMesure.length > 500 && srcRoute.length > 500, 'tranches trouvees : la mesure longue, la route /api/duels');
const M = new Function('rpcServeur', 'process', 'blocsPour', 'sParBlocMesure', 'enteteVersMesure', 'RECUL_MESURE_BLOCS', 'Date',
  srcMesure + '\nreturn { sParBlocSrv, tempsDeBlocJson, tempsDeBlocSrv };')(rpcServeur, { env: { TB_SONDES: '0' } }, TB.blocsPour, TB.sParBlocMesure, TB.enteteVersMesure, TB.RECUL_MESURE_BLOCS, DateF);
/* le temps de bloc servi : la tranche reelle si elle existe ; sinon (version d avant) le serveur disait la mesure longue */
const creerMC = Court ? (o) => Court.creerMesureCourte({ ...o, horloge: () => clock }) : null;
const SV = srcServi && creerMC
  ? new Function('rpcServeur', 'creerMesureCourte', 'sParBlocPrudent', 'tempsDeBlocSrv', 'tempsDeBlocJson', 'Date',
    srcServi + '\nreturn { mesureCourteSrv, sParBlocServi, tempsDeBlocServiJson };')(rpcServeur, creerMC, TB.sParBlocPrudent, M.tempsDeBlocSrv, M.tempsDeBlocJson, DateF)
  : { mesureCourteSrv: { lire: async () => null, etat: () => ({ sParBloc: null }) }, sParBlocServi: () => M.tempsDeBlocSrv.sParBloc, tempsDeBlocServiJson: null };
const C = '0x' + 'c2'.repeat(20);
const lecteur = { lire: async () => {}, etat: () => ({ contrat: C, cache: new Map(), nextId: 1, restants: 0, tete: blocA(clock / 1000), lu: clock, luTete: clock, enVol: false, erreur: null }) }; /* luTete : l heure de la tete servie (revue 2026-10-25) */
const FICHE = { contrat: 'BlockDuelsV2', chaine: 8453, adresse: C, bloc: 1, constructeur: {} };
const route = new Function('duelsV2', 'sParBlocSrv', 'createurParBlock', 'reponseDuelsV2', 'DUELS_V2_DEPLOIEMENT', 'tempsDeBlocSrv', 'mesureCourteSrv', 'sParBlocServi', 'Date',
  'return async function route(req, res, chemin) {\n' + srcRoute + '\n};')(() => lecteur, M.sParBlocSrv, new Map(), S2.reponseDuelsV2, FICHE, M.tempsDeBlocSrv, SV.mesureCourteSrv, SV.sParBlocServi, DateF);
const pause = () => new Promise((r) => setImmediate(r));
const get = async () => { const res = { corps: null, writeHead() {}, end(s) { this.corps = s; } }; await route({ method: 'GET' }, res, '/api/duels'); for (let i = 0; i < 6; i++) await pause(); return JSON.parse(res.corps); };

/* ── la simulation : une requete par seconde, de 0 a S + 1200 s ── */
const VRAIE_APRES = 256 * 0.2;
let dernierTrop = null, minAvant = Infinity, maxAvant = 0, regime = [], ligneFausse = null;
for (let t = 0; t <= S + 1200; t += 1) {
  clock = t * 1000;
  const j = await get();
  const f = j.fenetreS;
  if (t >= 900 && t < S) { minAvant = Math.min(minAvant, f ?? -1); maxAvant = Math.max(maxAvant, f ?? -1); }
  if (t >= S) {
    if (f === null || f > VRAIE_APRES + 1) { dernierTrop = t; if (!ligneFausse) ligneFausse = j.avantJoin; }
    if (t >= S + 600) regime.push(f);
  }
}
const duree = dernierTrop === null ? 0 : dernierTrop - S + 1;
console.log('   bascule a t=' + S + ' s : la ligne surestime la fenetre pendant ' + duree + ' s apres la bascule' + (ligneFausse ? ' (ex. « ' + ligneFausse.slice(0, 46) + '… »)' : ''));
ok(minAvant >= 500 && maxAvant <= 513, 'avant la bascule (2 s/bloc) : la ligne dit ' + minAvant + '..' + maxAvant + ' s (512 s, jamais moins de 500)');
ok(duree <= BORNE_S, 'apres la bascule a 0,2 s/bloc : la ligne ne surestime plus la fenetre (51,2 s) au plus ' + BORNE_S + ' s apres (mesure : ' + duree + ' s)');
ok(regime.length > 500 && Math.min(...regime) >= 46 && Math.max(...regime) <= 52, 'regime 0,2 s/bloc (10 a 20 min apres) : ' + Math.min(...regime) + '..' + Math.max(...regime) + ' s (vraie 51,2 s)');

/* ── les fonctions pures ── */
console.log('— temps-de-bloc.js : borne basse, prudente');
ok(typeof TB.sParBlocBorneBasse === 'function' && typeof TB.sParBlocPrudent === 'function', 'sParBlocBorneBasse et sParBlocPrudent exportees');
if (typeof TB.sParBlocPrudent === 'function') {
  const h = (bloc, ts, tsMs) => ({ bloc, ts, tsMs: tsMs ?? null });
  ok(TB.sParBlocBorneBasse({ haut: h(200, 220), bas: h(100, 200) }) === 0.19 && TB.sParBlocBorneBasse({ haut: h(200, 400), bas: h(100, 200) }) === 1.99, 'borne basse en secondes : (ecart - 1) / n (0,19 a 200 ms, 1,99 a 2 s)');
  ok(TB.sParBlocBorneBasse({ haut: h(200, 220, 220_000), bas: h(100, 200, 200_000) }) === 0.2 && TB.sParBlocBorneBasse({ haut: h(200, 205), bas: h(100, 200) }) === null, 'avec timestampMs : exacte ; ecart < 10 s en secondes : non mesurable (null)');
  ok(TB.sParBlocPrudent(2, 0.2) === 0.2 && TB.sParBlocPrudent(0.2, 0.19) === 0.2 && TB.sParBlocPrudent(0.2, 2) === 0.2 && TB.sParBlocPrudent(null, 0.19) === 0.19 && TB.sParBlocPrudent(2, null) === 2 && TB.sParBlocPrudent(null, null) === null,
    'prudente : la courte seulement si les blocs accelerent de plus de 10 % ; l arrondi (0,19 vs 0,2) garde la longue ; une seule -> elle ; aucune -> null');
  ok(TB.sParBlocPrudent(2, NaN) === 2 && TB.sParBlocPrudent(1000, 0.2) === 0.2 && TB.sParBlocPrudent(0.001, 2) === 2, 'une mesure aberrante (NaN, 1000 s, 1 ms) est ignoree');
}
console.log('— temps-de-bloc-court.js : le lecteur court');
ok(!!Court && typeof Court.creerMesureCourte === 'function', 'creerMesureCourte exportee');
if (Court) {
  let h = 1000, rates = false, lus = 0;
  const rpc = async (m, p) => { lus += 1; if (rates) throw new Error('down'); const tete = 1000; const b = p[0] === 'latest' ? tete : parseInt(p[0], 16); return { number: '0x' + b.toString(16), timestamp: '0x' + (b * 2).toString(16) }; };
  const L = Court.creerMesureCourte({ rpc, horloge: () => h, ttlMs: 15000 });
  ok((await L.lire()) === 1.99 && lus === 2, 'premiere lecture : 2 en-tetes, 1,99 s (borne basse a 2 s)');
  h = 11000; await L.lire(); ok(lus === 2, 'dans le TTL (10 s < 15 s) : rien n est relu');
  h = 17000; rates = true; ok((await L.lire()) === 1.99 && /down/.test(L.etat().erreur) && L.etat().mesureLe === 1000, 'lecture ratee : la derniere valeur reste, l erreur est dite, la date de mesure ne bouge pas');
  const avant = lus; h = 18000; await L.lire(); ok(lus === avant, 'apres un echec : pas de rafale de relectures (TTL compte depuis l essai)');
  const L2 = Court.creerMesureCourte({ rpc: async () => { throw new Error('down'); }, horloge: () => 0 });
  ok((await L2.lire()) === null, 'jamais lue : null (jamais 2 s par defaut)');
}
console.log('— /api/tirage');
ok(/tempsDeBloc: tempsDeBlocServiJson\(\)/.test(tranche(SRV, 'function corpsTirage()', '/* ══ LE NIVEAU D UN WALLET')) && !!SV.tempsDeBlocServiJson, '/api/tirage sert le temps de bloc prudent (tempsDeBlocServiJson)');
if (SV.tempsDeBlocServiJson) {
  const tj = SV.tempsDeBlocServiJson();
  ok(tj.sParBloc === SV.sParBlocServi() && tj.sParBlocLong === M.tempsDeBlocSrv.sParBloc && tj.court && 'sParBloc' in tj.court, 'tempsDeBloc servi : sParBloc = prudent, sParBlocLong = la longue, court = la courte (' + tj.sParBloc + ', ' + tj.sParBlocLong + ', ' + tj.court.sParBloc + ')');
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS la vraie bascule Denim sur Base');
if (ko) process.exitCode = 1;
