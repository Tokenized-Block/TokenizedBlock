/* MESURE — LA MATRICE EXHAUSTIVE blocks TB x actions tokenisees, AVANT et APRES, a 4 tailles.
 *
 *   PORT_FORK=8599 node mesure-multipool-matrice.mjs [graphe.json] [actions-pools.json]
 *
 * Demande de Raksha (2026-10-01 23:24) : toutes les paires et routes entre blocks TB et actions
 * tokenisees — block<->action direct, block<->action via OUSD/USDC/ETH, action<->action par notre
 * multipool, block<->block via une action — dans LES DEUX SENS, a plusieurs tailles (micro, 10 $,
 * 100 $, 1 000 $), avec le devis, l impact de prix et la raison du revert.
 *
 * ⛔ DEUX NIVEAUX, NOMMES DANS CHAQUE LIGNE :
 *   - « graphe » : TOUTES les paires — existence d un chemin de <= 3 sauts (4 pour block<->block)
 *     sur des pools PROUVEES, placement du frais (refus si seul un block est disponible) ;
 *   - « cote »   : devis on-chain du chemin complet aux 4 tailles. Coter TOUTES les paires block x
 *     action demanderait ~10^6 eth_call ; on cote : toutes les paires action x action, tous les
 *     blocks vers/depuis USDC/OUSD/ETH, chaque block vers/depuis SON action, et les TOP_BLOCKS blocks
 *     les plus liquides x toutes les actions reliees, et block x block entre les TOP_BB. Le reste
 *     est marque « graphe seulement » — jamais invente.
 * ⛔ IMPACT = 1 - (sortie/entree a la taille) / (sortie/entree en micro), meme chemin, meme etat :
 *   pur on-chain, sans aucun prix. RETENU = valeur sortie / valeur entree en $ avec le prix de
 *   chaque jeton : actions et devises MESUREES (devis on-chain), blocks au prix /api/trending
 *   (agrege, NOMME tel). Un prix absent donne « inconnu ».
 * ⛔ AVANT = ce que le code de l app offre aujourd hui (modele lu, non execute) — voir le rapport §1. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { devisesFraisAdmises, cheminsCandidats, placerFrais, coterChemin, ADRESSES, noeud, decrireChemin, FRAIS_BPS } from './multipool.js';
import { ACTIONS_COINBASE } from './paires.js';

const PORT = process.env.PORT_FORK || '8599';
const URL = 'http://127.0.0.1:' + PORT;
const GRAPHE = process.argv[2] || '/workspace/mp-data/graphe.json';
const AP = process.argv[3] || '/workspace/mp-data/actions-pools.json';
const SORTIE = process.env.SORTIE || '/workspace/canal/matrice-routes-2026-10-01.csv';
const TOP_BLOCKS = Number(process.env.TOP_BLOCKS || 40), TOP_BB = Number(process.env.TOP_BB || 15), CONC = Number(process.env.CONC || 6);
const TAILLES = [['micro', 0.01], ['10$', 10], ['100$', 100], ['1k$', 1000]];
const bas = (a) => String(a || '').toLowerCase();
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0, reessais = 0;
async function rpc(method, params) {
  for (let t = 0; t < 5; t += 1) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS || 90000)), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) { if (/429|rate limit|Max retries|Transport/i.test(j.error.message || '') && t < 4) { reessais += 1; await dors(3000 * (t + 1)); continue; } const e = new Error(j.error.message); e.rpc = true; throw e; }
      return j.result;
    } catch (e) { if (e.rpc) throw e; if (e && e.name === 'TimeoutError') { const x = new Error('TIMEOUT ' + (Number(process.env.TIMEOUT_MS || 90000) / 1000) + ' s (le devis traverse probablement des ticks vides : profondeur insuffisante)'); x.rpc = true; throw x; } await dors(500 * (t + 1)); }
  }
  throw new Error('transport');
}
async function par(items, n, fn) { const it = [...items]; let k = 0; const t0 = Date.now(); await Promise.all(Array.from({ length: Math.min(n, it.length) }, async () => { while (k < it.length) { const x = it[k++]; await fn(x); if (k % 250 === 0) console.log('  ... ' + k + '/' + it.length + ' en ' + Math.round((Date.now() - t0) / 1000) + ' s · 429 ' + reessais); } })); }

const g = JSON.parse(readFileSync(GRAPHE, 'utf8'));
{ /* ⛔ meme etat que le graphe : bloc courant du fork == g.bloc (aucun bloc local mine par un banc) */
  const b = parseInt(await rpc('eth_blockNumber', []), 16);
  if (b !== g.bloc && process.env.ACCEPTER_ETAT_MODIFIE !== '1') { console.log('KO : fork au bloc ' + b + ', graphe au bloc ' + g.bloc + ' — etat different, NON MESURE'); process.exit(1); }
}
const ap = existsSync(AP) ? JSON.parse(readFileSync(AP, 'utf8')) : { actions: [], pools: [], prix: {} };
if (ap.bloc && ap.bloc !== g.bloc) console.log('⚠️ blocs differents : graphe ' + g.bloc + ' / actions ' + ap.bloc);
const N = new Map(g.noeuds.map((n) => [n.adr, { ...n }]));
const ETH = ADRESSES.ETH, USDC = ADRESSES.USDC, OUSD = ADRESSES.OUSD;
/* les actions : registre + mesurees ; prix = meilleure pool MESUREE */
const STOCKS = new Map();
for (const x of ap.actions || []) {
  if (x.dec === null || x.dec === undefined) continue;
  const prixs = Object.values(x.meilleures || {}).filter(Boolean).map((m) => m.prix).filter((p) => p > 0);
  STOCKS.set(x.adr, { adr: x.adr, sym: x.symbole || x.ticker + '?', emetteur: x.emetteur, dec: x.dec, prix: prixs.length ? prixs[0] : null });
}
for (const s of ACTIONS_COINBASE) if (!STOCKS.has(bas(s.adr))) STOCKS.set(bas(s.adr), { adr: bas(s.adr), sym: s.symbole, emetteur: 'Coinbase', dec: N.get(bas(s.adr)) ? N.get(bas(s.adr)).dec : null, prix: null });
for (const [a, s] of STOCKS) N.set(a, { ...(N.get(a) || {}), adr: a, sym: s.sym, classe: 'action', dec: s.dec ?? (N.get(a) || {}).dec });
const aretes = g.aretes.map((e) => ({ ...e, liqUsd: Number(e.liqUsd) || 0 }));
const vus = new Set(aretes.map((e) => e.id));
for (const p of ap.pools || []) if (p.arete && !vus.has(p.id) && p.retenu1000 !== null) { aretes.push({ ...p.arete, liqUsd: p.tvlUsd || (p.retenu1000 > 0.5 ? 1000 / Math.max(1 - p.retenu1000, 0.001) : 0) }); vus.add(p.id); }
const BLOCKS = [...N.values()].filter((n) => n.classe === 'block').map((n) => n.adr);
const ADMISES = devisesFraisAdmises([...STOCKS.keys()], { blocks: BLOCKS });
const sym = (a) => (a === ETH ? 'ETH' : (N.get(a) && N.get(a).sym) || a.slice(0, 10));
const symboles = Object.fromEntries([...N.values()].map((n) => [n.adr, n.sym || n.adr.slice(0, 8)]));
const dec = (a) => (a === ETH ? 18 : a === USDC ? 6 : N.get(a) ? N.get(a).dec : null);
const prix = (a) => {
  if (a === USDC) return { p: 1, src: 'USDC' };
  if (a === ETH) return { p: (ap.prix && ap.prix[ETH]) || (N.get(ETH) && N.get(ETH).prixMesure) || null, src: 'devis on-chain' };
  if (a === OUSD) return { p: ap.prix && ap.prix[OUSD] || null, src: 'devis on-chain' };
  const s = STOCKS.get(a); if (s && s.prix) return { p: s.prix, src: 'devis on-chain (meilleure pool)' };
  const n = N.get(a); if (n && n.ligne && n.ligne.prixUsd) return { p: n.ligne.prixUsd, src: '/api/trending (agrege)' };
  if (n && n.prixDs) return { p: n.prixDs, src: 'dexscreener (agrege)' };
  return { p: null, src: 'inconnu' };
};
const unites = (a, usd) => { const { p } = prix(a), d = dec(a); if (!p || d === null || d === undefined) return null; const v = BigInt(Math.floor((usd / p) * 10 ** Math.min(d, 15))) * 10n ** BigInt(Math.max(d - 15, 0)); return v > 0n ? v : null; };

/* voisinage */
const adj = new Map();
for (const e of aretes) { const [x, y] = e.venue === 'uniswap-v4' ? [noeud(e.cle.currency0), noeud(e.cle.currency1)] : [noeud(e.token0), noeud(e.token1)]; for (const [p, q] of [[x, y], [y, x]]) { if (!adj.has(p)) adj.set(p, new Set()); adj.get(p).add(q); } }
const STOCKS_RELIES = [...STOCKS.keys()].filter((s) => adj.has(s));
const BLOCKS_RELIES = BLOCKS.filter((b) => adj.has(b));
const pairesDe = (b) => [...(adj.get(b) || [])].filter((x) => STOCKS.has(x));
const liqBlock = (b) => (N.get(b) && N.get(b).ligne && N.get(b).ligne.liquiditeUsd) || 0;
const TOP = BLOCKS_RELIES.slice().sort((x, y) => liqBlock(y) - liqBlock(x)).slice(0, TOP_BLOCKS);
const TOPBB = TOP.slice(0, TOP_BB);
console.log('=== MATRICE — bloc ' + g.bloc + ' · aretes ' + aretes.length + ' · blocks ' + BLOCKS.length + ' (relies ' + BLOCKS_RELIES.length + ') · actions ' + STOCKS.size + ' (reliees ' + STOCKS_RELIES.length + ') · frais 0,09 % net = 900 / 1e6 = ' + FRAIS_BPS + ' bps ===');

/* AVANT (modele du code de l app) */
const etoile = new Set();
for (const e of aretes) { if (!['uniswap-v4', 'aerodrome-cl'].includes(e.venue)) continue; const [x, y] = e.venue === 'uniswap-v4' ? [noeud(e.cle.currency0), noeud(e.cle.currency1)] : [noeud(e.token0), noeud(e.token1)]; if (x === USDC) etoile.add(y); if (y === USDC) etoile.add(x); }
const DEVISES_APP = new Set([ETH, USDC, OUSD, ADRESSES.CBBTC, ...ACTIONS_COINBASE.map((s) => bas(s.adr))]);
function avant(de, vers) {
  const nv = N.get(vers), nd = N.get(de);
  if (nv && nv.classe === 'block') { const q = nv.ligne && noeud(nv.ligne.quoteAdr); if (q && q === de) return 'oui (pool propre)'; if (DEVISES_APP.has(de) && q && (q === USDC || etoile.has(q)) && (de === USDC || de === ETH || etoile.has(de))) return 'oui (etoile USDC, achat)'; return 'non'; }
  if (nd && nd.classe === 'block') { const q = nd.ligne && noeud(nd.ligne.quoteAdr); return q && q === vers ? 'oui (vente pool propre)' : 'non (pas de vente multi-sauts)'; }
  return 'non (pas de swap hors block)';
}

/* ── les paires ── */
const travaux = [];
const ajoute = (cat, de, vers, coter, sautsMax = 3) => travaux.push({ cat, de, vers, coter, sautsMax });
for (const b of BLOCKS_RELIES) {
  for (const s of pairesDe(b)) { ajoute('block<->action direct', b, s, true); ajoute('block<->action direct', s, b, true); }
  for (const h of [USDC, OUSD, ETH]) { ajoute('block<->devise', b, h, true); ajoute('block<->devise', h, b, true); }
  const enTop = TOP.includes(b);
  for (const s of STOCKS_RELIES) if (!pairesDe(b).includes(s)) { ajoute('block<->action via devise', b, s, enTop); ajoute('block<->action via devise', s, b, enTop); }
}
for (const x of STOCKS_RELIES) for (const y of STOCKS_RELIES) if (x !== y) ajoute('action<->action', x, y, true);
for (const x of STOCKS_RELIES) for (const h of [USDC, OUSD, ETH]) { ajoute('action<->devise', x, h, true); ajoute('action<->devise', h, x, true); }
for (const a of BLOCKS_RELIES) for (const b of BLOCKS_RELIES) if (a !== b) ajoute('block<->block', a, b, TOPBB.includes(a) && TOPBB.includes(b), 4);
const nCote = travaux.filter((t) => t.coter).length;
console.log('paires : ' + travaux.length + ' (cotees ' + nCote + ', graphe seulement ' + (travaux.length - nCote) + ')');

const entete = ['categorie', 'niveau', 'de', 'de_classe', 'vers', 'vers_classe', 'avant_app', 'apres_route', 'n_chemins', 'sauts', 'venues', 'chemin', 'frais_noeud', 'frais_devise',
  ...TAILLES.flatMap(([t]) => [t + '_entree', t + '_sortie', t + '_frais', t + '_impact', t + '_retenu', t + '_etat']), 'raison_si_aucun_devis'].join(',');
const NCOL = entete.split(',').length;
const pad = (a) => { if (a.length > NCOL) throw new Error('ligne trop longue ' + a.length); return [...a, ...Array(NCOL - a.length).fill('')]; };
const lignes = [];
const csv = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const stats = {};
const classe = (a) => (a === USDC || a === ETH || a === OUSD ? 'devise' : STOCKS.has(a) ? 'action' : (N.get(a) && N.get(a).classe) || '?');
await par(travaux, CONC, async (t) => {
  const st = stats[t.cat] || (stats[t.cat] = { paires: 0, avant: 0, route: 0, refusFrais: 0, cotees: 0, coteOk: { micro: 0, '10$': 0, '100$': 0, '1k$': 0 }, etats: {} });
  st.paires += 1;
  const av = avant(t.de, t.vers); if (av.startsWith('oui')) st.avant += 1;
  const cands = cheminsCandidats(aretes, t.de, t.vers, { sautsMax: t.sautsMax, max: t.coter ? 6 : 2 });
  const base = [t.cat, t.coter ? 'cote' : 'graphe', sym(t.de), classe(t.de), sym(t.vers), classe(t.vers), av];
  if (!cands.length) { lignes.push(pad([...base, 'aucune', 0]).map(csv).join(',')); return; }
  const plac = cands.map((ch) => ({ ch, pl: placerFrais(ch, ADMISES) })).filter((x) => x.pl.etat === 'OK');
  if (!plac.length) { st.refusFrais += 1; lignes.push(pad([...base, 'REFUSE: frais seulement en block', cands.length, cands[0].length, '', decrireChemin(cands[0], symboles)]).map(csv).join(',')); return; }
  st.route += 1;
  if (!t.coter) { const c = plac[0]; lignes.push(pad([...base, 'oui', cands.length, c.ch.length, [...new Set(c.ch.map((s) => s.e.venue))].join('+'), decrireChemin(c.ch, symboles), c.pl.indice, sym(c.pl.devise)]).map(csv).join(',')); return; }
  st.cotees += 1;
  /* choix du chemin a 100 $ (sinon 10 $), puis les 4 tailles sur CE chemin */
  let best = null, raison = '';
  for (const usd of [100, 10]) {
    const m = unites(t.de, usd); if (!m) { raison = 'prix de l entree inconnu'; continue; }
    for (const { ch, pl } of plac) {
      const q = await coterChemin({ rpc, chemin: ch, montant: m, admises: ADMISES, placement: pl });
      if (q.etat === 'OK' && (!best || q.sortie > best.q.sortie)) best = { ch, pl, q };
      else if (q.etat !== 'OK' && !raison) raison = q.etat + ': ' + (q.pourquoi || '');
    }
    if (best) break;
  }
  const c = best || plac[0];
  const cells = [];
  let ref = null;
  for (const [nomT, usd] of TAILLES) {
    const m = unites(t.de, usd);
    if (!m) { cells.push('', '', '', '', '', 'prix de l entree inconnu'); continue; }
    const q = await coterChemin({ rpc, chemin: c.ch, montant: m, admises: ADMISES, placement: c.pl });
    { const e = st.etats[nomT] || (st.etats[nomT] = {}); e[q.etat] = (e[q.etat] || 0) + 1; }
    if (q.etat !== 'OK') { cells.push(String(m), '', '', '', '', q.etat + ': ' + String(q.pourquoi || '').slice(0, 220)); continue; }
    st.coteOk[nomT] += 1;
    const taux = Number(q.sortie) / Number(m);
    if (nomT === 'micro') ref = taux;
    const impact = ref ? +(1 - taux / ref).toFixed(5) : null;
    const pv = prix(t.vers).p, dv = dec(t.vers);
    const retenu = pv && dv !== null && dv !== undefined ? +((Number(q.sortie) / 10 ** dv * pv) / usd).toFixed(4) : null;
    cells.push(String(m), String(q.sortie), String(q.frais) + ' ' + sym(q.fraisDevise), impact === null ? 'inconnu (micro non cote)' : impact, retenu === null ? 'inconnu' : retenu, 'OK');
  }
  lignes.push(pad([...base, best ? 'oui' : 'graphe oui, devis KO', cands.length, c.ch.length, [...new Set(c.ch.map((s) => s.e.venue))].join('+'), decrireChemin(c.ch, symboles), c.pl.indice, sym(c.pl.devise), ...cells, best ? '' : raison]).map(csv).join(','));
});
lignes.sort();
writeFileSync(SORTIE, entete + '\n' + lignes.join('\n') + '\n');
const sansPool = [...STOCKS.values()].filter((s) => !adj.has(s.adr));
const resume = { bloc: g.bloc, fraisBps: String(FRAIS_BPS), fraisPpm: '900', lu: new Date().toISOString(), aretes: aretes.length, blocks: BLOCKS.length, blocksRelies: BLOCKS_RELIES.length, actions: STOCKS.size, actionsReliees: STOCKS_RELIES.length,
  actionsSansAucunePool: sansPool.length, sansPoolParEmetteur: sansPool.reduce((o, s) => { o[s.emetteur] = (o[s.emetteur] || 0) + 1; return o; }, {}),
  pairesImpossiblesFauteDePool: sansPool.length * (BLOCKS.length * 2 + STOCKS_RELIES.length * 2), paires: travaux.length, cotees: nCote, reessais, parCategorie: stats };
writeFileSync('/workspace/mp-data/matrice-resume.json', JSON.stringify(resume, null, 1));
console.log(JSON.stringify(resume, null, 1));
console.log('ecrit ' + SORTIE + ' (' + lignes.length + ' lignes)');
