/* mesure-liquidite-actions-20261025.mjs — CHAQUE ACTION A UNITES, COTEE SUR CHAQUE LIEU : achat de 10 USDC et revente, au MEME bloc.
 *
 * LECTURE SEULE (eth_call epingles, aucun envoi). Lieux : liquidite-actions.js (aero-old, aero-new avec le quoter patche en
 * stateOverride, uniswap-v4 sur les cles de cles-v4-actions.js). Reference : le feed Chainlink lu (reference-action.js, 10 actions) ;
 * a cote, le prix servi par /api/trending (DexScreener, la pool la plus liquide — un PRIX DE MARCHE, pas une reference).
 *
 * Usage : node mesure-liquidite-actions-20261025.mjs <stocks.json> [trending.json] > sortie ; ecrit mesures/liquidite-actions-20261025.json
 *   stocks.json = [{ adr, sym, listee }] (les actions a unites de /api/trending actionsChaine.liste). RPC = env RPC, defaut publicnode. */
import fs from 'node:fs';
import { coterVenueCL, coterVenueV4, verdictVenue, verdictServi, meilleureVenue, coterVentePool, codeQuoteurNouvelle, overrideQuoteur, phraseVente,
  ecartBpsContre, DEVIS_USDC, REGLES } from './liquidite-actions.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { decoderInitialize } from './pools-du-jeton.js';
import { lireReferenceAction } from './reference-action.js';
import { selecteur } from './keccak.js';

const RPC = process.env.RPC || 'https://base-rpc.publicnode.com';
let id = 1;
async function rpc(method, params = []) {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message || JSON.stringify(j.error)); e.rpc = true; throw e; }
      return j.result;
    } catch (e) {
      if ((e.rpc && !/rate|limit|timeout|busy/i.test(e.message)) || essai >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 500 * (essai + 1)));
    }
  }
}
const stocks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const trending = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const prixAgregateur = new Map(((trending && trending.lignes) || []).map((l) => [String(l.adr).toLowerCase(), { prixUsd: l.prixUsd, dex: l.dex, liquiditeUsd: l.liquiditeUsd }]));
const bloc = parseInt(await rpc('eth_blockNumber'), 16) - 10;
const tag = '0x' + bloc.toString(16);
const appel = (to, data) => rpc('eth_call', [{ to, data }, tag]);
const code = codeQuoteurNouvelle(await rpc('eth_getCode', [QUOTEUR_AERODROME_CL, tag]));
if (!code) throw new Error('the quoter code no longer has the measured shape: refusing to quote the newer factory');
const ov = overrideQuoteur(code);
const appelNouvelle = (to, data) => (String(to).toLowerCase() === QUOTEUR_AERODROME_CL ? rpc('eth_call', [{ to, data }, tag, ov]) : appel(to, data));
const cles = LOGS_INITIALIZE_ACTIONS.map((l) => decoderInitialize(l)).filter((p) => p && !p.erreur && p.cle).map((p) => p.cle);
const maintenantSec = Math.floor(Date.now() / 1000);

const lignes = [];
for (const s of stocks) {
  const a = String(s.adr).toLowerCase();
  let dec = 8;
  try { dec = Number(BigInt((await appel(a, selecteur('decimals()'))).slice(0, 66))); } catch (_) { /* B20 : 8, dit par l emetteur */ }
  /* une lecture ratee (NON_MESURE, ou une pool dont l etat n a pas ete lu) est relue UNE fois ; elle reste dite si elle rate encore */
  const relire = async (f) => { let r = await f(); for (let k = 0; k < 3 && (r.etat !== 'OK' || r.pools.some((p) => p.erreur)); k++) { await new Promise((ok) => setTimeout(ok, 800)); r = await f(); } return r; };
  const cOld = await relire(() => coterVenueCL({ appel, venue: 'aero-old', adr: a }));
  const cNew = await relire(() => coterVenueCL({ appel, appelDevis: appelNouvelle, venue: 'aero-new', adr: a }));
  const cV4 = await relire(() => coterVenueV4({ appel, cles, adr: a }));
  const verdicts = [verdictVenue(cOld), verdictVenue(cNew), verdictVenue(cV4)];
  const best = meilleureVenue(verdicts);
  /* la vente comparee a la MEME quantite : ce que 10 USDC achetent sur le lieu le mieux cote (passant ou non) */
  const mieuxCote = verdicts.filter((v) => typeof v.achat === 'bigint' && v.achat > 0n).sort((x, y) => (y.achat > x.achat ? 1 : -1))[0] || null;
  const Q = mieuxCote ? mieuxCote.achat : null;
  const ventes = [];
  for (const v of verdicts) {
    if (!Q || !v.pool) continue;
    const r = await coterVentePool({ appelDevis: v.venue === 'aero-new' ? appelNouvelle : appel, verdict: v, adr: a, quantite: Q });
    v.venteQ = r;
    if (r && r > 0n) ventes.push({ venue: v.venue, prixUsd: (Number(r) / 1e6) / (Number(Q) / 10 ** dec), usdc: Number(r) / 1e6 });
  }
  let refLue = null;
  try { const rr = await lireReferenceAction({ rpc: (m, p) => rpc(m, [p[0], tag]), jeton: a, maintenantSec }); refLue = rr.reference && rr.reference.etat === 'LU' ? rr.reference : null; } catch (_) {}
  /* sans Chainlink : le prix d ACHAT le plus bas parmi les lieux cotes ('best-buy', nomme tel quel) — ce que coute de racheter */
  const prixAchat = (v) => (typeof v.achat === 'bigint' && v.achat > 0n ? 10 / (Number(v.achat) / 10 ** dec) : null);
  const achats = verdicts.map(prixAchat).filter((x) => x > 0);
  const reference = refLue ? { prixUsd: refLue.prixUsd, source: 'chainlink' } : (achats.length ? { prixUsd: Math.min(...achats), source: 'best-buy' } : null);
  const pv = phraseVente({ ventes, reference });
  const ag = prixAgregateur.get(a) || null;
  const ligne = {
    sym: s.sym, adr: a, listee: !!s.listee, decimales: dec,
    venues: verdicts.map((v) => ({ ...verdictServi(v), prixAchatUsd: prixAchat(v), venteQ: v.venteQ != null ? String(v.venteQ) : null,
      prixVenteUsd: v.venteQ ? (Number(v.venteQ) / 1e6) / (Number(Q) / 10 ** dec) : null,
      ecartRefAchatBps: reference && prixAchat(v) ? ecartBpsContre(prixAchat(v), reference.prixUsd) : null })),
    meilleurAchat: best ? best.venue : null, quantiteVente: Q ? String(Q) : null,
    meilleureVente: pv.meilleure ? pv.meilleure.venue : null, prixMeilleureVenteUsd: pv.meilleure ? pv.meilleure.prixUsd : null,
    reference, referenceChainlink: refLue ? { prixUsd: refLue.prixUsd, majA: refLue.majA, fraicheur: refLue.fraicheur } : null,
    ecartVenteRefBps: pv.ecartBps, venteLoin: pv.loin, phraseVente: pv.texte, prixAgregateur: ag,
  };
  lignes.push(ligne);
  const f = (v) => v.venue + ':' + (v.passe ? 'PASS' : (v.code || '-')) + (v.achat ? ' buy$' + prixAchat(v).toFixed(2) : '') + (v.venteQ ? ' sell$' + ((Number(v.venteQ) / 1e6) / (Number(Q) / 10 ** dec)).toFixed(2) : '');
  console.log(s.sym.padEnd(7), (best ? best.venue : 'NONE').padEnd(10), verdicts.map(f).join(' | '), '| ref', reference ? reference.source + ' $' + reference.prixUsd.toFixed(2) : '-', '| sellgap', pv.ecartBps);
}
const sortie = { lu: new Date().toISOString(), bloc, rpc: RPC, regles: { ...REGLES, usdcMin: String(REGLES.usdcMin), devisUsdc: String(DEVIS_USDC) }, lignes };
fs.mkdirSync('mesures', { recursive: true });
fs.writeFileSync('mesures/liquidite-actions-20261025.json', JSON.stringify(sortie, null, 1));
const n = (f) => lignes.filter(f).length;
console.log('block', bloc, '·', lignes.length, 'stocks ·', 'best buy: aero-old', n((l) => l.meilleurAchat === 'aero-old'), 'aero-new', n((l) => l.meilleurAchat === 'aero-new'),
  'v4', n((l) => l.meilleurAchat === 'uniswap-v4'), 'none', n((l) => !l.meilleurAchat), '· sale far below ref', n((l) => l.venteLoin));
