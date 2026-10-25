/* mesure-liquidite-actions-20261025.mjs — CHAQUE ACTION A UNITES, COTEE SUR CHAQUE LIEU : achat de 10 USDC et revente, au MEME bloc.
 *
 * LECTURE SEULE (eth_call epingles, aucun envoi). Lieux : liquidite-actions.js (aero-old, aero-new avec le quoter patche en
 * stateOverride, uniswap-v4 sur les cles de cles-v4-actions.js). Reference : le feed Chainlink lu (reference-action.js, 10 actions) ;
 * a cote, le prix servi par /api/trending (DexScreener, la pool la plus liquide — un PRIX DE MARCHE, pas une reference).
 *
 * ⛔⛔ 2026-10-25 (revue de 3d81e06, defaut 4) — LES COMPTES SONT CEUX DE LA DECISION DU SERVEUR, pas d une decision propre a la mesure :
 *   - notre route : routeAction (actions-chaine.js), SA regle, comme serveur-web.js ;
 *   - 'aero-new' : venuesServies (registre estDeviseConnue -> HORS_REGISTRE, puis « strictement meilleur » de choisirVenue) — la MEME
 *     fonction que le serveur. L ancienne mesure comptait BUDc « achetable » (le serveur le refuse HORS_REGISTRE) ;
 *   - la vente : choisirVenteVenue (le planificateur, rails-api.js preparerVente), au montant que 10 USDC achetent sur le lieu retenu ;
 *   - la reference de repli : referenceRepli, SEULEMENT des lieux qui passent (HTZc : 3 831 417 $ tires d une pool qui refusait).
 *   Les verdicts des trois lieux sous les regles de liquidite-actions.js restent ecrits (`regles`), A TITRE D INFORMATION.
 *
 * Usage : node mesure-liquidite-actions-20261025.mjs <stocks.json> [trending.json] ; ecrit SORTIE (defaut mesures/liquidite-actions-20261025.json)
 *   stocks.json = [{ adr, sym, listee }] (les actions a unites de /api/trending actionsChaine.liste). RPC = env RPC, defaut publicnode.
 *   BLOC = env BLOC (un bloc epingle, pour remesurer au MEME etat) ; defaut la tete - 10. */
import fs from 'node:fs';
import { coterVenueCL, coterVenueV4, verdictVenue, verdictServi, venuesServies, coterVentePool, codeQuoteurNouvelle, overrideQuoteur, phraseVente,
  choisirVenteVenue, lieuxVente, referenceRepli, ecartBpsContre, seuilUtilisable, DEVIS_USDC, REGLES } from './liquidite-actions.js';
import { routeAction, routeServie } from './actions-chaine.js';
import { estDeviseConnue } from './pool-sans-hook.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
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
const bloc = process.env.BLOC ? Number(process.env.BLOC) : parseInt(await rpc('eth_blockNumber'), 16) - 10;
if (!Number.isSafeInteger(bloc) || bloc <= 0) throw new Error('BLOC must be a block number');
const tag = '0x' + bloc.toString(16);
const appel = (to, data) => rpc('eth_call', [{ to, data }, tag]);
const code = codeQuoteurNouvelle(await rpc('eth_getCode', [QUOTEUR_AERODROME_CL, tag]));
if (!code) throw new Error('the quoter code no longer has the measured shape: refusing to quote the newer factory');
const ov = overrideQuoteur(code);
const appelNouvelle = (to, data) => (String(to).toLowerCase() === QUOTEUR_AERODROME_CL ? rpc('eth_call', [{ to, data }, tag, ov]) : appel(to, data));
const cles = LOGS_INITIALIZE_ACTIONS.map((l) => decoderInitialize(l)).filter((p) => p && !p.erreur && p.cle).map((p) => p.cle);
const maintenantSec = Math.floor(Date.now() / 1000);
const S = (x) => (typeof x === 'bigint' ? String(x) : x ?? null);

const lignes = [];
for (const s of stocks) {
  const a = String(s.adr).toLowerCase();
  let dec = 8;
  try { dec = Number(BigInt((await appel(a, selecteur('decimals()'))).slice(0, 66))); } catch (_) { /* B20 : 8, dit par l emetteur */ }
  /* une lecture ratee (NON_MESURE, ou une pool dont l etat n a pas ete lu) est relue ; elle reste dite si elle rate encore */
  const relire = async (f) => { let r = await f(); for (let k = 0; k < 3 && (r.etat !== 'OK' || (r.pools || []).some((p) => p.erreur)); k++) { await new Promise((ok) => setTimeout(ok, 800)); r = await f(); } return r; };
  /* LA DECISION DU SERVEUR : notre route (routeAction, sa regle), puis venuesServies (registre + strictement meilleur) */
  const rOld = await relire(() => routeAction({ appel, adr: a, bloc }));
  const servie = rOld.etat === 'OK' ? routeServie(rOld) : null;
  const cNew = await relire(() => coterVenueCL({ appel, appelDevis: appelNouvelle, venue: 'aero-new', adr: a }));
  const decision = servie ? venuesServies({ route: servie, coteNeuve: cNew, admise: estDeviseConnue(a) }) : null;
  const route = servie ? { ...servie, ...(decision || {}) } : null;
  const meilleure = route ? (route.meilleure ?? (route.achetable ? 'aero-old' : null)) : null;
  /* A TITRE D INFORMATION : les trois lieux sous les regles de liquidite-actions.js (profondeur = USDC utilisable) */
  const cOld = await relire(() => coterVenueCL({ appel, venue: 'aero-old', adr: a }));
  const cV4 = await relire(() => coterVenueV4({ appel, cles, adr: a }));
  const verdicts = [verdictVenue(cOld), verdictVenue(cNew), verdictVenue(cV4)];
  /* LA VENTE : la quantite que 10 USDC achetent sur le lieu RETENU par le serveur (sinon, le mieux cote, passant ou non) ; chaque lieu est
   *   cote a cette quantite, puis le lieu EMPRUNTE est celui du planificateur (choisirVenteVenue) */
  const existante = POOLS_ACTIONS_AERODROME.has(a) ? 'aero-old' : 'uniswap-v4';
  const retenu = meilleure === 'aero-new' ? verdicts[1] : meilleure === 'aero-old' ? { ...verdicts[0], achat: route && route.achat ? BigInt(route.achat) : verdicts[0].achat } : null;
  const mieuxCote = verdicts.filter((v) => typeof v.achat === 'bigint' && v.achat > 0n).sort((x, y) => (y.achat > x.achat ? 1 : -1))[0] || null;
  const Q = retenu && typeof retenu.achat === 'bigint' && retenu.achat > 0n ? retenu.achat : (mieuxCote ? mieuxCote.achat : null);
  const t = POOLS_ACTIONS_AERODROME.get(a);
  const lieuxVente = [
    { venue: 'aero-old', pool: 'table-or-route', tickSpacing: t ? t.tickSpacing : (servie && servie.tickSpacing != null ? servie.tickSpacing : verdicts[0].tickSpacing) },
    verdicts[1], verdicts[2]];
  const ventes = [];
  for (const v of lieuxVente) {
    if (!Q || !v || !v.pool || (v.venue !== 'uniswap-v4' && !Number.isInteger(Number(v.tickSpacing)))) continue;
    const r = await coterVentePool({ appelDevis: v.venue === 'aero-new' ? appelNouvelle : appel, verdict: v, adr: a, quantite: Q });
    if (r && r > 0n) ventes.push({ venue: v.venue, usdc: String(r), prixUsd: (Number(r) / 1e6) / (Number(Q) / 10 ** dec) });
  }
  let choix = route ? choisirVenteVenue({ route, ventes, existante }) : { venue: existante, raison: 'ROUTE_NON_LUE' };
  /* la vente d avant hors table passe par la pool v4 de l action : sans pool v4, le planificateur REFUSE — aucun lieu emprunte, rien a dire */
  if (choix.venue === 'uniswap-v4' && verdicts[2].code === 'SANS_POOL') choix = { venue: null, raison: 'SANS_ROUTE_DE_VENTE' };
  const { passants, sansChemin } = lieuxVente({ route, existante });
  let refLue = null;
  try { const rr = await lireReferenceAction({ rpc: (m, p) => rpc(m, [p[0], tag]), jeton: a, maintenantSec }); refLue = rr.reference && rr.reference.etat === 'LU' ? rr.reference : null; } catch (_) {}
  const reference = refLue ? { prixUsd: refLue.prixUsd, source: 'chainlink' } : (route ? referenceRepli({ route, decimales: dec }) : null);
  const pv = choix.venue ? phraseVente({ ventes, reference, ici: choix.venue, passants, sansChemin })
    : { ici: null, meilleure: null, ecartBps: null, loin: false, texte: null };
  const prixAchat = (v) => (typeof v.achat === 'bigint' && v.achat > 0n ? 10 / (Number(v.achat) / 10 ** dec) : null);
  const ag = prixAgregateur.get(a) || null;
  const ligne = {
    sym: s.sym, adr: a, listee: !!s.listee, decimales: dec, enTable: !!t, admise: estDeviseConnue(a),
    serveur: { notreRoute: servie ? { achetable: servie.achetable, code: servie.code ?? null, usdcPool: servie.usdcPool ?? null, achat: servie.achat ?? null } : { etat: rOld.etat, pourquoi: rOld.pourquoi || null },
      aeroNew: decision ? decision.venues['aero-new'] : null, meilleure },
    regles: verdicts.map((v) => ({ ...verdictServi(v), prixAchatUsd: prixAchat(v),
      ecartRefAchatBps: reference && prixAchat(v) ? ecartBpsContre(prixAchat(v), reference.prixUsd) : null })),
    quantiteVente: Q ? String(Q) : null, ventes,
    vente: { ici: choix.venue, raison: choix.raison, passants, sansChemin, prixIciUsd: pv.ici ? pv.ici.prixUsd : null, mieuxCote: pv.meilleure ? pv.meilleure.venue : null,
      prixMieuxCoteUsd: pv.meilleure ? pv.meilleure.prixUsd : null, ecartRefBps: pv.ecartBps, loin: pv.loin, texte: pv.texte },
    reference, referenceChainlink: refLue ? { prixUsd: refLue.prixUsd, majA: refLue.majA, fraicheur: refLue.fraicheur } : null, prixAgregateur: ag,
  };
  lignes.push(ligne);
  const f = (v) => v.venue + ':' + (v.passe ? 'PASS' : (v.code || '-')) + (v.usdcUtilisable != null ? ' use$' + Math.round(Number(v.usdcUtilisable) / 1e6) : '') + (v.usdcPool != null ? ' bal$' + Math.round(Number(v.usdcPool) / 1e6) : '');
  console.log(s.sym.padEnd(7), 'server:', String(meilleure || 'NONE').padEnd(9), 'old', servie ? (servie.achetable ? 'PASS' : servie.code) : rOld.etat, '| new', decision ? (decision.venues['aero-new'].passe ? 'PASS' : decision.venues['aero-new'].code) : cNew.etat,
    '| rules:', verdicts.map(f).join(' | '), '| sell via', choix.venue, pv.ici ? '$' + pv.ici.prixUsd.toFixed(2) : '-', '| ref', reference ? reference.source + ' $' + reference.prixUsd.toFixed(2) : '-', '| gap', pv.ecartBps);
}
const sortie = { lu: new Date().toISOString(), bloc, rpc: RPC,
  regles: { ...REGLES, usdcMin: String(REGLES.usdcMin), seuilUtilisable: String(seuilUtilisable()), devisUsdc: String(DEVIS_USDC) },
  decision: 'serveur : routeAction (notre route) + venuesServies (aero-new : registre + strictement meilleur) ; vente : choisirVenteVenue ; repli : referenceRepli (lieux qui passent)',
  lignes };
const chemin = process.env.SORTIE || 'mesures/liquidite-actions-20261025.json';
fs.mkdirSync('mesures', { recursive: true });
fs.writeFileSync(chemin, JSON.stringify(sortie, null, 1));
const n = (f) => lignes.filter(f).length;
console.log('block', bloc, '·', lignes.length, 'stocks · SERVER best buy: aero-old', n((l) => l.serveur.meilleure === 'aero-old'), 'aero-new', n((l) => l.serveur.meilleure === 'aero-new'),
  'none', n((l) => !l.serveur.meilleure), '· aero-new newly buyable (our route refuses)', n((l) => l.serveur.meilleure === 'aero-new' && l.serveur.notreRoute.achetable !== true),
  '· aero-new HORS_REGISTRE', n((l) => l.serveur.aeroNew && l.serveur.aeroNew.code === 'HORS_REGISTRE'),
  '· sale via aero-new', n((l) => l.vente.ici === 'aero-new'), 'aero-old', n((l) => l.vente.ici === 'aero-old'), 'v4', n((l) => l.vente.ici === 'uniswap-v4'), 'no sale route', n((l) => !l.vente.ici),
  '· sale far below ref', n((l) => l.vente.loin), '· no reference', n((l) => !l.reference), '→', chemin);
