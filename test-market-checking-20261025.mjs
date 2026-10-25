/* test-market-checking-20261025.mjs — LE MARKET ET LE VERDICT DE ROUTE SERVI (test live du 2026-10-25 : « AAPLc n a pas de Buy et 21 actions
 *   restent bloquees sur checking »).
 * PARTIE A — la VRAIE reponse de prod /api/trending (lue en lecture seule, x-ms-monitor: 1, 2026-10-25 ~09:52Z, build game38) enregistree dans
 *   mesures/trending-prod-20261025-aaplc.json, passee par le MEME chemin que la ligne du Market (avecPoolAction -> verdictRoutage ->
 *   raisonSansBuy) : AAPLc a Buy par la pool de son routeAction (0xa3b1…), chaque ligne refusee dit la phrase du serveur, aucune ne dit
 *   « checking ». VERT AVANT ET APRES : le code client de game38 mappe deja ce verdict (mesure aussi au navigateur, rendu reel de app.html
 *   servi en local avec ce JSON : AAPLc « Buy », 0 ligne « checking »). Le defaut du test live N EST PAS reproduit sur ce JSON.
 * PARTIE B — ce qui EST reproduit : une ligne que le serveur n a pas encore jugee (ROUTE_EN_COURS, fail-closed apres un demarrage) dit
 *   « checking » et le Market ne relisait /api/trending qu a la reouverture de l onglet : « checking » restait a l ecran apres que le
 *   serveur avait juge. Le vrai lireTrending de app.html est execute (faux DOM, fausse horloge, faux fetch) : 1re lecture = la photo de prod
 *   avec 21 lignes passees en ROUTE_EN_COURS (DERIVEE, synthetique : le JSON exact vu par le testeur n a pas ete enregistre), 2e = la photo
 *   reelle. Attendu : relu seul dans les 30 s, AAPLc achetable ensuite ; et AUCUNE relecture quand rien n est en cours.
 * Mutant (copie en memoire) : la relecture retiree doit rougir.
 * NE PROUVE PAS : le JSON exact que le testeur a recu, le rendu pixel, le cout serveur de la relecture (le serveur garde trCache). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { avecPoolAction } from './pools-actions-aerodrome.js';
import { verdictRoutage, raisonSansBuy } from './routage.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
const PROD = JSON.parse(lire('mesures/trending-prod-20261025-aaplc.json'));
const LIQ_MIN = 500;

/* ================================================================ PARTIE A */
const verdictLigne = (l) => {
  const lA = avecPoolAction(l);
  const vR = verdictRoutage({ aMarche: true, dex: lA.dex, poolAdr: lA.poolAdr, routeAction: lA.routeAction });
  const liqOk = (l.liquiditeUsd || 0) >= LIQ_MIN;
  return { lA, vR, buy: liqOk && (vR.achetableEnEth || vR.achetableEnUsdc), raison: raisonSansBuy(vR, { liqOk, liqMin: LIQ_MIN }) };
};
const avecRoute = PROD.lignes.filter((l) => l.routeAction);
vu(PROD.actionsChaine && PROD.actionsChaine.listeesAuMarche === 39 && avecRoute.length === 39, 'la photo de prod : 39 lignes du Market portent un verdict de route (' + avecRoute.length + ')');
const aapl = PROD.lignes.find((l) => l.sym === 'AAPLc');
vu(aapl && aapl.dex === 'aero' && aapl.poolAdr === '0xf5fcb9cdafce67d50afef298f88e709d2b946ba6' && aapl.routeAction.achetable === true && aapl.routeAction.pool === '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0',
  'AAPLc servi : dex aero (pool 0xf5fc… de la factory recente), routeAction achetable sur 0xa3b1… (factory du routeur)');
const vA = verdictLigne(aapl);
vu(vA.buy === true && vA.lA.poolAdr === aapl.routeAction.pool, 'AAPLc : Buy, par la pool du routeAction — ' + JSON.stringify({ pool: vA.lA.poolAdr, v: vA.vR.verdict }));
const ok = avecRoute.filter((l) => l.routeAction.achetable === true), ko = avecRoute.filter((l) => l.routeAction.achetable === false);
vu(ok.length === 20 && ko.length === 19, '20 achetables, 19 refusees servies (' + ok.length + '/' + ko.length + ')');
const okSansBuy = ok.filter((l) => !verdictLigne(l).buy).map((l) => l.sym);
vu(okSansBuy.length === 0, 'chaque ligne achetable (liquidite au seuil) a Buy — sans Buy : ' + okSansBuy.join(','));
const koMal = ko.filter((l) => { const v = verdictLigne(l); return v.buy || !v.raison || ((l.liquiditeUsd || 0) >= LIQ_MIN && v.raison.phrase !== l.routeAction.phrase); }).map((l) => l.sym);
vu(koMal.length === 0, 'chaque ligne refusee : pas de Buy, la phrase du serveur — fautives : ' + koMal.join(','));
vu(!avecRoute.some((l) => /checking/i.test((verdictLigne(l).raison || {}).phrase || '')), 'aucune ligne jugee ne dit « checking »');

/* ================================================================ PARTIE B : le vrai lireTrending */
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const blocLecture = (t) => entre(t, 'let trRelecture = null;', 'let decouverteTrendingLancee = false;');
const EN_COURS = { achetable: false, code: 'ROUTE_EN_COURS', pool: null, usdcPool: null, ecartBps: null, perteBps: null, phrase: 'No buy yet: checking its route on chain (its pool, a 10 USDC buy and the sale back are quoted first).' };
const enCours = (() => { const d = JSON.parse(JSON.stringify(PROD)); let k = 0; for (const l of d.lignes) if (l.routeAction && k < 21) { l.routeAction = { ...EN_COURS }; k += 1; } return d; })();
vu(enCours.lignes.filter((l) => l.routeAction && l.routeAction.code === 'ROUTE_EN_COURS').length === 21 && enCours.lignes.find((l) => l.sym === 'AAPLc').routeAction.code === 'ROUTE_EN_COURS', 'photo derivee : 21 lignes en ROUTE_EN_COURS, AAPLc parmi elles');
vu(verdictLigne(enCours.lignes.find((l) => l.sym === 'AAPLc')).buy === false && /checking its route/.test(verdictLigne(enCours.lignes.find((l) => l.sym === 'AAPLc')).raison.phrase), 'AAPLc en cours : pas de Buy, « checking » (fail-closed, voulu)');

async function scenario(texte, photos) {
  let t = 1_761_000_000_000; const q = []; /* une horloge epoch (relireTrendingPlusTard remet trLuA a 0) */
  const el = (id) => ({ id, innerHTML: '', textContent: '', classList: { contains: (c) => id === 'v-trade' && c === 'on' } });
  const els = new Map(['trListe', 'trNote', 'v-trade'].map((id) => [id, el(id)]));
  const peints = [];
  let lus = 0;
  const ctx = {
    $: (s) => els.get(s.replace(/^#/, '')) || null, document: { hidden: false },
    fetch: async () => { const d = photos[Math.min(lus, photos.length - 1)]; lus += 1; return { json: async () => JSON.parse(JSON.stringify(d)) }; },
    setTimeout: (f, ms) => { q.push({ at: t + ms, f }); return q.length; },
    Date: { now: () => t },
    peindreTrending: () => { peints.push(trD()); },
  };
  let trD = () => null;
  const noms = Object.keys(ctx);
  const f = new Function(...noms, 'let trDonnees = null, trLuA = 0, dernierTrending = null;\n' + blocLecture(texte) + '\n;return { lireTrending, etat: () => trDonnees };');
  const api = f(...noms.map((k) => ctx[k]));
  trD = api.etat;
  await api.lireTrending();
  const avancer = async (ms) => { const fin = t + ms; for (;;) { q.sort((a, b) => a.at - b.at); const x = q[0]; if (!x || x.at > fin) break; q.shift(); t = x.at; x.f(); for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); } t = fin; };
  await avancer(31000);
  const apres = trD();
  const aaplApres = apres && apres.lignes.find((l) => l.sym === 'AAPLc');
  return { lus, peints: peints.length, aaplAchetable: !!(aaplApres && aaplApres.routeAction && aaplApres.routeAction.achetable === true) };
}
const S = {
  RELU: async (texte) => { const r = await scenario(texte, [enCours, PROD]); return { ...r, ok: r.lus === 2 && r.peints === 2 && r.aaplAchetable }; },
  CALME: async (texte) => { const r = await scenario(texte, [PROD, PROD]); return { ...r, ok: r.lus === 1 && r.peints === 1 }; },
};
vu(blocLecture(APP).includes('async function lireTrending()'), 'le bloc de lecture du Market est extrait de app.html');
for (const [k, s] of Object.entries(S)) { const r = await s(APP); vu(r.ok === true, 'scenario ' + k + ' ' + JSON.stringify(r)); }

/* ---------------------------------------------------------------- mutant (copie en memoire) */
const MUT = [
  ['RELU', 'la liste n est pas relue tant qu une ligne est en cours (le code d avant)', "  if (trDonnees && Array.isArray(trDonnees.lignes) && trDonnees.lignes.some((l) => l && l.routeAction && l.routeAction.code === 'ROUTE_EN_COURS')) relireTrendingPlusTard();\n", ''],
  ['CALME', 'relu meme quand tout est juge', "l.routeAction.code === 'ROUTE_EN_COURS')) relireTrendingPlusTard();", "true)) relireTrendingPlusTard();"],
];
let tues = 0;
for (const [s, nom, de, vers] of MUT) {
  vu(APP.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique');
  let r; try { r = await S[s](APP.replace(de, () => vers)); } catch (e) { r = { ok: false, jete: String(e && e.message) }; }
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
console.log('ok market-checking - ' + n + ' assertions, ' + tues + '/' + MUT.length + ' mutants tues ; NE PROUVE PAS le JSON exact recu par le testeur (photo de prod de 09:52Z + derivee synthetique), le rendu pixel');
