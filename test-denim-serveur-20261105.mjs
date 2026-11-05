// test-denim-serveur-20261105.mjs — LA MARGE DES SCANS ET /api/activite SUIVENT LE TEMPS DE BLOC SERVI, PAS LA SEULE MESURE LONGUE.
// AVANT : margeBlocsRolls et /api/activite lisaient tempsDeBlocSrv.sParBloc (1 000 blocs, relue toutes les 10 min) : juste apres la bascule
//   Denim, elle dit encore 2 s pendant ~10 min — marge de 3 blocs = 0,6 s au lieu de 6 s. sParBlocServi() = sParBlocPrudent(longue, courte).
// AFFIRME (EXECUTION des tranches reelles de serveur-web.js : mesure longue, temps servi, route /api/temps-de-bloc) : 2 s -> 3 blocs ;
//   longue 2 s + courte 0,2 s (juste apres la bascule) -> >= 30 blocs ; 0,2 s -> 30 ; non mesure -> 3 (inchange) ; la route sert le meme
//   objet que /api/tirage.tempsDeBloc (null si non mesure). MUTANTS (marge sur la longue seule ; route qui servirait la longue) TUES.
// Lu dans le source seulement (non execute) : /api/activite sert sParBlocServi().
// NE PROUVE PAS : la vraie bascule de mainnet ; le cout RPC.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as TB from './temps-de-bloc.js';
import { creerMesureCourte } from './temps-de-bloc-court.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };

/* la chaine : 2 s/bloc jusqu au bloc BS, puis 0,2 s ; `etat.tete` bouge ; `etat.panne` rend tout illisible */
const BS = 1_000_000, T0 = 1_790_000_000;
const tsDe = (b) => T0 + Math.floor((b <= BS ? b * 2 : BS * 2 + (b - BS) * 0.2) + 1e-9);
function chaine() {
  const etat = { tete: BS, panne: false };
  const rpcServeur = async (m, p) => {
    if (etat.panne) throw new Error('down');
    if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? etat.tete : parseInt(p[0], 16); return { number: '0x' + b.toString(16), timestamp: '0x' + tsDe(b).toString(16) }; }
    throw new Error('inattendu ' + m);
  };
  return { etat, rpcServeur };
}
function monter(src) {
  const srcMesure = tranche(src, 'const ROLLS_MARGE_S', 'const horodatagesBlocsRolls');
  const srcServi = tranche(src, '/* ══ LE TEMPS DE BLOC SERVI', '/* fin du temps de bloc servi */');
  const srcRoute = tranche(src, "if (chemin === '/api/temps-de-bloc') {", "if (chemin === '/api/tirage') {");
  assert.ok(srcMesure && srcServi && srcRoute, 'tranches trouvees');
  const ch = chaine();
  let SV = null;
  const M = new Function('rpcServeur', 'process', 'blocsPour', 'sParBlocMesure', 'enteteVersMesure', 'RECUL_MESURE_BLOCS', 'sParBlocServi',
    srcMesure + '\nreturn { margeBlocsRolls, sParBlocSrv, tempsDeBlocJson, tempsDeBlocSrv };')(ch.rpcServeur, { env: { TB_SONDES: '0' } }, TB.blocsPour, TB.sParBlocMesure, TB.enteteVersMesure, TB.RECUL_MESURE_BLOCS, () => SV.sParBlocServi());
  SV = new Function('rpcServeur', 'creerMesureCourte', 'sParBlocPrudent', 'tempsDeBlocSrv', 'tempsDeBlocJson',
    srcServi + '\nreturn { mesureCourteSrv, sParBlocServi, tempsDeBlocServiJson };')(ch.rpcServeur, (o) => creerMesureCourte({ ...o, ttlMs: 0 }), TB.sParBlocPrudent, M.tempsDeBlocSrv, M.tempsDeBlocJson);
  const route = new Function('sParBlocSrv', 'tempsDeBlocServiJson', 'return function (req, res, chemin) {\n' + srcRoute + '\nreturn "suite";\n};')(M.sParBlocSrv, SV.tempsDeBlocServiJson);
  const get = (chemin) => { const res = { code: null, corps: null, writeHead(c) { this.code = c; }, end(s) { this.corps = s; } }; const r = route({ method: 'GET' }, res, chemin); return { r, code: res.code, json: res.corps ? JSON.parse(res.corps) : null }; };
  return { ch, M, SV, get };
}

/** le banc : rend les assertions ratees */
async function banc(src) {
  const rates = [];
  const ok = (c, m) => { if (!c) rates.push(m); };
  const { ch, M, SV, get } = monter(src);
  /* non mesure */
  ok(M.margeBlocsRolls() === 3, 'non mesure : 3 blocs (lu ' + M.margeBlocsRolls() + ')');
  const g0 = get('/api/temps-de-bloc');
  ok(g0.code === 200 && g0.json && g0.json.ok === true && g0.json.tempsDeBloc && g0.json.tempsDeBloc.sParBloc === null, 'route, non mesure : sParBloc null');
  /* 2 s : longue et courte a 2 s */
  await M.sParBlocSrv(); await SV.mesureCourteSrv.lire(true);
  ok(M.tempsDeBlocSrv.sParBloc === 2, 'longue 2 s');
  ok(M.margeBlocsRolls() === 3, '2 s : 3 blocs = 6 s (lu ' + M.margeBlocsRolls() + ')');
  /* juste apres la bascule : 500 blocs a 0,2 s ; la longue (cache 10 min) dit encore 2 s, la courte ~0,19 s */
  ch.etat.tete = BS + 500;
  await M.sParBlocSrv(); await SV.mesureCourteSrv.lire(true);
  ok(M.tempsDeBlocSrv.sParBloc === 2, 'temoin : la longue dit encore 2 s juste apres la bascule');
  const mb = M.margeBlocsRolls();
  ok(mb >= 30, 'juste apres la bascule : marge >= 30 blocs (6 s a 0,2 s), pas 3 (lu ' + mb + ')');
  const g1 = get('/api/temps-de-bloc');
  ok(g1.json && g1.json.tempsDeBloc.sParBloc < 0.21 && g1.json.tempsDeBloc.sParBlocLong === 2, 'route juste apres la bascule : sParBloc prudent (' + (g1.json && g1.json.tempsDeBloc.sParBloc) + '), sParBlocLong 2');
  ok(JSON.stringify(Object.keys(g1.json.tempsDeBloc).sort()) === JSON.stringify(Object.keys(SV.tempsDeBlocServiJson()).sort()), 'route : le meme objet que tempsDeBlocServiJson (/api/tirage.tempsDeBloc)');
  ok(get('/api/autre').r === 'suite', 'une autre route n est pas prise');
  return rates;
}

const r0 = await banc(SRV);
vu(r0.length === 0, 'banc vert sur le serveur : ' + r0.join(' | '));
/* le cas 0,2 s en regime (longue a 0,2 s) */
{
  const { ch, M, SV } = monter(SRV);
  ch.etat.tete = BS + 5000;
  await M.sParBlocSrv(); await SV.mesureCourteSrv.lire(true);
  vu(M.tempsDeBlocSrv.sParBloc === 0.2 && M.margeBlocsRolls() === 30, 'regime 0,2 s : longue 0,2, marge 30 blocs (lu ' + M.margeBlocsRolls() + ')');
}
/* le source : /api/activite sert le temps servi (lu, non execute) */
vu(/fenetreBlocs: balaye, sParBloc: sParBlocServi\(\)/.test(SRV), '/api/activite : sParBloc: sParBlocServi() (source)');

const mutants = [
  ['marge sur la mesure longue seule', 'blocsPour(ROLLS_MARGE_S, sParBlocServi())', 'blocsPour(ROLLS_MARGE_S, tempsDeBlocSrv.sParBloc)'],
  ['route qui servirait la mesure longue', "res.end(JSON.stringify({ ok: true, tempsDeBloc: tempsDeBlocServiJson() }));", "res.end(JSON.stringify({ ok: true, tempsDeBloc: { ...tempsDeBlocServiJson(), sParBloc: tempsDeBlocServiJson().sParBlocLong } }));"],
];
let tues = 0;
for (const [nom, de, vers] of mutants) {
  assert.ok(SRV.includes(de), 'ancre trouvee : ' + nom);
  const r = await banc(SRV.replace(de, vers));
  vu(r.length > 0, 'mutant TUE — ' + nom + ' (' + r[0] + ')');
  tues += 1;
}
console.log('ok denim-serveur — ' + n + ' assertions, ' + tues + '/' + mutants.length + ' mutants tues ; NE PROUVE PAS la vraie bascule de mainnet');
