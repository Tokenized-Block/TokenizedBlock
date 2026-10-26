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
 *   F. serveur EXECUTE (2026-10-26, revue) : le code de serveur-web.js, extrait tel quel, tourne sur un faux noeud — la cle lue en fond
 *      est gardee et vue par le Buy du tour suivant, /api/cle et les rails la rendent, 40 jetons au plus par tour, et le getLogs passe
 *      par lecteurLogs (budget d archive epuise : non envoye, NON_LUE, ni gardee ni retenue comme absence).
 *   G. temps de bloc qui CHANGE (2 s -> 0,2 s, Base nov. 2026) : la date devient le bon bloc, ou NON_LU — jamais un bloc faux LU.
 * Mutants (sur copies, 2026-10-26, via CLE_PAR_POOL_ID_MODULE / SERVEUR_SOURCE) : 12 sur cle-par-pool-id.js, 6 sur serveur-web.js,
 *   dont les 5 survivants de la revue (poolId non compare, filtre de chaine, date apres la tete, boucle de correction, tete non bornee)
 *   et S1/S3/S4/S5 du serveur : tous tues par ce banc.
 * Usage : node test-cle-par-pool-id-20261026.mjs   (SERVEUR_SOURCE=<fichier> pour juger un autre serveur-web.js) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const { cleDePool, poolId: poolIdDe } = await import(pathToFileURL(path.join(ICI, 'pool.js')).href);
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
function fauxNoeud({ logs = 'vrai', bloc = 'ok', autres = [], ts = tsDe } = {}) {
  const appels = [];
  const rpc = async (methode, params) => {
    appels.push(methode);
    if (methode === 'eth_getBlockByNumber') {
      if (bloc === 'refus') throw new Error('over rate limit');
      if (bloc === 'null') return null;
      const b = parseInt(params[0], 16);
      return { number: params[0], timestamp: '0x' + Math.floor(ts(b)).toString(16) };
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
  /* une pool nee 100 blocs sous la tete : la fenetre s arrete A la tete (un toBlock futur n est pas une lecture de ce qui existe) */
  let vers = null;
  const r9 = await M.clePoolParId({ rpc: fauxNoeud().rpc, rpcLogs: async (m, p) => { vers = parseInt(p[0].toBlock, 16); return [LOG]; }, poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: BLOC + 100 });
  ok(r9.etat === 'LUE' && vers === BLOC + 100, 'A9 la fenetre est bornee par la tete (toBlock ' + vers + ', tete ' + (BLOC + 100) + ')');
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
  /* une date APRES la tete : NON_LU, nommee — meme sur un noeud qui sert n importe quel numero de bloc (le faux sert aussi l avenir) */
  const g = await M.blocDeDate({ rpc: fauxNoeud().rpc, tsS: tsDe(TETE) + 3600, tete: TETE });
  ok(g.etat === 'NON_LU' && /after the chain head/.test(String(g.pourquoi || '')), 'B8 date apres la tete -> NON_LU « after the chain head » (' + g.etat + ' : ' + (g.pourquoi || g.bloc) + ')');
}
/* ── G ── un temps de bloc qui CHANGE (2 s -> 0,2 s, Base nov. 2026) : la date se convertit encore en bloc, ou se dit NON LUE —
 *   jamais un bloc faux rendu LU, qui ferait lire une fenetre sans la pool et retenir « absente » 6 h */
{
  const kink = (K) => (b) => (b <= K ? TS + (b - BLOC) * 2 : TS + (K - BLOC) * 2 + (b - K) * 0.2);
  /* [K - BLOC, tete - K] : ou bascule la chaine par rapport a l Initialize d ADOF, et ou est la tete apres la bascule */
  const cas = [[50_000, 3_000_000], [200_000, 300_000], [10_000, 20_000_000], [1_000, 900_000], [-100_000, 2_000_000], [-1_000, 50_000]];
  for (const [dk, dt] of cas) {
    const K = BLOC + dk, tete = K + dt, ts = kink(K);
    const f = fauxNoeud({ ts });
    const d = await M.blocDeDate({ rpc: f.rpc, tsS: Math.floor(ts(BLOC)), tete });
    const r = await M.clePoolParId({ rpc: fauxNoeud({ ts }).rpc, poolId: ID, jeton: JETON, creeLeMs: Math.floor(ts(BLOC)) * 1000, tete });
    ok(d.etat === 'LU' && Math.abs(d.bloc - BLOC) <= 2 && f.appels.length <= 12 && r.etat === 'LUE',
      'G1 bascule ' + (dk > 0 ? dk + ' blocs APRES' : -dk + ' blocs AVANT') + ' l Initialize, tete ' + dt + ' blocs apres : bloc ' + d.bloc
      + ' (ecart ' + (d.bloc - BLOC) + ', ' + f.appels.length + ' lectures), cle ' + r.etat);
  }
  /* sans assez d essais pour converger : NON_LU (et NON_LUE, jamais retenue), pas LU avec un ecart de centaines de milliers de blocs */
  const K = BLOC + 50_000, tete = K + 3_000_000, ts = kink(K);
  const d1 = await M.blocDeDate({ rpc: fauxNoeud({ ts }).rpc, tsS: Math.floor(ts(BLOC)), tete, essais: 1 });
  ok(d1.etat === 'NON_LU' || Math.abs(d1.bloc - BLOC) <= M.MARGE_BLOCS, 'G2 un essai seulement : ' + d1.etat + ' ' + (d1.pourquoi || ('bloc ' + d1.bloc + ', ecart ' + (d1.bloc - BLOC))));
  ok(d1.etat === 'NON_LU' && /not converged/.test(String(d1.pourquoi || '')), 'G3 non converge -> NON_LU nomme (' + String(d1.pourquoi || '').slice(0, 90) + ')');
  const r1 = await M.clePoolParId({ rpc: async (m, p) => { if (m === 'eth_getLogs') return []; return fauxNoeud({ ts }).rpc(m, p); }, poolId: ID, jeton: JETON, creeLeMs: Math.floor(ts(BLOC)) * 1000, tete, essais: 1 });
  ok(r1.etat === 'NON_LUE', 'G4 la cle d une date non convertie est NON_LUE, pas ABSENTE_PRES_DE_LA_DATE (' + r1.etat + ')');
  /* la borne est en temps de bloc le plus COURT (0,2 s) : apres la bascule, 540 s d ecart = 2 700 blocs, hors de la fenetre de 999,
   *   meme si 540 s ne font que 270 blocs a 2 s */
  const Kf = BLOC - 100_000, tsF = kink(Kf), teteF = BLOC + 3000;
  const d5 = await M.blocDeDate({ rpc: fauxNoeud({ ts: tsF }).rpc, tsS: Math.floor(tsF(BLOC)), tete: teteF, essais: 1 });
  ok(d5.etat === 'NON_LU' || Math.abs(d5.bloc - BLOC) <= M.MARGE_BLOCS, 'G5 a 0,2 s par bloc, un ecart en secondes hors fenetre n est pas LU (' + d5.etat + ' ' + (d5.pourquoi || ('bloc ' + d5.bloc + ', ecart ' + (d5.bloc - BLOC))) + ')');
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
  /* un log Initialize VALIDE (son poolId se recalcule) mais d UNE AUTRE pool du meme jeton, rendu par un noeud qui ignore le filtre de
   *   topic : ce n est pas la pool demandee — sa cle ne doit pas etre rendue sous ce poolId */
  const k2 = cleDePool(LOG.topics[2].replace(/^0x0{24}/, '0x'), JETON, { fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000' });
  const id2 = poolIdDe(k2).toLowerCase();
  const autrePool = { ...LOG, topics: [LOG.topics[0], id2, LOG.topics[2], LOG.topics[3]],
    data: '0x' + (500).toString(16).padStart(64, '0') + (10).toString(16).padStart(64, '0') + '0'.repeat(64) + LOG.data.slice(2 + 192) };
  ok(id2 !== ID, 'C6a temoin : l autre pool a un autre poolId');
  const g = await M.clePoolParId({ rpc: fauxNoeud().rpc, rpcLogs: async () => [autrePool], poolId: ID, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(g.etat === 'ABSENTE_PRES_DE_LA_DATE' && !g.cle, 'C6 une autre pool valide du meme jeton, servie sous ce poolId, ne donne pas de cle (' + g.etat + (g.cle ? ' fee ' + g.cle.fee : '') + ')');
  const g2 = await M.clePoolParId({ rpc: fauxNoeud().rpc, rpcLogs: async () => [autrePool], poolId: id2, jeton: JETON, creeLeMs: TS * 1000, tete: TETE });
  ok(g2.etat === 'LUE' && g2.cle.fee === 500, 'C7 temoin : demandee par SON poolId, cette autre pool est LUE (' + g2.etat + ')');
}
/* ── D ── */
{
  /* DexScreener marque une pool v4 : dexId 'uniswap', labels ['v4'] (mesures/dexscreener-paires-v4-labels-20261026.json : 195 paires
   *   Base, les 159 pairAddress de 66 caracteres sont toutes « uniswap ["v4"] ») */
  const base = { chainId: 'base', dexId: 'uniswap', labels: ['v4'], baseToken: { address: JETON }, quoteToken: { address: '0x0000000000000000000000000000000000000000' } };
  const paires = [
    { ...base, pairAddress: '0x' + 'a'.repeat(64), pairCreatedAt: 1, liquidity: { usd: 5 } },
    { ...base, pairAddress: ID, pairCreatedAt: F.dexscreener.pairCreatedAt, liquidity: { usd: 9000 } },
    { ...base, pairAddress: '0x41e21950362b1014bc629252ecfff8fca5f1646c', pairCreatedAt: 2, liquidity: { usd: 1e6 } }, /* Aerodrome : une adresse */
    { ...base, pairAddress: '0x' + 'b'.repeat(64), pairCreatedAt: null, liquidity: { usd: 1e6 } }, /* sans date */
    { ...base, chainId: 'ethereum', pairAddress: '0x' + 'c'.repeat(64), pairCreatedAt: 3 },
    { ...base, pairAddress: '0x' + 'd'.repeat(64), pairCreatedAt: 4, liquidity: { usd: 1 } },
    { ...base, pairAddress: '0x' + 'e'.repeat(64), pairCreatedAt: 5, liquidity: { usd: 0 } },
    { chainId: 'base', dexId: 'uniswap', labels: ['v4'], baseToken: { address: '0xb2000000000000000000000000000000000000aa' }, quoteToken: { address: JETON }, pairAddress: '0x' + 'f'.repeat(64), pairCreatedAt: 6 },
  ];
  const m = M.indicesPoolIdDepuisPaires(paires, [JETON]);
  const l = m.get(JETON) || [];
  ok(l.length === 3 && l[0].poolId === ID && l[0].creeLeMs === F.dexscreener.pairCreatedAt, 'D1 la paire v4 la plus liquide d abord, 3 au plus (' + l.map((x) => x.poolId.slice(0, 6)).join(',') + ')');
  ok(!l.some((x) => x.poolId.length !== 66) && !l.some((x) => x.poolId === '0x' + 'b'.repeat(64)) && !l.some((x) => x.poolId === '0x' + 'c'.repeat(64)), 'D2 ni adresse Aerodrome, ni paire sans date, ni autre chaine');
  ok(!m.has('0xb2000000000000000000000000000000000000aa'), 'D3 un jeton non suivi n entre pas');
  ok(M.indicesPoolIdDepuisPaires(null).size === 0, 'D4 rien sans paires');
  /* D2 « ni autre chaine » etait vide : la borne de 3 par jeton ecartait deja la paire ethereum. Ici elle est SEULE et la plus liquide */
  const m5 = M.indicesPoolIdDepuisPaires([
    { ...base, chainId: 'ethereum', pairAddress: '0x' + 'c'.repeat(64), pairCreatedAt: 3, liquidity: { usd: 1e9 } },
    { ...base, pairAddress: ID, pairCreatedAt: F.dexscreener.pairCreatedAt, liquidity: { usd: 1 } },
  ], [JETON]);
  const l5 = m5.get(JETON) || [];
  ok(l5.length === 1 && l5[0].poolId === ID, 'D5 une paire d une autre chaine n entre pas, meme seule et plus liquide (' + l5.map((x) => x.poolId.slice(0, 6)).join(',') + ')');
  /* finding 6 : 66 caracteres ne suffisent pas — seule une pool que DexScreener dit Uniswap v4 vaut un getLogs sur le PoolManager v4 */
  const m6 = M.indicesPoolIdDepuisPaires([
    { ...base, dexId: 'pancakeswap', pairAddress: '0x' + '1'.repeat(64), pairCreatedAt: 7, liquidity: { usd: 1e9 } },
    { ...base, labels: ['v3'], pairAddress: '0x' + '2'.repeat(64), pairCreatedAt: 8, liquidity: { usd: 1e8 } },
    { ...base, labels: undefined, pairAddress: '0x' + '3'.repeat(64), pairCreatedAt: 9, liquidity: { usd: 1e7 } },
    { ...base, pairAddress: ID, pairCreatedAt: F.dexscreener.pairCreatedAt, liquidity: { usd: 1 } },
  ], [JETON]);
  const l6 = m6.get(JETON) || [];
  ok(l6.length === 1 && l6[0].poolId === ID, 'D6 66 caracteres d un autre dex, labels v3 ou sans label : pas un indice v4 (' + l6.map((x) => x.poolId.slice(0, 6)).join(',') + ')');
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
  const a1 = tr.indexOf('retenirIndicesPoolId('), a2 = tr.indexOf('lancerClesParIndicesEnFond('), a3 = tr.indexOf('achatsMarche(');
  const fond = src.slice(src.indexOf('function lancerClesParIndicesEnFond('), src.indexOf('/** La cle exacte d un block'));
  ok(a1 > 0 && a3 > a1 && a2 > a3 && /void consommateurArchive\.run\('fond cles poolId', \(\) => resoudreClesParIndices\(/.test(fond) && /if \(clesParIdEnCours\) return/.test(fond),
    'E3 le tour de trending retient les indices, juge le Buy, PUIS lance la recherche EN FOND (non attendue, une a la fois)');
  ok(/clesCache\.set\(t, \{ ok: true, cles \}\)/.test(corps('garderCleLue') || src.slice(src.indexOf('function garderCleLue('), src.indexOf('function garderCleLue(') + 600)), 'E4 une cle LUE rejoint clesCache (vue par /api/cle, les rails, le Buy)');
  const v = src.slice(src.indexOf('async function cleParUnIndice('), src.indexOf('async function clesParIndices('));
  ok(/r\.etat === 'ABSENTE_PRES_DE_LA_DATE' \|\| r\.etat === 'HORS_JETON'/.test(v) && !/NON_LUE[^\n]*clesParIdVerdicts\.set/.test(v), 'E5 seules une absence lue et HORS_JETON sont retenues ; une NON_LUE jamais');
  ok(/lecteurLogs\(tete\)\.rpc/.test(v), 'E6 le getLogs passe par lecteurLogs (budget d archive epuise : non envoye, NON_LUE)');
}
/* ── F ── serveur-web.js EXECUTE : le code du fichier (extrait tel quel, pas recopie) tourne sur un faux noeud. E ne lit que le
 *   texte ; F fait mourir ce que le texte ne voit pas : la cle lue jamais gardee, /api/cle qui la perd, la borne par tour, et le
 *   getLogs qui contournerait lecteurLogs (budget d archive). */
{
  const src = readFileSync(process.env.SERVEUR_SOURCE || path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
  const entre = (de, a) => { const i = src.indexOf(de); const j = i < 0 ? -1 : src.indexOf(a, i); return i < 0 || j < 0 ? '' : src.slice(i, j); };
  const blocIndices = entre('const indicesPoolId = new Map();', '/** La cle exacte d un block');
  const blocRails = entre('async function clesRails(', '\n}\n') + '\n}\n';
  const blocConnues = entre('function clesConnuesServeur(', 'async function achatsMarche(');
  const blocRoute = entre("if (chemin.startsWith('/api/cle/')) {", '/* les skins');
  const blocCreateur = entre('async function createurDuBlock(', '\n}\n') + '\n}\n';
  ok(blocIndices.length > 0 && blocRails.length > 20 && blocConnues.length > 0 && blocRoute.length > 0 && blocCreateur.length > 20
    && blocIndices.includes('function lancerClesParIndicesEnFond('), 'F0 les cinq blocs du serveur sont extraits du fichier (dont lancerClesParIndicesEnFond)');
  const NON_ENVOYEE = 'archive node daily budget reached — deep window not sent, it waits for 00:00 UTC';
  const { AsyncLocalStorage } = await import('node:async_hooks');
  /* une pool « template » (NOTRE hook) que seule la recherche par profondeur trouve, et le createur que ce hook rend */
  const HOOK_NOTRE = '0x' + '70'.repeat(19) + '30', CREATEUR = '0x' + 'c7'.repeat(20);
  const CLE_TEMPLATE = { poolId: '0x' + '7e'.repeat(32), currency0: '0x0000000000000000000000000000000000000000', currency1: JETON, fee: 0, tickSpacing: 200, hooks: HOOK_NOTRE, bloc: TETE - 500 };
  /** un serveur : le code extrait + un faux noeud (blocs a 2 s, les logs donnes) + un lecteurLogs dont le budget peut etre epuise ;
   *  `profondeur` : les cles que rend la recherche par profondeur (resoudreClePool), sinon ok:false */
  function serveur({ logs = [LOG], budgetEpuise = false, profondeur = null } = {}) {
    const e = { getLogsNoeud: 0, getLogsRefuses: 0, ecritures: 0, profondeur: 0, clesCache: new Map(), clesPool: new Map(), etiquettes: [], appelsHook: [] };
    const consommateurArchive = new AsyncLocalStorage();
    const rpcServeur = async (m, p) => {
      if (m === 'eth_blockNumber') return '0x' + TETE.toString(16);
      if (m === 'eth_getBlockByNumber') return { number: p[0], timestamp: '0x' + tsDe(parseInt(p[0], 16)).toString(16) };
      if (m === 'eth_getLogs') {
        e.getLogsNoeud += 1;
        e.etiquettes.push(consommateurArchive.getStore() || 'sans etiquette');
        const q = p[0], de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
        return logs.filter((l) => parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a
          && q.topics.every((t, i) => t === null || String(l.topics[i]).toLowerCase() === String(t).toLowerCase()));
      }
      throw new Error('unexpected ' + m);
    };
    /* comme le vrai (serveur-web.js lecteurLogs) : budget epuise, la fenetre profonde n est PAS envoyee et le lecteur leve */
    const lecteurLogs = (tete) => ({ rpc: async (m, p) => {
      if (m === 'eth_getLogs' && budgetEpuise && tete - parseInt(p[0].fromBlock, 16) >= 9000) { e.getLogsRefuses += 1; throw new Error(NON_ENVOYEE); }
      const r = await rpcServeur(m, p);
      if (m === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list');
      return r;
    }, nonEnvoyee: () => false, suivi: {} });
    const resoudreClePool = async () => { e.profondeur += 1; return profondeur ? { ok: true, cles: profondeur.map((c) => ({ ...c })) } : { ok: false, pourquoi: 'no Initialize found in the last 9990 blocks' }; };
    /* createurDuBlock : NOS hooks = HOOK_NOTRE, qui rend CREATEUR ; un autre hook n a pas a etre interroge */
    const rpcActivite = async (m, p) => {
      e.appelsHook.push(String(p[0].to).toLowerCase());
      if (String(p[0].to).toLowerCase() === HOOK_NOTRE) return '0x' + CREATEUR.slice(2).padStart(64, '0');
      throw new Error('execution reverted');
    };
    const S = new Function('clesCache', 'clesPool', 'ecrireCles', 'rpcServeur', 'lecteurLogs', 'resoudreClePool', 'clePoolParId', 'indicesPoolIdDepuisPaires',
      'consommateurArchive', 'HOOKS_FRAIS', 'HOOK_7030', 'fraisScan', 'rpcActivite', 'SEL_CREATEURS', 'SEL_CREATEUR_DE',
      blocIndices + '\n' + blocRails + '\n' + blocConnues + '\n' + blocCreateur + '\nasync function routeCle(chemin, res) {\n' + blocRoute + '\n}\n'
      + 'return { retenirIndicesPoolId, resoudreClesParIndices, clesConnuesServeur, clesRails, routeCle, clesParIdVerdicts, createurDuBlock, lancerClesParIndicesEnFond,'
      + ' enCours: () => clesParIdEnCours, dernier: () => clesParIdDernier };')(
      e.clesCache, e.clesPool, () => { e.ecritures += 1; }, rpcServeur, lecteurLogs, resoudreClePool, M.clePoolParId, M.indicesPoolIdDepuisPaires,
      consommateurArchive, [{ nom: 'V8', adr: HOOK_NOTRE }], null, { pools: [] }, rpcActivite, '0x2e1d6cd1', '0x3b1fa6a3');
    return { ...S, e, consommateurArchive };
  }
  const v4 = { dexId: 'uniswap', labels: ['v4'] };
  const paireAdof = { chainId: 'base', ...v4, baseToken: { address: JETON }, quoteToken: { address: '0x0000000000000000000000000000000000000000' },
    pairAddress: ID, pairCreatedAt: F.dexscreener.pairCreatedAt, liquidity: { usd: 9000 } };
  const corpsDe = (s, chemin) => new Promise((fin) => { s.routeCle(chemin, { writeHead() {}, end: (x) => fin(JSON.parse(x)) }); });
  /* S1 — la cle LUE en fond est GARDEE : le Buy du tour suivant (clesConnuesServeur) la voit, et le tour suivant ne la relit pas */
  {
    const s = serveur();
    s.retenirIndicesPoolId([paireAdof], [JETON]);
    ok(s.clesConnuesServeur(JETON).length === 0, 'F1a temoin : avant la recherche, le Buy ne voit aucune cle d ADOF');
    const c1 = await s.resoudreClesParIndices([{ adr: JETON }]);
    const vues = s.clesConnuesServeur(JETON);
    ok(c1.lues === 1 && vues.length === 1 && vues[0].fee === 100 && vues[0].tickSpacing === 1 && vues[0].hooks === '0x' + LOG.data.slice(2 + 152, 2 + 192),
      'F1 tour 1 : cle lue (' + JSON.stringify(c1) + ') ET vue par le Buy du tour suivant (' + vues.length + ' cle)');
    ok(s.e.ecritures >= 1, 'F2 la cle lue est ecrite (cles-pool.json) : ' + s.e.ecritures + ' ecriture(s)');
    const avant = s.e.getLogsNoeud;
    const c2 = await s.resoudreClesParIndices([{ adr: JETON }]);
    ok(c2.essayees === 0 && s.e.getLogsNoeud === avant, 'F3 tour 2 : la cle connue n est pas relue (' + c2.essayees + ' essayee, ' + (s.e.getLogsNoeud - avant) + ' getLogs)');
  }
  /* S3 — /api/cle rend la cle lue par l indice */
  {
    const s = serveur();
    s.retenirIndicesPoolId([paireAdof], [JETON]);
    const corps = await new Promise((fin) => { s.routeCle('/api/cle/' + JETON, { writeHead() {}, end: (x) => fin(JSON.parse(x)) }); });
    ok(corps.ok === true && Array.isArray(corps.cles) && corps.cles.length === 1 && corps.cles[0].poolId === ID && corps.cles[0].fee === 100,
      'F4 /api/cle rend la cle lue par son poolId (' + JSON.stringify(corps).slice(0, 120) + ')');
    /* finding 4 : la cle de l indice S AJOUTE a la recherche par profondeur, elle ne la remplace pas — celle-ci tourne encore */
    ok(s.e.profondeur === 1, 'F5 /api/cle lance AUSSI la recherche par profondeur (' + s.e.profondeur + ' fois) ; sans resultat, la cle de l indice reste servie');
    const c2 = await corpsDe(s, '/api/cle/' + JETON);
    ok(c2.ok === true && c2.cles && c2.cles.length === 1 && s.e.getLogsNoeud === 1, 'F6 la seconde visite sert la cle gardee, sans getLogs de plus (' + s.e.getLogsNoeud + ')');
    const s2 = serveur();
    s2.retenirIndicesPoolId([paireAdof], [JETON]);
    const rails = await s2.clesRails(JETON);
    ok(rails.length === 1 && rails[0].poolId === ID && s2.e.profondeur === 1, 'F7 les rails recoivent la cle de l indice, et la recherche courte tourne encore (' + s2.e.profondeur + ')');
  }
  /* S4 — au plus 40 jetons cherches par tour ; le reste est reporte, pas perdu */
  {
    const s = serveur({ logs: [] });
    const jetons = Array.from({ length: 45 }, (_, i) => '0xb2' + (i + 1).toString(16).padStart(38, '0'));
    s.retenirIndicesPoolId(jetons.map((t, i) => ({ chainId: 'base', ...v4, baseToken: { address: t }, quoteToken: { address: '0x0000000000000000000000000000000000000000' },
      pairAddress: '0x' + (i + 1).toString(16).padStart(64, '0'), pairCreatedAt: TS * 1000, liquidity: { usd: 1 } })), jetons);
    const c = await s.resoudreClesParIndices(jetons.map((adr) => ({ adr })));
    ok(c.essayees === 40 && c.reportees === 5 && s.e.getLogsNoeud === 40 && c.absentes === 40,
      'F8 45 jetons a indice : 40 cherches, 5 reportes, 40 getLogs (' + JSON.stringify(c) + ', ' + s.e.getLogsNoeud + ' getLogs)');
  }
  /* S5 — le getLogs passe par lecteurLogs : budget d archive epuise, la fenetre (28 000 blocs sous la tete) n est PAS envoyee, NON_LUE,
   *   rien de garde ni de retenu comme absent ; le tour suivant reessaie */
  {
    const s = serveur({ budgetEpuise: true });
    s.retenirIndicesPoolId([paireAdof], [JETON]);
    const c = await s.resoudreClesParIndices([{ adr: JETON }]);
    ok(c.nonLues === 1 && c.lues === 0 && s.e.getLogsNoeud === 0 && s.e.getLogsRefuses === 1,
      'F9 budget epuise : fenetre non envoyee, NON_LUE (' + JSON.stringify(c) + ', ' + s.e.getLogsNoeud + ' getLogs au noeud)');
    ok(s.clesConnuesServeur(JETON).length === 0 && s.clesParIdVerdicts.size === 0, 'F10 une NON_LUE n est ni gardee comme cle ni retenue comme absence');
    const c2 = await s.resoudreClesParIndices([{ adr: JETON }]);
    ok(c2.essayees === 1 && s.e.getLogsRefuses === 2, 'F11 le tour suivant reessaie (' + c2.essayees + ' essayee)');
  }
  /* finding 4 (revue) — la cle d un indice S AJOUTE, ne REMPLACE pas : ADOF a une cle d indice (hook ETRANGER e4af…) ET une pool
   *   template (NOTRE hook) que seule la profondeur trouve. Les deux sont offertes ; le createur se lit sur la pool template. */
  {
    const s = serveur({ profondeur: [CLE_TEMPLATE] });
    s.retenirIndicesPoolId([paireAdof], [JETON]);
    await s.resoudreClesParIndices([{ adr: JETON }]); /* la cle de l indice est lue et gardee (comme en prod, par le tour de fond) */
    ok((s.e.clesCache.get(JETON) || { cles: [] }).cles.length === 1, 'H0 temoin : seule la cle de l indice est gardee avant toute recherche par profondeur');
    const ids = (l) => (l || []).map((c) => String(c.poolId).toLowerCase()).sort().join(',');
    const deux = [ID, CLE_TEMPLATE.poolId].sort().join(',');
    const rails = await s.clesRails(JETON);
    ok(ids(rails) === deux && rails[0].poolId === CLE_TEMPLATE.poolId, 'H1 les rails offrent les DEUX cles, celle de la profondeur d abord (' + rails.map((c) => c.hooks.slice(0, 6)).join(',') + ')');
    const s2 = serveur({ profondeur: [CLE_TEMPLATE] });
    s2.retenirIndicesPoolId([paireAdof], [JETON]);
    await s2.resoudreClesParIndices([{ adr: JETON }]);
    const corps = await corpsDe(s2, '/api/cle/' + JETON);
    ok(corps.ok === true && ids(corps.cles) === deux, 'H2 /api/cle rend les DEUX cles (' + (corps.cles || []).map((c) => c.hooks.slice(0, 6)).join(',') + ')');
    ok(ids((s2.e.clesCache.get(JETON) || {}).cles) === deux && s2.e.ecritures >= 2, 'H3 l union est gardee (cles-pool.json) : ' + ids((s2.e.clesCache.get(JETON) || {}).cles).length + ' car.');
    const p0 = s2.e.profondeur;
    const corps2 = await corpsDe(s2, '/api/cle/' + JETON);
    ok(corps2.depuisCache === true && ids(corps2.cles) === deux && s2.e.profondeur === p0, 'H4 une fois l union gardee, la visite suivante la sert du cache, sans nouvelle recherche');
    const s3 = serveur({ profondeur: [CLE_TEMPLATE] });
    s3.retenirIndicesPoolId([paireAdof], [JETON]);
    await s3.resoudreClesParIndices([{ adr: JETON }]);
    const qui = await s3.createurDuBlock(JETON);
    ok(qui === CREATEUR && s3.e.appelsHook.includes(HOOK_NOTRE), 'H5 createurDuBlock lit le createur sur la pool template malgre la cle d indice (' + qui + ')');
    /* une entree d AVANT (cle trouvee par profondeur, sans marque d indice) reste servie du cache, sans recherche : pas de surcout */
    const s4 = serveur({ profondeur: [CLE_TEMPLATE] });
    s4.e.clesCache.set(JETON, { ok: true, cles: [{ ...CLE_TEMPLATE }] });
    const r4 = await s4.clesRails(JETON);
    const c4 = await corpsDe(s4, '/api/cle/' + JETON);
    ok(r4.length === 1 && c4.depuisCache === true && s4.e.profondeur === 0 && s4.e.getLogsNoeud === 0, 'H6 une cle d avant (profondeur) : servie du cache, aucune recherche ni getLogs');
  }
  /* finding 6 (revue) — la recherche de fond a SA propre etiquette d archive, et une paire de 66 caracteres qui n est pas une pool
   *   Uniswap v4 (dexId / labels de DexScreener) ne coute aucun getLogs */
  {
    const s = serveur();
    s.retenirIndicesPoolId([paireAdof], [JETON]);
    await s.consommateurArchive.run('fond trending', async () => { s.lancerClesParIndicesEnFond([{ adr: JETON }]); });
    for (let i = 0; i < 200 && s.enCours(); i += 1) await new Promise((o) => setTimeout(o, 5));
    ok(!s.enCours() && s.dernier() && s.dernier().lues === 1, 'H7 la recherche de fond aboutit (' + JSON.stringify(s.dernier()) + ')');
    ok(s.e.etiquettes.length === 1 && s.e.etiquettes[0] === 'fond cles poolId', 'H8 son getLogs est compte sous « fond cles poolId », pas sous le tour qui la lance (' + s.e.etiquettes.join(',') + ')');
    const z = serveur();
    const autre = '0xb2' + 'ab'.repeat(19);
    z.retenirIndicesPoolId([
      { ...paireAdof, dexId: 'pancakeswap', labels: ['v4'] },
      { ...paireAdof, baseToken: { address: autre }, labels: ['v3'] },
    ], [JETON, autre]);
    const c = await z.resoudreClesParIndices([{ adr: JETON }, { adr: autre }]);
    ok(c.essayees === 0 && c.sansIndice === 2 && z.e.getLogsNoeud === 0, 'H9 66 caracteres mais pas Uniswap v4 : aucun indice, aucun getLogs (' + JSON.stringify(c) + ')');
  }
}
console.log((ko ? 'ROUGE ' : 'VERT ') + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
