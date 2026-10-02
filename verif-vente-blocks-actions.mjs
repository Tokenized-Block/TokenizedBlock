/* VERIFICATION — « les blocks apparies a une action ne se revendent pas contre leur action »
 *
 *   PORT_FORK=8600 node verif-vente-blocks-actions.mjs [/workspace/mp-data/graphe.json]
 *
 * ⛔ SOURCE DU CHIFFRE : des DEVIS du V4Quoter (0x0d5e0f971ed27fbff6c2837bf31316121532048d,
 *   quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))), PAS des soldes.
 *   Un revert UnexpectedRevertBytes(0x6190b2b0) qui enveloppe NotEnoughLiquidity(bytes32) (0x7a5ed734)
 *   est classe SANS_LIQUIDITE par `nommerRevert` (multipool.js). Ce script refait EXACTEMENT ces appels :
 *   - pour chaque arete V4 du graphe qui relie un block (par ADRESSE, pas par symbole : 3 tokens
 *     differents s appellent « SI », 2 « BLUEPILL ») a une action ;
 *   - aux montants de la matrice : 0,01 $ / 10 $ / 100 $ / 1 000 $ au prix « ask » on-chain du block
 *     (achat de 1 $ depuis USDC puis ETH par le meilleur chemin, meme code que la matrice) ;
 *   - dans les deux sens (vente block -> action, achat action -> block au micro) ;
 *   - et lit, en COMPLEMENT seulement, StateView.getLiquidity / getSlot0 (liquidite active, tick).
 * Ecrit /workspace/canal/verif-vente-blocks-actions-2026-10-02.csv et /workspace/mp-data/verif-vente.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { ADRESSES, noeud, cheminsCandidats, placerFrais, coterChemin, devisesFraisAdmises, nommerRevert, decrireChemin } from './multipool.js';
import { encodeQuote, selecteur } from './pool.js';

const URL = 'http://127.0.0.1:' + (process.env.PORT_FORK || '8600');
const g = JSON.parse(readFileSync(process.argv[2] || '/workspace/mp-data/graphe.json', 'utf8'));
const ap = JSON.parse(readFileSync('/workspace/mp-data/actions-pools.json', 'utf8'));
let id = 0;
async function rpc(method, params) {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message + (j.error.data ? ' DATA ' + (typeof j.error.data === 'string' ? j.error.data : JSON.stringify(j.error.data)) : '')); e.rpc = true; e.data = j.error.data; throw e; }
  return j.result;
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
const fi = await rpc('anvil_nodeInfo', []);
if (bloc !== Number(fi.forkConfig.forkBlockNumber) || bloc !== g.bloc) { console.log('KO : fork non vierge ou bloc different du graphe (' + bloc + ' / ' + g.bloc + ') — NON MESURE'); process.exit(1); }
const { ETH, USDC } = ADRESSES;
const N = new Map(g.noeuds.map((n) => [n.adr, n]));
const STOCKS = new Map(ap.actions.map((x) => [x.adr, x]));
for (const [a, s] of STOCKS) if (!N.has(a)) N.set(a, { adr: a, sym: s.symbole || s.ticker, classe: 'action', dec: s.dec });
const BLOCKS = g.noeuds.filter((n) => n.classe === 'block').map((n) => n.adr);
const ADMISES = devisesFraisAdmises([...STOCKS.keys()], { blocks: BLOCKS });
const aretes = g.aretes.map((e) => ({ ...e, liqUsd: Number(e.liqUsd) || 0 }));
for (const p of ap.pools) if (p.arete && !aretes.some((e) => e.id === p.id)) aretes.push({ ...p.arete, liqUsd: p.tvlUsd || 0 });
const symboles = Object.fromEntries([...N.values()].map((n) => [n.adr, n.sym]));
const estBlock = (a) => N.get(a) && N.get(a).classe === 'block';
const prixEth = ap.prix[ETH];
const unitesEth1 = BigInt(Math.floor((1 / prixEth) * 1e15)) * 1000n;
/* prix « ask » du block : meme methode que mesure-multipool-matrice.mjs */
async function prixBlock(b, d) {
  let best = null;
  for (const [h, m] of [[USDC, 1000000n], [ETH, unitesEth1]]) {
    for (const ch of cheminsCandidats(aretes, h, b, { sautsMax: 3, max: 6 })) {
      const pl = placerFrais(ch, ADMISES); if (pl.etat !== 'OK') continue;
      const q = await coterChemin({ rpc, chemin: ch, montant: m, admises: ADMISES, placement: pl });
      if (q.etat === 'OK' && q.sortie > 0n) { const p = 1 / (Number(q.sortie) / 10 ** d); if (best === null || p < best) best = p; }
    }
  }
  return best;
}
const unites = (usd, p, d) => { const v = BigInt(Math.floor((usd / p) * 10 ** Math.min(d, 15))) * 10n ** BigInt(Math.max(d - 15, 0)); return v > 0n ? v : null; };
const sLiq = selecteur('getLiquidity(bytes32)'), sSlot = selecteur('getSlot0(bytes32)');
const lignes = [];
const paires = [];
for (const e of aretes) {
  if (e.venue !== 'uniswap-v4') continue;
  const [x, y] = [noeud(e.cle.currency0), noeud(e.cle.currency1)];
  const [b, s] = estBlock(x) && STOCKS.has(y) ? [x, y] : estBlock(y) && STOCKS.has(x) ? [y, x] : [null, null];
  if (b) paires.push({ b, s, e });
}
console.log('=== VERIF VENTE BLOCK -> ACTION — fork ' + URL + ' bloc ' + bloc + ' · ' + paires.length + ' pools V4 block/action ===');
for (const { b, s, e } of paires) {
  const nb = N.get(b), d = nb.dec ?? 18;
  const pOn = await prixBlock(b, d);
  /* meme repli que la matrice quand aucun achat on-chain ne cote : prix AGREGE (/api/trending puis DexScreener) */
  const p = pOn || (nb.ligne && nb.ligne.prixUsd) || nb.prixDs || null;
  const srcPrix = pOn ? 'devis on-chain (achat 1 $)' : nb.ligne && nb.ligne.prixUsd ? '/api/trending (agrege)' : nb.prixDs ? 'dexscreener (agrege)' : 'inconnu';
  const liq = BigInt(await rpc('eth_call', [{ to: ADRESSES.STATE_VIEW, data: '0x' + sLiq + e.id.slice(2) }, 'latest']));
  const slot = await rpc('eth_call', [{ to: ADRESSES.STATE_VIEW, data: '0x' + sSlot + e.id.slice(2) }, 'latest']);
  const tick = (() => { const v = BigInt('0x' + slot.slice(66, 130)); return v >= 1n << 255n ? v - (1n << 256n) : v; })();
  const o = { block: nb.sym, blockAdr: b, action: N.get(s).sym, actionAdr: s, poolId: e.id, cle: e.cle, liquiditeActive: String(liq), tick: String(tick), prixAskUsd: p, srcPrix, ventes: {}, achatMicro: null };
  const zeroForOneVente = noeud(e.cle.currency0) === b;
  for (const [t, usd] of [['micro', 0.01], ['10$', 10], ['100$', 100], ['1k$', 1000]]) {
    const m = p ? unites(usd, p, d) : null;
    if (!m) { o.ventes[t] = { montant: null, etat: 'prix inconnu' }; continue; }
    try {
      const r = await rpc('eth_call', [{ to: ADRESSES.QUOTEUR_V4, data: encodeQuote({ cle: e.cle, zeroForOne: zeroForOneVente, montant: m }) }, 'latest']);
      o.ventes[t] = { montant: String(m), etat: 'OK', sortie: String(BigInt('0x' + r.slice(2, 66))) };
    } catch (err) {
      const n = nommerRevert(err);
      const brut = typeof err.data === 'string' ? err.data : (String(err.message).match(/0x6190b2b0[0-9a-f]*/i) || [''])[0];
      o.ventes[t] = { montant: String(m), etat: n.liquidite ? 'SANS_LIQUIDITE' : 'REVERT', erreur: n.texte, selecteurInterne: n.selecteur, revertBrut: brut };
    }
  }
  /* achat au micro (action -> block) : montre que la pool vit dans l AUTRE sens */
  const ps = STOCKS.get(s).meilleures && STOCKS.get(s).meilleures.USDC ? STOCKS.get(s).meilleures.USDC.prix : null;
  const ms = ps ? unites(0.01, ps, STOCKS.get(s).dec) : null;
  if (ms) {
    try { const r = await rpc('eth_call', [{ to: ADRESSES.QUOTEUR_V4, data: encodeQuote({ cle: e.cle, zeroForOne: !zeroForOneVente, montant: ms }) }, 'latest']); o.achatMicro = { montant: String(ms), etat: 'OK', sortie: String(BigInt('0x' + r.slice(2, 66))) }; }
    catch (err) { const n = nommerRevert(err); o.achatMicro = { montant: String(ms), etat: n.liquidite ? 'SANS_LIQUIDITE' : 'REVERT', erreur: n.texte }; }
  }
  lignes.push(o);
  console.log(o.block.padEnd(11) + b + ' -> ' + o.action.padEnd(7) + ' pool ' + e.id.slice(0, 18) + '… fee ' + e.cle.fee + ' hook ' + e.cle.hooks.slice(0, 10) + ' · liq ' + o.liquiditeActive + ' tick ' + o.tick
    + ' · vente ' + ['micro', '10$', '100$', '1k$'].map((t) => t + ' ' + o.ventes[t].etat).join(', ') + ' · achat micro ' + (o.achatMicro ? o.achatMicro.etat : 'n/a'));
}
const esc = (v) => { const x = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
const ent = ['block', 'block_adresse', 'action', 'action_adresse', 'pool_id', 'currency0', 'currency1', 'fee', 'tickSpacing', 'hooks', 'liquidite_active', 'tick', 'prix_usd_dimensionnement', 'source_prix',
  ...['micro', '10$', '100$', '1k$'].flatMap((t) => ['vente_' + t + '_montant', 'vente_' + t + '_etat', 'vente_' + t + '_erreur']), 'revert_brut_premier_echec', 'achat_micro_etat'];
const rows = lignes.map((o) => { const premier = Object.values(o.ventes).find((v) => v.revertBrut); return [o.block, o.blockAdr, o.action, o.actionAdr, o.poolId, o.cle.currency0, o.cle.currency1, o.cle.fee, o.cle.tickSpacing, o.cle.hooks, o.liquiditeActive, o.tick, o.prixAskUsd, o.srcPrix,
  ...['micro', '10$', '100$', '1k$'].flatMap((t) => [o.ventes[t].montant, o.ventes[t].etat, o.ventes[t].erreur || '']), premier ? premier.revertBrut : '', o.achatMicro ? o.achatMicro.etat : ''].map(esc).join(','); });
writeFileSync('/workspace/canal/verif-vente-blocks-actions-2026-10-02.csv', ent.join(',') + '\n' + rows.join('\n') + '\n');
writeFileSync('/workspace/mp-data/verif-vente.json', JSON.stringify({ bloc, lu: new Date().toISOString(), quoter: ADRESSES.QUOTEUR_V4, lignes }, null, 1));
const tokens = new Set(lignes.map((o) => o.blockAdr));
const parTaille = Object.fromEntries(['micro', '10$', '100$', '1k$'].map((t) => [t, lignes.filter((o) => o.ventes[t].etat === 'SANS_LIQUIDITE').length]));
console.log('pools ' + lignes.length + ' · tokens block distincts ' + tokens.size + ' · symboles distincts ' + new Set(lignes.map((o) => o.block)).size + ' · ventes SANS_LIQUIDITE par taille ' + JSON.stringify(parTaille));
