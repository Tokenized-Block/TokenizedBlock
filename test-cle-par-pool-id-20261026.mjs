/* test-cle-par-pool-id-20261026.mjs — LA CLE D UN BLOCK PAR LE poolId QUE LE FIL DE MARCHE VOIT DEJA (cle-par-pool-id.js + serveur).
 *
 * POURQUOI (prod 20261025-game46) : /api/trending 194 lignes, 153 sans cle connue, 0 achetable ; ADOF REFUSE depuis ETH et USDC,
 *   « no initialized pool among the 15 keys read ». La cle se cherchait par profondeur depuis la tete (10 fenetres de 999 blocs pour un
 *   plan) ; l Initialize d ADOF est au bloc 53 056 117, ~28 000 blocs sous la tete du 2026-10-25 : hors de portee.
 * CE BANC (faux noeud, aucun reseau) :
 *   A. le vrai log Initialize d ADOF (mesures/cle-par-pool-id-adof-20261026.json, copie d une reponse eth_getLogs) est retrouve par son
 *      poolId et la date DexScreener, en 4 appels, a 28 000 blocs de la tete ;
 *   B. TROIS ETATS : une fenetre refusee -> NON_LUE ; une reponse qui n est pas une liste -> NON_LUE ; un bloc illisible -> NON_LUE ;
 *      une fenetre lue et vide -> ABSENTE_PRES_DE_LA_DATE (jamais « pas de pool ») ;
 *   C. preuves : un log d un autre contrat est ignore ; un log dont le poolId ne se recalcule pas est ignore ; une cle sans le jeton
 *      demande -> HORS_JETON ; un poolId mal forme -> NON_LUE ;
 *   D. indices : seules les paires v4 (pairAddress 66 caracteres) avec une date entrent, la plus liquide d abord, au plus 3 par jeton ;
 *   E. serveur (texte source, insensible aux fins de ligne) : les rails, /api/cle et le tour de trending consultent les indices AVANT
 *      la recherche par profondeur, et la recherche d avant reste derriere.
 * Usage : node test-cle-par-pool-id-20261026.mjs   (SERVEUR_SOURCE=<fichier> pour juger un autre serveur-web.js) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
/* CLE_PAR_POOL_ID_MODULE=<copie> : juger un mutant (copie a cote, pour que ses imports relatifs resolvent) */
const M = await import(pathToFileURL(process.env.CLE_PAR_POOL_ID_MODULE || path.join(ICI, 'cle-par-pool-id.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };

const F = JSON.parse(readFileSync(path.join(ICI, 'mesures', 'cle-par-pool-id-adof-20261026.json'), 'utf8'));
const LOG = F.log, ID = F.dexscreener.pairAddress.toLowerCase(), JETON = F.dexscreener.jeton.toLowerCase();
const BLOC = parseInt(LOG.blockNumber, 16), TS = parseInt(LOG.blockTimestamp, 16);
const TETE = BLOC + 28289; /* l ecart du 2026-10-25 (tete 53 084 406) */
/* un faux Base : 2 s par bloc, calees sur le bloc et l horodatage du vrai log */
const tsDe = (b) => TS + (b - BLOC) * 2;
function fauxNoeud({ logs = 'vrai', bloc = 'ok', autres = [] } = {}) {
  const appels = [];
  const rpc = async (methode, params) => {
    appels.push(methode);
    if (methode === 'eth_getBlockByNumber') {
      if (bloc === 'refus') throw new Error('over rate limit');
      if (bloc === 'null') return null;
      const b = parseInt(params[0], 16);
      return { number: params[0], timestamp: '0x' + tsDe(b).toString(16) };
    }
    if (methode === 'eth_getLogs') {
      const q = params[0];
      if (logs === 'refus') throw new Error('archive node daily budget reached — deep window not sent, it waits for 00:00 UTC');
      if (logs === 'nonListe') return null;
      const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
      const tous = [...autres, ...(logs === 'vrai' ? [LOG] : [])];
      return tous.filter((l) => parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a
        && String(l.address).toLowerCase() === String(q.address).toLowerCase()
        && q.topics.every((t, i) => t === null || String(l.topics[i]).toLowerCase() === String(t).toLowerCase()));
    }
    throw new Error('unexpected ' + methode);
  };
  return { rpc, appels };
}

/* ── A ── */
{
  const f = fauxNoeud();
  const r = await M.clePoolParId({ rpc: f.rpc, poolId: ID, jeton: JETON, creeLeMs: F.dexscreener.pairCreatedAt, tete: TETE });
  ok(r.etat === 'LUE', 'A1 ADOF : cle LUE par son poolId a ' + (TETE - BLOC) + ' blocs de la tete (' + r.etat + ')');
  ok(r.cle && r.cle.currency1 === JETON && r.cle.currency0 === '0x0000000000000000000000000000000000000000', 'A2 la cle est ETH / ADOF');
  ok(r.cle && r.cle.fee === 100 && r.cle.tickSpacing === 1 && r.cle.hooks === '0x' + LOG.data.slice(2 + 152, 2 + 192), 'A3 fee, tickSpacing et hooks sont ceux du log');
  ok(r.bloc === BLOC && r.cle.poolId === ID, 'A4 bloc ' + r.bloc + ' et poolId portes par la cle');
  ok(f.appels.length <= 5 && f.appels.filter((x) => x === 'eth_getLogs').length === 1, 'A5 cout : ' + f.appels.length + ' appels, UN seul getLogs (' + f.appels.join(',') + ')');
  /* l ancienne portee d un plan : 10 fenetres de 999 blocs depuis la tete — le bloc de l Initialize n y est pas */
  ok(TETE - 10 * 999 + 1 > BLOC, 'A6 temoin : la recherche courte d avant (10 x 999 blocs) s arrete au bloc ' + (TETE - 10 * 999 + 1) + ' > ' + BLOC);
  /* une date decalee de 20 min reste dans la fenetre */
  const g = fauxNoeud();
  const r2 = await M.clePoolParId({ rpc: g.rpc, poolId: ID, jeton: JETON, creeLeMs: (TS + 1200) * 1000, tete: TETE });
  ok(r2.etat === 'LUE', 'A7 une date 20 min apres l Initialize trouve encore la cle (' + r2.etat + ')');
  const d = await M.blocDeDate({ rpc: fauxNoeud().rpc, tsS: TS, tete: TETE });
  ok(d.etat === 'LU' && d.bloc === BLOC, 'A8 blocDeDate rend le bloc exact de la date (' + d.bloc + ')');
}
/* ── B ── */
{
  const a = await M.clePoolParId({ rpc: fauxNoeud({ logs: 'refus' }).rpc, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(a.etat === 'NON_LUE' && /not read/.test(String(a.pourquoi || '')), 'B1 fenetre refusee -> NON_LUE (' + a.etat + ' : ' + String(a.pourquoi || '').slice(0, 60) + ')');
  const b = await M.clePoolParId({ rpc: fauxNoeud({ logs: 'nonListe' }).rpc, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(b.etat === 'NON_LUE' && /not a list/.test(b.pourquoi), 'B2 reponse qui n est pas une liste -> NON_LUE (' + b.etat + ')');
  const c = await M.clePoolParId({ rpc: fauxNoeud({ bloc: 'refus' }).rpc, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(c.etat === 'NON_LUE' && /creation block not read/.test(c.pourquoi), 'B3 bloc refuse -> NON_LUE (' + c.etat + ')');
  const c2 = await M.clePoolParId({ rpc: fauxNoeud({ bloc: 'null' }).rpc, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(c2.etat === 'NON_LUE', 'B4 bloc null -> NON_LUE (' + c2.etat + ')');
  const d = await M.clePoolParId({ rpc: fauxNoeud({ logs: 'vide' }).rpc, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(d.etat === 'ABSENTE_PRES_DE_LA_DATE' && d.depuis <= BLOC && d.jusqua >= BLOC, 'B5 fenetre lue et vide -> ABSENTE_PRES_DE_LA_DATE ' + d.depuis + '..' + d.jusqua);
  /* la date tres loin de l Initialize : lue, vide, ABSENTE — pas NON_LUE, pas une cle */
  const e = await M.clePoolParId({ rpc: fauxNoeud().rpc, poolId: ID, jeton: JETON, creeLeMs: (TS + 86400) * 1000, tete: TETE + 43200 });
  ok(e.etat === 'ABSENTE_PRES_DE_LA_DATE', 'B6 date a 24 h de l Initialize -> ABSENTE_PRES_DE_LA_DATE (' + e.etat + ')');
  const f = await M.clePoolParId({ rpc: fauxNoeud().rpc, poolId: ID, jeton: JETON, creeLeMs: null, tete: TETE });
  ok(f.etat === 'NON_LUE', 'B7 sans date -> NON_LUE (rien n est cherche ni affirme)');
}
/* ── C ── */
{
  const ailleurs = { ...LOG, address: '0x1111111111111111111111111111111111111111' };
  const a = await M.clePoolParId({ rpc: fauxNoeud({ logs: 'vide', autres: [ailleurs] }).rpc, rpcLogs: async (m, p) => [ailleurs], poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(a.etat === 'ABSENTE_PRES_DE_LA_DATE', 'C1 un log d un autre contrat est ignore (' + a.etat + ')');
  const truque = { ...LOG, data: LOG.data.slice(0, 2 + 63) + '5' + LOG.data.slice(2 + 64) }; /* fee 0x65 : le poolId ne se recalcule plus */
  const b = await M.clePoolParId({ rpc: fauxNoeud().rpc, rpcLogs: async () => [truque], poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(b.etat === 'ABSENTE_PRES_DE_LA_DATE', 'C2 un log dont le poolId ne se recalcule pas ne donne pas de cle (' + b.etat + ')');
  const c = await M.clePoolParId({ rpc: fauxNoeud().rpc, poolId: ID, jeton: '0xb2000000000000000000000000000000000000ff', creeLeMs: TS * 1000, tete: TETE });
  ok(c.etat === 'HORS_JETON', 'C3 la cle trouvee ne contient pas le jeton demande -> HORS_JETON (' + c.etat + ')');
  const d = await M.clePoolParId({ rpc: fauxNoeud().rpc, poolId: '0x1234', jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(d.etat === 'NON_LUE', 'C4 poolId mal forme -> NON_LUE');
  /* le lecteur des logs du serveur est celui qui recoit le getLogs (et peut refuser une fenetre profonde) */
  let vu = 0;
  const e = await M.clePoolParId({ rpc: fauxNoeud({ logs: 'refus' }).rpc, rpcLogs: async (m, p) => { vu += 1; return [LOG]; }, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(e.etat === 'LUE' && vu === 1, 'C5 rpcLogs recoit le getLogs (' + vu + ' appel)');
}
/* ── D ── */
{
  const base = { chainId: 'base', baseToken: { address: JETON }, quoteToken: { address: '0x0000000000000000000000000000000000000000' } };
  const paires = [
    { ...base, pairAddress: '0x' + 'a'.repeat(64), pairCreatedAt: 1, liquidity: { usd: 5 } },
    { ...base, pairAddress: ID, pairCreatedAt: F.dexscreener.pairCreatedAt, liquidity: { usd: 9000 } },
    { ...base, pairAddress: '0x41e21950362b1014bc629252ecfff8fca5f1646c', pairCreatedAt: 2, liquidity: { usd: 1e6 } }, /* Aerodrome : une adresse */
    { ...base, pairAddress: '0x' + 'b'.repeat(64), pairCreatedAt: null, liquidity: { usd: 1e6 } }, /* sans date */
    { ...base, chainId: 'ethereum', pairAddress: '0x' + 'c'.repeat(64), pairCreatedAt: 3 },
    { ...base, pairAddress: '0x' + 'd'.repeat(64), pairCreatedAt: 4, liquidity: { usd: 1 } },
    { ...base, pairAddress: '0x' + 'e'.repeat(64), pairCreatedAt: 5, liquidity: { usd: 0 } },
    { chainId: 'base', baseToken: { address: '0xb2000000000000000000000000000000000000aa' }, quoteToken: { address: JETON }, pairAddress: '0x' + 'f'.repeat(64), pairCreatedAt: 6 },
  ];
  const m = M.indicesPoolIdDepuisPaires(paires, [JETON]);
  const l = m.get(JETON) || [];
  ok(l.length === 3 && l[0].poolId === ID && l[0].creeLeMs === F.dexscreener.pairCreatedAt, 'D1 la paire v4 la plus liquide d abord, 3 au plus (' + l.map((x) => x.poolId.slice(0, 6)).join(',') + ')');
  ok(!l.some((x) => x.poolId.length !== 66) && !l.some((x) => x.poolId === '0x' + 'b'.repeat(64)) && !l.some((x) => x.poolId === '0x' + 'c'.repeat(64)), 'D2 ni adresse Aerodrome, ni paire sans date, ni autre chaine');
  ok(!m.has('0xb2000000000000000000000000000000000000aa'), 'D3 un jeton non suivi n entre pas');
  ok(M.indicesPoolIdDepuisPaires(null).size === 0, 'D4 rien sans paires');
}
/* ── E ── serveur-web.js : l ORDRE (indices puis profondeur) sur les trois chemins */
{
  const src = readFileSync(process.env.SERVEUR_SOURCE || path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
  const corps = (nom) => { const i = src.indexOf('async function ' + nom + '('); if (i < 0) return ''; const j = src.slice(i).search(/\r?\n\}/); return j < 0 ? '' : src.slice(i, i + j); };
  const rails = corps('clesRails');
  ok(rails.length > 0, 'E0 clesRails trouvee dans le serveur');
  const iI = rails.indexOf('clesParIndices('), iP = rails.indexOf('resoudreClePool(');
  ok(iI > 0 && iP > iI, 'E1 les rails lisent les indices poolId AVANT la recherche courte, qui reste derriere');
  const i0 = src.indexOf("if (chemin.startsWith('/api/cle/'))");
  const route = i0 >= 0 ? src.slice(i0, src.indexOf("if (chemin === '/api/skins/prix'", i0)) : '';
  ok(route.indexOf('clesParIndices(') > 0 && route.indexOf('resoudreClePool(') > route.indexOf('clesParIndices('), 'E2 /api/cle lit les indices poolId AVANT resoudreClePool');
  const tr = corps('lireTrending');
  const a1 = tr.indexOf('retenirIndicesPoolId('), a2 = tr.indexOf('resoudreClesParIndices('), a3 = tr.indexOf('achatsMarche(');
  ok(a1 > 0 && a2 > a1 && a3 > a2, 'E3 le tour de trending retient les indices, cherche les cles, PUIS juge le Buy');
  ok(/clesCache\.set\(t, \{ ok: true, cles \}\)/.test(corps('garderCleLue') || src.slice(src.indexOf('function garderCleLue('), src.indexOf('function garderCleLue(') + 600)), 'E4 une cle LUE rejoint clesCache (vue par /api/cle, les rails, le Buy)');
  const v = src.slice(src.indexOf('async function cleParUnIndice('), src.indexOf('async function clesParIndices('));
  ok(/r\.etat === 'ABSENTE_PRES_DE_LA_DATE' \|\| r\.etat === 'HORS_JETON'/.test(v) && !/NON_LUE[^\n]*clesParIdVerdicts\.set/.test(v), 'E5 seules une absence lue et HORS_JETON sont retenues ; une NON_LUE jamais');
  ok(/lecteurLogs\(tete\)\.rpc/.test(v), 'E6 le getLogs passe par lecteurLogs (budget d archive epuise : non envoye, NON_LUE)');
}
console.log((ko ? 'ROUGE ' : 'VERT ') + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
