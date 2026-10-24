/* test-duels-etat-20261024.mjs — LES DUELS LUS PAR L ETAT, PAS PAR LES LOGS D ARCHIVE (2026-10-24).
 * MESURE prod game33 (2026-10-24 13:48 UTC) : GET /api/duels = {"ok":false,"etat":"NON_LU","pourquoi":"logs unreadable"} a chaque lecture ;
 *   la carte Duels disait « back in a few seconds » pour toujours. Le lecteur relisait les logs par fenetres de 2 000 blocs depuis
 *   max(deploiement, tete - 7 jours) : un noeud qui refuse eth_getLogs (mainnet.base.org : 429) = JAMAIS rien de servi.
 * EXECUTE (pas de lecture de structure seule) :
 *   1. duels-etat.js (pur) : nextId, duels(id) decode et ses incoherences refusees, un duel regle complete par le hash de son bloc cible
 *      (scores et gagnant = scoresDuel de duels-plan.js, le jumeau independant), le budget et la fenetre des ids par tour ;
 *   2. la VRAIE tranche de serveur-web.js (lireDuelsSrv + la route /api/duels), contre un FAUX noeud qui REFUSE eth_getLogs ENTIEREMENT :
 *      6 duels de chaque statut -> LU, chacun classe ; nextId 1 -> ok, liste vide ; nextId illisible -> NON_LU, echec, pourquoi ;
 *      120 duels -> au plus 50 duels(id) par tour, newest first, la liste complete en 4 tours ; un duel final n est plus relu ; un duel
 *      ouvert qui est rejoint est vu au tour suivant ; un duel regle dont l en-tete est illisible n est PAS servi comme « rejoint » ;
 *      nextId lu mais aucun duels(id) lisible au premier tour -> NON_LU (jamais une liste vide qui dirait « aucun duel ») ;
 *   3. le regleur (slots-regleur.js) : eth_getLogs refuse + la liste par l etat (duels.joints) -> settle(id) part quand meme, vers le
 *      contrat des duels ; sans liste par l etat, le refus des logs jette comme avant (aucun envoi) ;
 *   4. l app : la phrase d un NON_LU (phraseDuelsNonLus, tranche executee) ne promet aucun delai ; un echec dit « could not be read » + pourquoi.
 * ROUGE / VERT : SERVEUR_WEB, APP_HTML, REGLEUR_MODULE = des copies d une autre version (f50103b) ; TOUT_COMPTER=1 compte les KO par cas.
 * NE PROUVE PAS : le noeud de production (seule une sonde nextId en direct l a touche) ; la parite avec le bytecode compile (le banc anvil
 *   banc-duels-etat-anvil-20261024.mjs la mesure) ; le rendu de la carte dans un navigateur. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { selecteur, topic, keccak256Hex } from './keccak.js';
import * as P from './duels-plan.js';
import * as APPD from './duels-plan-app.js';
import { blocsPour } from './temps-de-bloc.js';

const TOUT = !!process.env.TOUT_COMPTER;
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (TOUT) { if (!c) { ko += 1; console.log('  KO ' + m); } return; } assert.ok(c, m); };
const cas = async (nom, f) => {
  const n0 = n, k0 = ko;
  try { await f(); } catch (e) { if (!TOUT) throw e; ko += 1; console.log('  KO ' + nom + ' : exception ' + String(e && e.message).slice(0, 140)); }
  if (TOUT) console.log((ko === k0 ? 'ok  ' : 'KO  ') + nom + ' — ' + (n - n0) + ' assertions, ' + (ko - k0) + ' KO');
};
const lireTexte = (p, defaut) => readFileSync(p ? p : new URL('./' + defaut, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SRV = lireTexte(process.env.SERVEUR_WEB, 'serveur-web.js');
const APP = lireTexte(process.env.APP_HTML, 'app.html');
const MOD_REGLEUR = process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href;
/* DUELS_ETAT_MODULE : une COPIE mutee de duels-etat.js (muter-duels-etat.mjs) ; sinon le module du depot */
const E = await import(process.env.DUELS_ETAT_MODULE ? pathToFileURL(process.env.DUELS_ETAT_MODULE).href : new URL('./duels-etat.js', import.meta.url).href);
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); assert.ok(i > 0 && j > i, 'tranche introuvable : ' + a); return t.slice(i, j); };

const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const adr = (b) => '0x' + b.repeat(20);
const C = adr('6b'), USDC = adr('83'), A = adr('a1'), B = adr('b2'), ZERO = '0x' + '0'.repeat(40);
const emballer = (g) => (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
const STATUT = { None: 0, Open: 1, Joined: 2, Settled: 3, Cancelled: 4, Refunded: 5 };
/* duels(id) tel que le getter public le rend (9 mots, l ordre du struct Duel de contracts/src/BlockDuels.sol) */
const retourDuel = (d) => '0x' + [d.creator || ZERO, d.expiresAt || 0, STATUT[d.statut] || 0, emballer(d.guessA || [0, 0, 0, 0, 0]), d.joiner || ZERO, d.targetBlock || 0,
  emballer(d.guessB || [0, 0, 0, 0, 0]), d.token || ZERO, d.stake || 0].map(u).join('');
const hashDe = (b) => keccak256Hex(new TextEncoder().encode('bloc-' + b));
const S_NEXT = selecteur('nextId()'), S_DUELS = selecteur('duels(uint256)');

/* ================================================================ 1. duels-etat.js, pur */
await cas('1. duels-etat.js (pur)', async () => {
  vu(E.appelNextIdEtat() === S_NEXT && S_NEXT === '0x61b8ce8c', 'nextId() : selecteur 0x61b8ce8c (recalcule depuis la signature)');
  vu(E.appelDuelEtat(7) === S_DUELS + u(7), 'duels(7) : selecteur + un mot');
  vu(E.lireNextId('0x' + u(1)) === 1 && E.lireNextId('0x' + u(42)) === 42, 'nextId lu : 1, 42');
  vu(E.lireNextId('0x') === null && E.lireNextId('0x' + u(0)) === null && E.lireNextId(null) === null && E.lireNextId('0x' + u(1).slice(2)) === null, 'nextId vide, 0, absent, tronque : null (jamais « aucun duel » par defaut)');
  const T = Math.floor(Date.now() / 1000);
  const base = { creator: A, expiresAt: T + 3600, guessA: [1, 2, 3, 4, 5], token: USDC, stake: 2_000_000n };
  const ouvert = E.duelDepuisEtat(5, retourDuel({ ...base, statut: 'Open' }));
  vu(ouvert && ouvert.statut === 'Open' && !ouvert.final && ouvert.duel.id === '5' && ouvert.duel.creator === A && ouvert.duel.token === USDC && ouvert.duel.stake === 2_000_000n
    && ouvert.duel.guessA.join() === '1,2,3,4,5' && ouvert.duel.joiner === null && ouvert.duel.targetBlock === null && ouvert.duel.blocCree === null, 'Open : la forme de lireDuels, guess deballe comme _unpack');
  vu(APPD.etatDuel(ouvert.duel, 100, T).etat === 'OUVERT', 'etatDuel(Open, avant expiration) = OUVERT');
  const joint = E.duelDepuisEtat(6, retourDuel({ ...base, statut: 'Joined', joiner: B, targetBlock: 1000, guessB: [5, 9, 18, 8, 7] }));
  vu(joint && joint.duel.joiner === B && joint.duel.targetBlock === 1000 && joint.duel.guessB.join() === '5,9,18,8,7' && !joint.final, 'Joined : joueur, cible, guess B (bornes hautes 5/9/18/8/7)');
  vu(APPD.etatDuel(joint.duel, 1010, T).etat === 'REGLABLE' && APPD.etatDuel(joint.duel, 1300, T).etat === 'REMBOURSABLE' && APPD.etatDuel(joint.duel, 999, T).etat === 'ATTENTE', 'Joined : REGLABLE / REMBOURSABLE / ATTENTE selon la tete');
  const regle = E.duelDepuisEtat(8, retourDuel({ ...base, statut: 'Settled', joiner: B, targetBlock: 1000, guessB: [0, 0, 0, 0, 0] }));
  vu(regle && regle.final && regle.duel.settled === null, 'Settled lu : final, settled a completer (null tant que le hash n est pas lu)');
  const h = hashDe(1000), att = P.scoresDuel(h, base.guessA, [0, 0, 0, 0, 0]), comp = E.reglerDepuisHash(regle.duel, h);
  const gagnantAttendu = att.gagnant === 'A' ? A : att.gagnant === 'B' ? B : ZERO;
  vu(comp && comp.settled.blockHash === h && comp.settled.scoreA === att.scoreA && comp.settled.scoreB === att.scoreB && comp.settled.winner === gagnantAttendu
    && comp.settled.payout === (gagnantAttendu === ZERO ? 0n : APPD.partage(2_000_000n).gagnant) && APPD.etatDuel(comp, 5000, T).etat === 'REGLE',
  'Settled + hash du bloc cible : scores ' + (comp && comp.settled.scoreA) + '/' + (comp && comp.settled.scoreB) + ' = scoresDuel (duels-plan.js), gagnant et gain 90 %, REGLE');
  const egal = E.reglerDepuisHash(E.duelDepuisEtat(9, retourDuel({ ...base, statut: 'Settled', joiner: B, targetBlock: 1000, guessB: base.guessA })).duel, h);
  vu(egal && egal.settled.winner === ZERO && egal.settled.payout === 0n && egal.refunded === true && egal.settled.scoreA === egal.settled.scoreB, 'egalite : winner nul, payout 0, refunded (comme Settled + Refunded des logs)');
  vu(E.reglerDepuisHash(regle.duel, '0x' + '0'.repeat(64)) === null && E.reglerDepuisHash(regle.duel, null) === null && E.reglerDepuisHash(regle.duel, '0x12') === null, 'hash nul / absent / tronque : null (jamais un reglement invente)');
  const annule = E.duelDepuisEtat(10, retourDuel({ ...base, statut: 'Cancelled' })), rembourse = E.duelDepuisEtat(11, retourDuel({ ...base, statut: 'Refunded' }));
  vu(annule.final && annule.duel.cancelled && APPD.etatDuel(annule.duel, 1, T).etat === 'ANNULE' && rembourse.final && rembourse.duel.refunded && APPD.etatDuel(rembourse.duel, 1, T).etat === 'REMBOURSE', 'Cancelled / Refunded : finals, ANNULE / REMBOURSE');
  /* les incoherences : jamais un duel servi */
  const refus = [
    ['statut None (noeud en retard)', { ...base, statut: 'None' }], ['createur nul', { ...base, creator: ZERO, statut: 'Open' }], ['jeton nul', { ...base, token: ZERO, statut: 'Open' }],
    ['mise sous MIN_STAKE', { ...base, stake: 99_999n, statut: 'Open' }], ['guess A hors bornes', { ...base, guessA: [6, 0, 0, 0, 0], statut: 'Open' }],
    ['Joined sans joueur', { ...base, statut: 'Joined', targetBlock: 9 }], ['Settled sans joueur', { ...base, statut: 'Settled', targetBlock: 9 }],
    ['Open avec un joueur', { ...base, statut: 'Open', joiner: B, targetBlock: 9 }], ['Joined sans cible', { ...base, statut: 'Joined', joiner: B, targetBlock: 0 }],
    ['statut 6 inconnu', { ...base, statut: 'X' }],
  ];
  for (const [quoi, d] of refus) vu(E.duelDepuisEtat(1, quoi === 'statut 6 inconnu' ? retourDuel(d).slice(0, 2 + 128) + u(6) + retourDuel(d).slice(2 + 192) : retourDuel(d)) === null, 'refuse : ' + quoi);
  vu(E.duelDepuisEtat(1, '0x' + u(1)) === null && E.duelDepuisEtat(1, null) === null, 'retour tronque / absent : null');
  /* le budget et la fenetre */
  const c0 = new Map();
  let r = E.idsDuelsATour({ nextId: 121, cache: c0, budget: 50 });
  vu(r.ids.length === 50 && r.ids[0] === 120 && r.ids[49] === 71 && r.restants === 70, 'cache vide, 120 duels : 50 ids, 120 -> 71 (newest first), 70 restants');
  for (const id of r.ids) c0.set(String(id), { final: false, luA: id });
  r = E.idsDuelsATour({ nextId: 121, cache: c0, budget: 50 });
  vu(r.ids.length === 50 && r.ids.slice(0, 25).join() === Array.from({ length: 25 }, (_, i) => 70 - i).join() && r.ids.slice(25).every((id) => id >= 71 && id <= 95) && r.restants === 45,
    'non finaux en cache : 25 neufs (70 -> 46) + 25 relectures (le moins recemment lu d abord), 45 restants');
  const c1 = new Map(Array.from({ length: 10 }, (_, i) => [String(i + 1), { final: true, luA: 0 }]));
  r = E.idsDuelsATour({ nextId: 11, cache: c1, budget: 50 });
  vu(r.ids.length === 0 && r.restants === 0, 'tous finals : AUCUN id relu');
  r = E.idsDuelsATour({ nextId: 5001, cache: new Map(), budget: 50, garde: 2000 });
  vu(r.ids[0] === 5000 && r.ids.every((id) => id >= 3001) && r.restants === 1950, 'fenetre : les 2 000 ids les plus recents seulement (jamais sous 3 001 pour nextId 5 001)');
  vu(E.idsDuelsATour({ nextId: 1, cache: new Map() }).ids.length === 0 && E.idsDuelsATour({ nextId: 1, cache: new Map() }).restants === 0, 'nextId 1 : rien a lire, liste complete');
});

/* ================================================================ 2. la vraie tranche de serveur-web.js, noeud qui refuse eth_getLogs */
const srcLecteur = tranche(SRV, '/* ══ LES DUELS LUS SUR LA CHAINE (2026-10-18', "setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }");
const srcRoute = tranche(SRV, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
const TETE = 60_000_000;
function noeud({ duels = new Map(), nextId = null, appelRefuse = false, enteteIllisible = new Set() } = {}) {
  const nd = { appels: [], duels, nextId, appelRefuse, enteteIllisible };
  nd.rpcServeur = async (m, p) => {
    nd.appels.push(m === 'eth_call' ? m + ':' + String(p[0].data).slice(0, 10) : m);
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') throw new Error('request limit reached');
    if (m === 'eth_getBlockByNumber') {
      const b = p[0] === 'latest' ? TETE : parseInt(p[0], 16);
      if (nd.enteteIllisible.has(b)) return null;
      return { number: hx(b), hash: hashDe(b), timestamp: hx(1_700_000_000 + b * 2) };
    }
    if (m === 'eth_call') {
      if (nd.appelRefuse) throw new Error('request limit reached');
      const { to, data } = p[0];
      if (String(to).toLowerCase() !== C) throw new Error('unexpected eth_call target');
      if (data === S_NEXT) return '0x' + u(nd.nextId ?? (nd.duels.size + 1));
      if (data.startsWith(S_DUELS)) { const d = nd.duels.get(Number(BigInt('0x' + data.slice(10)))); return d ? retourDuel(d) : retourDuel({}); }
      throw new Error('unexpected eth_call ' + data.slice(0, 10));
    }
    throw new Error('unexpected method ' + m);
  };
  return nd;
}
const REGLEUR_OFF = { etat: () => ({ etat: 'OFF', adresse: null, contrats: [] }) };
function monter(nd) {
  const f = new Function('DUELS_DEPLOIEMENT', 'rpcServeur', 'blocsPour', 'sParBlocSrv', 'TAILLE_LOGS_DUELS', 'filtreLogsDuels', 'lireDuels', 'duelEnJson', 'partageDuel', 'MISE_MIN_DUEL',
    'EXP_MIN_DUEL', 'EXP_MAX_DUEL', 'FINIS_DUEL', 'etatDuelSrv', 'regleurCouvre', 'regleurSlots', 'createurParBlock',
    'appelNextIdEtat', 'appelDuelEtat', 'lireNextIdDuels', 'duelDepuisEtat', 'reglerDepuisHash', 'idsDuelsATour',
    srcLecteur + '\nasync function route(req, res, chemin) {\n' + srcRoute + '\n}\nreturn { lireDuelsSrv, duelsSrv, route };');
  return f({ adresse: C, bloc: 52_778_966, chaine: 8453, constructeur: { usdc: USDC, devWallet: adr('dd'), rewardPool: adr('ee') } }, nd.rpcServeur, blocsPour, async () => 2, APPD.TAILLE_FENETRE_LOGS, APPD.filtreLogsDuels,
    APPD.lireDuels, APPD.duelEnJson, APPD.partage, APPD.MISE_MIN, APPD.EXPIRATION_MIN_S, APPD.EXPIRATION_MAX_S, APPD.FINIS, APPD.etatDuel, APPD.regleurCouvre, REGLEUR_OFF, new Map(),
    E.appelNextIdEtat, E.appelDuelEtat, E.lireNextId, E.duelDepuisEtat, E.reglerDepuisHash, E.idsDuelsATour);
}
/* un tour du lecteur (le minuteur de 15 s remis a zero), puis GET /api/duels */
async function tourEtGet(x) {
  x.duelsSrv.lu = 0;
  await x.lireDuelsSrv();
  const res = { code: null, corps: null, writeHead(c) { this.code = c; }, end(s) { this.corps = s; } };
  await x.route({ method: 'GET' }, res, '/api/duels');
  return JSON.parse(res.corps);
}
const T = Math.floor(Date.now() / 1000);
const g = (k) => [k % 6, k % 10, k % 19, k % 9, k % 8];

await cas('2a. noeud qui REFUSE eth_getLogs, 7 duels de chaque statut -> LU, chacun classe', async () => {
  const duels = new Map([
    [1, { creator: A, expiresAt: T + 3600, statut: 'Settled', guessA: g(1), joiner: B, targetBlock: TETE - 1000, guessB: g(2), token: USDC, stake: 1_000_001n }],
    [2, { creator: A, expiresAt: T + 3600, statut: 'Cancelled', guessA: g(3), token: USDC, stake: 500_000n }],
    [3, { creator: B, expiresAt: T - 10, statut: 'Open', guessA: g(4), token: USDC, stake: 300_000n }],
    [4, { creator: A, expiresAt: T + 3600, statut: 'Joined', guessA: g(5), joiner: B, targetBlock: TETE - 10, guessB: g(6), token: USDC, stake: 700_000n }],
    [5, { creator: B, expiresAt: T + 3600, statut: 'Open', guessA: g(7), token: USDC, stake: 900_000n }],
    [6, { creator: A, expiresAt: T - 100, statut: 'Refunded', guessA: g(8), token: USDC, stake: 400_000n }],
    [7, { creator: A, expiresAt: T + 3600, statut: 'Settled', guessA: g(9), joiner: B, targetBlock: TETE - 500, guessB: g(9), token: USDC, stake: 600_000n }],
  ]);
  const nd = noeud({ duels }), x = monter(nd);
  const j = await tourEtGet(x);
  vu(j.ok === true && j.etat === 'LU', 'getLogs refuse : /api/duels LU (lu : ' + j.etat + (j.pourquoi ? ', ' + j.pourquoi : '') + ')');
  vu(!nd.appels.includes('eth_getLogs'), 'AUCUN eth_getLogs demande (' + nd.appels.filter((a) => a === 'eth_getLogs').length + ')');
  const tous = [...(j.duels || []), ...(j.recents || [])];
  const etat = (id) => (tous.find((d) => d.id === String(id)) || {}).etat;
  vu(etat(1) === 'REGLE' && etat(2) === 'ANNULE' && etat(3) === 'EXPIRE' && etat(4) === 'REGLABLE' && etat(5) === 'OUVERT' && etat(6) === 'REMBOURSE' && etat(7) === 'REGLE',
    'classes : #1 REGLE, #2 ANNULE, #3 EXPIRE, #4 REGLABLE, #5 OUVERT, #6 REMBOURSE, #7 REGLE (lu : ' + [1, 2, 3, 4, 5, 6, 7].map(etat).join(',') + ')');
  vu((j.duels || []).map((d) => d.id).join() === '5,4,3' && (j.recents || []).map((d) => d.id).join() === '7,6,2,1', 'vivants 5,4,3 et recents 7,6,2,1 (du plus recent au plus ancien)');
  const d1 = APPD.duelDepuisJson(tous.find((d) => d.id === '1')), att = P.scoresDuel(hashDe(TETE - 1000), g(1), g(2));
  vu(d1 && d1.settled && d1.settled.blockHash === hashDe(TETE - 1000) && d1.settled.scoreA === att.scoreA && d1.settled.scoreB === att.scoreB && d1.stake === 1_000_001n, '#1 servi -> duelDepuisJson : hash du bloc cible, scores = scoresDuel, mise au wei');
  const d7 = APPD.duelDepuisJson(tous.find((d) => d.id === '7'));
  vu(d7 && d7.settled && d7.settled.winner === ZERO && d7.refunded === true, '#7 (meme guess) : egalite, winner nul, refunded');
  vu(tous.every((d) => APPD.duelDepuisJson(d) !== null), 'les 7 duels servis passent duelDepuisJson (la forme que l app accepte)');
  vu(j.partiel === false && j.nextId === 8 && j.aLire === 0 && j.orphelins === 0 && j.erreur === null, 'liste complete : partiel false, nextId 8, 0 a lire, 0 orphelin, aucune erreur');
  vu(j.tete === TETE && j.contrat === C && j.regleur && j.regleur.regleDuels === false, 'la fiche et le regleur restent servis (tete, contrat, regleDuels false)');
});

await cas('2b. aucun duel (nextId 1) -> ok, liste vide', async () => {
  const nd = noeud({ nextId: 1 }), x = monter(nd);
  const j = await tourEtGet(x);
  vu(j.ok === true && j.etat === 'LU' && Array.isArray(j.duels) && j.duels.length === 0 && j.recents.length === 0 && j.partiel === false, 'nextId 1 : ok, 0 duel, 0 recent, pas partiel (lu : ' + j.etat + (j.pourquoi ? ', ' + j.pourquoi : '') + ')');
  vu(!nd.appels.includes('eth_getLogs') && nd.appels.filter((a) => a.startsWith('eth_call:' + S_DUELS)).length === 0, 'ni getLogs ni duels(id)');
});

await cas('2c. nextId illisible (eth_call refuse) -> NON_LU, echec dit, pourquoi', async () => {
  const nd = noeud({ appelRefuse: true }), x = monter(nd);
  const j = await tourEtGet(x);
  vu(j.ok === false && j.etat === 'NON_LU' && j.echec === true && /request limit reached/.test(j.pourquoi || ''), 'NON_LU, echec true, pourquoi = l erreur du noeud (' + j.pourquoi + ')');
  /* la lecture revient : la liste est servie au tour suivant */
  nd.appelRefuse = false; nd.nextId = 1;
  const j2 = await tourEtGet(x);
  vu(j2.ok === true && j2.etat === 'LU', 'le noeud repond au tour suivant : LU');
});

await cas('2d. 120 duels -> au plus 50 duels(id) par tour, newest first, complet en 4 tours', async () => {
  const duels = new Map(Array.from({ length: 120 }, (_, i) => [i + 1, { creator: A, expiresAt: T + 3600, statut: 'Open', guessA: g(i), token: USDC, stake: 200_000n }]));
  const nd = noeud({ duels }), x = monter(nd);
  const parTour = [];
  let j = null;
  for (let k = 0; k < 4; k++) {
    const a0 = nd.appels.length;
    j = await tourEtGet(x);
    const ce = nd.appels.slice(a0);
    parTour.push(ce.filter((a) => a.startsWith('eth_call:' + S_DUELS)).length);
    vu(!ce.includes('eth_getLogs'), 'tour ' + (k + 1) + ' : aucun getLogs');
    if (k === 0) vu(j.ok && j.partiel === true && j.aLire === 70 && j.duels.length === 50 && j.duels[0].id === '120' && j.duels[49].id === '71', 'tour 1 : les 50 plus recents (120 -> 71), partiel, 70 a lire');
  }
  vu(parTour.every((c) => c <= 50), 'duels(id) par tour : ' + parTour.join(', ') + ' (<= 50)');
  vu(j.ok && j.partiel === false && j.aLire === 0 && j.duels.length === 120, 'apres 4 tours : les 120 duels, liste complete (lu : ' + (j.duels || []).length + ', a lire ' + j.aLire + ')');
});

await cas('2e. un duel final n est plus relu ; un ouvert rejoint est vu au tour suivant', async () => {
  const duels = new Map([
    [1, { creator: A, expiresAt: T + 3600, statut: 'Cancelled', guessA: g(1), token: USDC, stake: 200_000n }],
    [2, { creator: A, expiresAt: T + 3600, statut: 'Refunded', guessA: g(2), token: USDC, stake: 200_000n }],
    [3, { creator: A, expiresAt: T + 3600, statut: 'Open', guessA: g(3), token: USDC, stake: 200_000n }],
  ]);
  const nd = noeud({ duels }), x = monter(nd);
  await tourEtGet(x);
  Object.assign(duels.get(3), { statut: 'Joined', joiner: B, targetBlock: TETE - 5, guessB: g(4) });
  const a0 = nd.appels.length;
  const j = await tourEtGet(x);
  const relus = nd.appels.slice(a0).filter((a) => a.startsWith('eth_call:' + S_DUELS)).length;
  vu(relus === 1, 'tour 2 : 1 seul duels(id) relu (le non final), les 2 finals jamais (lu : ' + relus + ')');
  vu((j.duels.find((d) => d.id === '3') || {}).etat === 'REGLABLE', '#3 rejoint entre deux tours : REGLABLE au tour suivant');
});

await cas('2f. un duel regle dont l en-tete est illisible n est pas servi comme « rejoint »', async () => {
  const duels = new Map([[1, { creator: A, expiresAt: T + 3600, statut: 'Joined', guessA: g(1), joiner: B, targetBlock: TETE - 300, guessB: g(2), token: USDC, stake: 200_000n }]]);
  const nd = noeud({ duels }), x = monter(nd);
  let j = await tourEtGet(x);
  vu((j.duels.find((d) => d.id === '1') || {}).etat === 'REMBOURSABLE', 'tour 1 : rejoint, fenetre passee : REMBOURSABLE');
  duels.get(1).statut = 'Settled'; nd.enteteIllisible.add(TETE - 300);
  j = await tourEtGet(x);
  const tous = [...(j.duels || []), ...(j.recents || [])];
  vu(!tous.some((d) => d.id === '1' && d.etat === 'REMBOURSABLE') && (j.ok === false || j.erreur !== null), 'regle, en-tete illisible : plus jamais REMBOURSABLE (un Refund qui revertirait), l erreur est dite (' + (j.erreur || j.pourquoi) + ')');
  nd.enteteIllisible.clear();
  j = await tourEtGet(x);
  vu(((j.recents || []).find((d) => d.id === '1') || {}).etat === 'REGLE', 'l en-tete revient : REGLE');
});

await cas('2g. premiere lecture : nextId lu, mais AUCUN duels(id) lisible -> NON_LU (jamais « aucun duel »)', async () => {
  const duels = new Map([[1, { creator: A, expiresAt: T + 3600, statut: 'Open', guessA: g(1), token: USDC, stake: 200_000n }]]);
  const nd = noeud({ duels }), brut = nd.rpcServeur;
  const x = monter({ rpcServeur: async (m, p) => { if (m === 'eth_call' && String(p[0].data).startsWith(S_DUELS)) throw new Error('request limit reached'); return brut(m, p); } });
  const j = await tourEtGet(x);
  vu(j.ok === false && j.etat === 'NON_LU' && j.echec === true && /request limit reached/.test(j.pourquoi || ''), 'duels(id) tous refuses : NON_LU, echec, pourquoi (lu : ' + j.etat + ', ' + (j.pourquoi || '') + ')');
  vu(!(Array.isArray(j.duels) && j.duels.length === 0), 'jamais une liste vide servie comme « aucun duel »');
});

/* ================================================================ 3. le regleur : la liste par l etat quand les logs sont refuses */
await cas('3. regleur : getLogs refuse + duels.joints -> settle(id) part vers les duels', async () => {
  const M = await import(MOD_REGLEUR);
  const CLE = '0x' + '0'.repeat(63) + '1'; /* la cle de TEST publique n 1 */
  const D = adr('d0'), CIBLE3 = 99980;
  const fausse = (statuts) => {
    const ch = { envoyes: [], appels: [] };
    ch.rpc = async (m, p) => {
      ch.appels.push(m);
      switch (m) {
        case 'eth_chainId': return hx(8453);
        case 'eth_blockNumber': return hx(100000);
        case 'eth_getBlockByNumber': { const b = p[0] === 'latest' ? 100000 : parseInt(p[0], 16); return { number: hx(b), hash: hashDe(b), timestamp: hx(1_700_000_000 + Math.floor(b / 5)), baseFeePerGas: hx(1_000_000) }; }
        case 'eth_getLogs': throw new Error('request limit reached');
        /* 2026-10-24 (integration 84c848c) : guess A = la face du hash de la cible (P.traitsDepuisHash, independant du regleur), guess B nul :
         *   le CREATEUR gagne (une egalite ne serait jamais reglee) ; mise 1 USDC */
        case 'eth_call': { const d = p[0].data; if (p[0].to === D && d.startsWith(S_DUELS)) return '0x' + [0, 0, statuts.get(String(BigInt('0x' + d.slice(10)))) ?? 0, emballer(P.traitsDepuisHash(hashDe(CIBLE3))), 0, CIBLE3, 0, 0, 1_000_000].map(u).join(''); throw new Error('unexpected eth_call'); }
        case 'eth_maxPriorityFeePerGas': return hx(1000);
        case 'eth_estimateGas': return hx(90000);
        case 'eth_getTransactionCount': return hx(3);
        case 'eth_sendRawTransaction': ch.envoyes.push(p[0]); return null;
        case 'eth_getTransactionReceipt': return null;
        default: throw new Error('unexpected method ' + m);
      }
    };
    return ch;
  };
  /* avec la liste par l etat : le duel #7 rejoint (cible 99 980 = tete - 20 >= delaiDuelBlocs, le createur gagne, statut relu Joined) part */
  const ch = fausse(new Map([['7', 2]]));
  const r = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: () => 1_000_000, duels: { contrat: D, bloc: 0, joints: () => [{ id: '7', targetBlock: CIBLE3 }] } });
  const t = await r.tour();
  vu(t.fait === true && ch.envoyes.length === 1 && t.cible === 'duels' && t.quoi === 'settle' && String(t.ids && t.ids[0]) === '7', 'logs refuses, liste par l etat : UNE tx settle(#7) vers les duels (lu : ' + JSON.stringify({ fait: t.fait, pourquoi: t.pourquoi }) + ')');
  vu(ch.appels.includes('eth_getLogs'), 'les logs recents ont bien ete demandes (et refuses)');
  const e = r.etat();
  vu(e.contrats && e.contrats.duels && e.contrats.duels.envois === 1 && (e.erreurs || []).some((x) => /duels logs not read \(state list used\)/.test(x.quoi)), 'etat() : 1 envoi aux duels, et le refus des logs est DIT');
  /* une liste par l etat perimee (#8 deja regle sur la chaine) : le statut relu l ecarte, rien ne part */
  const ch2 = fausse(new Map([['8', 3]]));
  const r2 = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch2.rpc, maintenant: () => 1_000_000, duels: { contrat: D, bloc: 0, joints: () => [{ id: '8', targetBlock: CIBLE3 }] } });
  await r2.tour();
  vu(ch2.envoyes.length === 0, 'liste perimee (#8 deja Settled) : statut relu, AUCUN envoi');
  /* sans liste par l etat : le refus des logs jette (comme avant), aucun envoi */
  const ch3 = fausse(new Map([['7', 2]]));
  const r3 = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch3.rpc, maintenant: () => 1_000_000, duels: { contrat: D, bloc: 0 } });
  await r3.tour();
  vu(ch3.envoyes.length === 0 && (r3.etat().erreurs || []).some((x) => /duels not read: request limit reached/.test(x.quoi)), 'sans liste par l etat : « duels not read », aucun envoi (comportement inchange)');
});

/* ================================================================ 4. l app : un NON_LU ne promet aucun delai */
await cas('4. app : la phrase d un NON_LU', async () => {
  const bloc = tranche(APP, '/* ══ LES DUELS (Phil 2026-10-18', '/* ══ LET THE BRAIN PLAY');
  const sansCom = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ''); /* les commentaires citent l ancienne phrase : l absence se cherche dans le code */
  vu(!/few seconds/.test(sansCom(bloc)) && !/few seconds/.test(sansCom(tranche(APP, 'async function bcCommandeDuel(', 'async function bcAccepterDuel('))), 'carte ET commande « duel » : plus de « few seconds »');
  const src = tranche(APP, 'function phraseDuelsNonLus(j) {', '\nasync function ').replace(/\n\}[\s\S]*$/, '\n}');
  const f = new Function(src + '\nreturn phraseDuelsNonLus;')();
  const echec = f({ ok: false, etat: 'NON_LU', echec: true, pourquoi: 'logs unreadable' });
  vu(echec === 'The duels could not be read just now: logs unreadable.', 'lecture ECHOUEE : « could not be read just now: logs unreadable. » (lu : ' + echec + ')');
  vu(f({ ok: false, etat: 'NON_LU', echec: false, pourquoi: 'first read in progress' }) === 'The duels are being read on chain (first read).', 'premiere lecture pas finie : « being read », sans delai promis');
  vu(f({ ok: false, etat: 'NON_LU', pourquoi: 'logs unreadable' }) === 'The duels could not be read just now: logs unreadable.', 'NON_LU sans « echec » (la reponse de prod game33) : « could not be read just now », pas « being read »');
  vu(f(null) === 'The duels could not be read just now.' && f({ ok: false, etat: 'NON_LU', pourquoi: 'x'.repeat(300) }).length <= 140, 'pas de reponse : « could not be read » ; pourquoi borne (court)');
  vu(/etat\.textContent = phraseDuelsNonLus\(j\);/.test(bloc) && /bcEtape\(m, phraseDuelsNonLus\(j\), 'non'\)/.test(APP), 'la carte et la commande « duel » disent cette phrase');
});

console.log((ko ? 'ECHEC ' : 'ok ') + 'test-duels-etat - ' + n + ' assertions' + (TOUT ? ', ' + ko + ' KO' : '') + ' ; NE PROUVE PAS le noeud de production ni le rendu');
if (ko) process.exit(1);
