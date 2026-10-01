/* MESURE — LA MATRICE DES ROUTES « n importe quoi -> n importe quoi », AVANT et APRES.
 *
 *   PORT_FORK=8599 node mesure-multipool-matrice.mjs [graphe.json] [sortie.csv]
 *
 * ⛔ AVANT = ce que le CODE de l app offre aujourd hui (modele lu dans app.html / echange.js /
 *   pont-de-liquidite.js / devises-dentree.js — PAS execute) :
 *     - ACHAT d un block : depuis la devise de SA pool (planEchange), ou en multi-sauts depuis
 *       ETH/USDC/devise du registre sur l ETOILE USDC (aretesMesurees : USDC<->x par pool lue,
 *       ETH<->USDC), familles uniswap-v4 et aerodrome seulement ;
 *     - VENTE d un block : vers la devise de SA pool seulement ;
 *     - action <-> action, devise <-> devise, block -> autre chose : AUCUNE route.
 * ⛔ APRES = multipool.js sur le graphe MESURE (arete = pool prouvee sur la chaine).
 *   « cote » = devis on-chain du chemin complet pour ~100 $ (prix inconnu => « inconnu »).
 *   Paires block x block : comptees par le graphe, un echantillon seulement est cote. */
import { readFileSync, writeFileSync } from 'node:fs';
import { devisesFraisAdmises, cheminsCandidats, placerFrais, coterChemin, ADRESSES, noeud, decrireChemin } from './multipool.js';
import { ACTIONS_COINBASE } from './paires.js';

const PORT = process.env.PORT_FORK || '8599';
const URL = 'http://127.0.0.1:' + PORT;
const GRAPHE = process.argv[2] || '/workspace/mp-data/graphe.json';
const SORTIE = process.argv[3] || '/workspace/canal/matrice-routes-2026-10-01.csv';
const bas = (a) => String(a || '').toLowerCase();
let id = 0;
async function rpc(method, params) {
  for (let t = 0; t < 4; t += 1) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.rpc = true; throw e; }
      return j.result;
    } catch (e) { if (e.rpc) throw e; await new Promise((z) => setTimeout(z, 500 * (t + 1))); }
  }
  throw new Error('transport');
}
const g = JSON.parse(readFileSync(GRAPHE, 'utf8'));
const aretes = g.aretes.map((e) => ({ ...e, liqUsd: Number(e.liqUsd) || 0 }));
const N = new Map(g.noeuds.map((n) => [n.adr, n]));
const ETH = ADRESSES.ETH, USDC = ADRESSES.USDC;
const ADMISES = devisesFraisAdmises(ACTIONS_COINBASE, { blocks: g.noeuds.filter((n) => n.classe === 'block').map((n) => n.adr) });
const sym = (a) => (a === ETH ? 'ETH' : (N.get(a) && N.get(a).sym) || a.slice(0, 10));
const symboles = Object.fromEntries(g.noeuds.map((n) => [n.adr, n.sym || n.adr.slice(0, 8)]));
const prixDe = (a) => { const n = N.get(a); if (!n) return null; if (a === USDC) return 1; if (a === ETH) return n.prixMesure || null; return (n.ligne && n.ligne.prixUsd) || n.prixDs || null; };
const unites = (a, usd) => { const p = prixDe(a), d = a === ETH ? 18 : N.get(a) && N.get(a).dec; if (!p || d === null || d === undefined) return null; const v = BigInt(Math.floor((usd / p) * 10 ** Math.min(d, 18))) * 10n ** BigInt(Math.max(d - 18, 0)); return v > 0n ? v : null; };

/* les « coeur » demandes : ETH (=WETH), USDC, OUSD, TOSHI, cbBTC + les 15 actions */
const COEUR = [ETH, USDC, ADRESSES.OUSD, bas('0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4'), ADRESSES.CBBTC, ...ACTIONS_COINBASE.map((s) => bas(s.adr))];
const classe = (a) => (COEUR.includes(a) ? (ADMISES.has(a) && a !== ADRESSES.OUSD ? 'action' : 'coeur') : (N.get(a) && N.get(a).classe) || '?');
const BLOCKS = g.noeuds.filter((n) => n.classe === 'block').map((n) => n.adr);

/* ── AVANT : le modele du code de l app ── */
const lieuxApp = new Set(['uniswap-v4', 'aerodrome-cl']); /* familles uniswap-v4 / aerodrome ; v3 exclu */
const etoile = new Set(); /* noeuds relies a USDC par une pool v4/aero mesuree (aretesMesurees) */
for (const e of aretes) {
  if (!lieuxApp.has(e.venue)) continue;
  const [x, y] = e.venue === 'uniswap-v4' ? [noeud(e.cle.currency0), noeud(e.cle.currency1)] : [noeud(e.token0), noeud(e.token1)];
  if (x === USDC) etoile.add(y); if (y === USDC) etoile.add(x);
}
const DEVISES_APP = new Set([ETH, USDC, ADRESSES.OUSD, ADRESSES.CBBTC, bas('0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4'), ...ACTIONS_COINBASE.map((s) => bas(s.adr))]);
function avant(de, vers) {
  const nv = N.get(vers), nd = N.get(de);
  if (nv && nv.classe === 'block') {
    const q = nv.ligne && noeud(nv.ligne.quoteAdr);
    if (q && q === de) return 'oui (pool propre)';
    if (DEVISES_APP.has(de) && q && (q === USDC || etoile.has(q)) && (de === USDC || de === ETH || etoile.has(de))) return 'oui (etoile USDC, achat)';
    return 'non';
  }
  if (nd && nd.classe === 'block') {
    const q = nd.ligne && noeud(nd.ligne.quoteAdr);
    return q && q === vers ? 'oui (vente pool propre)' : 'non (pas de vente multi-sauts)';
  }
  return 'non (pas de swap hors block)';
}

const lignes = [['de', 'de_classe', 'vers', 'vers_classe', 'avant_app', 'apres_existe', 'chemins_candidats', 'sauts', 'venues', 'frais_noeud', 'frais_devise', 'frais_refuse', 'cote_100usd', 'entree_unites', 'sortie_unites', 'sortie_usd', 'retenu', 'signatures', 'chemin', 'note'].join(',')];
const csv = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const stats = { paires: 0, avantOui: 0, apresExiste: 0, apresCote: 0, refusFrais: 0, inconnu: 0, sansRoute: 0, parCategorie: {} };
async function ligne(de, vers, coter, cat, sautsMax = 3) {
  stats.paires += 1;
  const c = stats.parCategorie[cat] || (stats.parCategorie[cat] = { paires: 0, avant: 0, existe: 0, cote: 0, refusFrais: 0, inconnu: 0 });
  c.paires += 1;
  const av = avant(de, vers);
  if (av.startsWith('oui')) { stats.avantOui += 1; c.avant += 1; }
  const cands = cheminsCandidats(aretes, de, vers, { sautsMax, max: coter ? 8 : 1 });
  let r = { existe: cands.length ? 'oui' : 'non', n: cands.length };
  if (!cands.length) { stats.sansRoute += 1; lignes.push([sym(de), classe(de), sym(vers), classe(vers), av, 'non', 0, '', '', '', '', '', '', '', '', '', '', '', '', 'aucun chemin de ' + sautsMax + ' sauts ou moins'].map(csv).join(',')); return; }
  stats.apresExiste += 1; c.existe += 1;
  /* le frais : sur le meilleur chemin cote, sinon le premier placable */
  let best = null, note = '', placable = cands.map((ch) => ({ ch, pl: placerFrais(ch, ADMISES) })).filter((x) => x.pl.etat === 'OK');
  if (!placable.length) {
    stats.refusFrais += 1; c.refusFrais += 1;
    lignes.push([sym(de), classe(de), sym(vers), classe(vers), av, 'graphe oui / REFUSE frais', cands.length, cands[0].length, '', '', '', 'oui : aucun noeud ETH/USDC/action/OUSD', '', '', '', '', '', '', decrireChemin(cands[0], symboles), 'le frais serait en block : refuse'].map(csv).join(','));
    return;
  }
  if (coter) {
    const m = unites(de, 100);
    if (!m) note = 'prix de l entree inconnu : non cote';
    else {
      for (const { ch, pl } of placable) {
        const q = await coterChemin({ rpc, chemin: ch, montant: m, admises: ADMISES, placement: pl });
        if (q.etat === 'OK' && (!best || q.sortie > best.q.sortie)) best = { ch, pl, q, m };
        else if (q.etat !== 'OK' && !note) note = q.etat + ' ' + (q.pourquoi || '');
      }
    }
  }
  const pick = best ? best.ch : placable[0].ch, pl = best ? best.pl : placable[0].pl;
  const venues = [...new Set(pick.map((s) => s.e.venue))].join('+');
  let sortieUsd = null, retenu = null;
  if (best) {
    stats.apresCote += 1; c.cote += 1;
    const pv = prixDe(vers), dv = vers === ETH ? 18 : N.get(vers) && N.get(vers).dec;
    if (pv && dv !== null && dv !== undefined) { sortieUsd = Number(best.q.sortie) / 10 ** dv * pv; retenu = +(sortieUsd / 100).toFixed(4); }
  } else if (coter) { stats.inconnu += 1; c.inconnu += 1; }
  const signatures = de === ETH ? 1 : 2;
  lignes.push([sym(de), classe(de), sym(vers), classe(vers), av, 'oui', cands.length, pick.length, venues, pl.indice, sym(pl.devise), 'non',
    best ? 'oui' : (coter ? 'inconnu' : 'non demande'), best ? String(best.m) : '', best ? String(best.q.sortie) : '', sortieUsd === null ? (best ? 'inconnu' : '') : sortieUsd.toFixed(2), retenu === null ? (best ? 'inconnu' : '') : retenu,
    signatures, decrireChemin(pick, symboles), note.slice(0, 160)].map(csv).join(','));
}

console.log('=== MATRICE — graphe bloc ' + g.bloc + ' · ' + aretes.length + ' aretes · ' + g.noeuds.length + ' noeuds · blocks ' + BLOCKS.length + ' ===');
/* 1. coeur x coeur, cote */
for (const a of COEUR) for (const b of COEUR) if (a !== b) await ligne(a, b, true, 'coeur x coeur');
console.log('coeur x coeur fait');
/* 2. block x coeur et coeur x block : tout par le graphe ; cote vers/depuis ETH et USDC et l action appariee */
for (const b of BLOCKS) {
  const nb = N.get(b); const q = nb.ligne && noeud(nb.ligne.quoteAdr);
  for (const c of COEUR) {
    const coter = c === ETH || c === USDC || c === q;
    await ligne(c, b, coter, 'coeur -> block');
    await ligne(b, c, coter, 'block -> coeur');
  }
}
console.log('block x coeur fait');
/* 3. block x block : graphe pour tout, echantillon cote (les 12 blocks les plus liquides) */
const top = BLOCKS.filter((b) => N.get(b).ligne).sort((x, y) => (N.get(y).ligne.liquiditeUsd || 0) - (N.get(x).ligne.liquiditeUsd || 0)).slice(0, 12);
let bb = 0, bbExiste = 0, bbRefus = 0;
for (const a of BLOCKS) for (const b of BLOCKS) {
  if (a === b) continue;
  if (top.includes(a) && top.includes(b)) { await ligne(a, b, true, 'block x block (echantillon cote)', 4); continue; }
  bb += 1;
  const cands = cheminsCandidats(aretes, a, b, { sautsMax: 4, max: 3 });
  if (cands.length) { bbExiste += 1; if (!cands.some((ch) => placerFrais(ch, ADMISES).etat === 'OK')) bbRefus += 1; }
}
writeFileSync(SORTIE, lignes.join('\n') + '\n');
const resume = { bloc: g.bloc, aretes: aretes.length, noeuds: g.noeuds.length, blocks: BLOCKS.length, coeur: COEUR.length, ...stats,
  blockXblockGrapheSeul: { paires: bb, existe: bbExiste, refusFrais: bbRefus } };
writeFileSync('/workspace/mp-data/matrice-resume.json', JSON.stringify(resume, null, 1));
console.log(JSON.stringify(resume, null, 1));
console.log('ecrit ' + SORTIE + ' (' + (lignes.length - 1) + ' lignes)');
