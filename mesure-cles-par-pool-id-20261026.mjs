/* mesure-cles-par-pool-id-20261026.mjs — SUR LES LIGNES DE /api/trending DE PROD : combien de blocks ont une cle LUE par leur poolId
 * (cle-par-pool-id.js), et combien sont achetables par le verdict du Buy de Market (achat-marche.js, vrai Quoter v4 de mainnet,
 * sources TB servies par prod). Lecture seule : DexScreener (paires brutes, lots de 30), un noeud public (blocs, getLogs, eth_call),
 * prod (deux lectures, en-tete x-ms-monitor). Rien n est signe ni envoye.
 * Usage : node mesure-cles-par-pool-id-20261026.mjs <trending.json de prod> [sortie.json]
 * ⛔ CE QUE DISENT LES FICHIERS COMMITES (revue 2026-10-26, finding 5 : le rapport du commit 6d1e86a melangeait les deux sources) :
 *   - mesures/trending-prod-20261025-game46.json : la reponse de PROD (achatMarche, le Buy du serveur de prod) : 194 lignes, 153 sans
 *     cle, 0 achetable, sourcesTbLues true.
 *   - mesures/cles-par-pool-id-trending-20261026.json : la sortie de CE script sur ces 194 lignes (compte) : 151 avec un indice, 151
 *     avec une cle lue, 12 achetables, 139 refusees. Ce « 12 » est le verdict du Buy (achat-marche.js) calcule ICI, sur les SEULES
 *     cles lues par l indice, avec les sources TB de prod lues (sourcesTbLues true) — ce n est PAS le compte d un serveur.
 *   - mesures/trending-local-avant-20261026.json / -apres-20261026.json : la reponse du serveur LOCAL avant / apres le changement
 *     (achatMarche, son propre Buy), sources TB NON lues (sourcesTbLues false) : avant 167 lignes, 155 sans cle, 0 achetable ; apres
 *     189 lignes, 141 sans cle, 1 achetable, apres UNE recherche de fond (clesParPoolId : 40 essayees, 35 lues, 5 non lues, 28 sans
 *     indice, 112 reportees).
 *   ⚠️ indicesPoolIdDepuisPaires ne retient plus, depuis le 2026-10-26, que les paires que DexScreener dit Uniswap v4 (dexId / labels) :
 *     ce script relance aujourd hui ne compterait pas une paire de 66 caracteres sans ces marques (le fichier ci-dessus a ete produit
 *     avant ; mesures/dexscreener-paires-v4-labels-20261026.json : 159 sur 159 portaient ces marques). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const C = await imp('cle-par-pool-id.js');
const A = await imp('achat-marche.js');
const I = await imp('index-routeur.js');
const PSH = await imp('pool-sans-hook.js');
const NOEUD = process.env.NOEUD || 'https://base-rpc.publicnode.com';
const PAUSE_MS = 150;
let appels = 0;
const dormir = (ms) => new Promise((o) => setTimeout(o, ms));
const rpc = async (method, params) => {
  for (let essai = 0; essai < 3; essai += 1) {
    appels += 1; await dormir(PAUSE_MS);
    const r = await fetch(NOEUD, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: appels, method, params }), signal: AbortSignal.timeout(20000) }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (!r.error) return r.result;
    if (!/rate|limit|timeout|abort/i.test(String(r.error.message)) || essai === 2) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
    await dormir(2000 * (essai + 1));
  }
};
const tr = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lignes = tr.lignes || [];
const adrs = lignes.map((l) => String(l.adr).toLowerCase());
const paires = [];
for (let i = 0; i < adrs.length; i += 30) {
  const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adrs.slice(i, i + 30).join(','), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch(() => null);
  if (Array.isArray(r)) paires.push(...r);
  await dormir(400);
}
const indices = C.indicesPoolIdDepuisPaires(paires, adrs);
const lp = async (c) => { try { return await fetch('https://tokenizedblock.space' + c, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(60000) }).then((x) => x.json()); } catch (e) { return null; } };
I.chargerIndexRouteur(await lp('/api/blocks-routeur')); I.chargerNosBlocksTb(await lp('/api/nos-blocks'));
const quoter = A.quoterV4({ rpc, chaine: 8453 });
const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const out = [];
const compte = { lignes: lignes.length, avecIndice: 0, sansIndice: 0, cleLue: 0, absente: 0, horsJeton: 0, nonLue: 0, achetables: 0, refusees: 0, nonMesurees: 0, raisons: {} };
for (const l of lignes) {
  const a = String(l.adr).toLowerCase();
  const ind = indices.get(a) || [];
  const e = { adr: a, sym: l.sym, dex: l.dex, quote: l.quoteSym, indices: ind.length, etats: [], cles: [], achat: null };
  if (!ind.length) { compte.sansIndice += 1; out.push(e); continue; }
  compte.avecIndice += 1;
  for (const x of ind) {
    const r = await C.clePoolParId({ rpc, poolId: x.poolId, jeton: a, creeLeMs: x.creeLeMs, tete });
    e.etats.push({ poolId: x.poolId, etat: r.etat, pourquoi: r.pourquoi || null });
    if (r.etat === 'LUE') e.cles.push(r.cle);
  }
  if (e.cles.length) compte.cleLue += 1;
  else if (e.etats.some((x) => x.etat === 'NON_LUE')) compte.nonLue += 1;
  else if (e.etats.every((x) => x.etat === 'HORS_JETON')) compte.horsJeton += 1;
  else compte.absente += 1;
  if (e.cles.length) {
    try {
      const v = await A.verdictAchatMarche({ jeton: a, cles: e.cles, quoter });
      const lectureRatee = !v.achetable && v.essayees > 0 && v.nonCotees.some((y) => !/revert|quoted zero/i.test(y.raison));
      e.achat = { achetable: v.achetable, fraisPar: v.fraisPar, quote: v.quote === null ? null : String(v.quote), pourquoi: v.pourquoi, classe: PSH.classeBlock(a, e.cles) };
      if (v.achetable) compte.achetables += 1; else if (lectureRatee) compte.nonMesurees += 1; else compte.refusees += 1;
      if (!v.achetable) {
        const k = String(v.pourquoi || '').replace(/0x[0-9a-f]{6,}/gi, '0x…').replace(/\d+/g, 'N').slice(0, 110);
        compte.raisons[k] = (compte.raisons[k] || 0) + 1;
      }
    } catch (err) { compte.nonMesurees += 1; e.achat = { erreur: String(err.message).slice(0, 100) }; }
  }
  out.push(e);
  process.stdout.write('.');
}
const res = { lu: new Date().toISOString(), noeud: NOEUD, tete, sourcesTbLues: I.sourcesTbLues(), appels, trendingLu: tr.lu, prodAchatMarche: tr.achatMarche || null, compte, lignes: out };
console.log('\n' + JSON.stringify({ ...res, lignes: undefined }, null, 1));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(res, null, 1) + '\n');
