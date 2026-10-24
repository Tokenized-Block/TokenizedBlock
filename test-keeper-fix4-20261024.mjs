/* test-keeper-fix4-20261024.mjs — ROUND 4 (2026-10-24, decision du lead, delegue par Phil) apres la revue keeper round 3 (FAIL, 4 attaques).
 *   A. PORTE DES DUELS FERMEE sur BlockDuels v1 (duels-plan-app.js DUELS_REGLEUR_SUFFIT) : les cas du PoC de la revue
 *      (scratchpad rev3/poc-rev3-keeper.mjs : P1 famine du classement par egalites N=310 / 400, P1c meme chose avec la liste par l etat,
 *      P2 tete gelee, P3 gas au-dessus du plafond, P4 plafond horaire plein, P5 duels(id) refuses en-tetes servis) sont rejoues sur le VRAI
 *      regleur (creerRegleur, faux noeud local, cle de TEST publique n 1) avec l adresse LIVE de BlockDuels (lue dans duels-deploiement.js,
 *      jamais recrite) : a CHAQUE tour regleurCouvre = false et la reponse servie n ouvre rien (duelsOuverts false) ; le brain ne propose ni
 *      DUEL_JOIN ni DUEL_CREATE meme avec open true. Temoin : sur les cas ou la lecture est saine (P3, P4) les gardes de sante disent « lit »
 *      (regleurLitLesDuels true) — la fermeture vient du CONTRAT, pas d une panne de lecture.
 *   B. TETE GELEE (slots, duels, rolls) : une tete qui ne depasse pas la plus haute deja lue pendant plus de 30 temps de bloc (injecte ici)
 *      -> etat DEGRADE, degrade.teteGelee + pourquoi (/sante), RIEN n est lu (ni getLogs ni eth_call) ni envoye sur cette tete ; elle repart
 *      des que la tete bouge. Bornes : 30 x 200 ms = 6000 ms (6000 non, 6001 oui) ; 30 x 2000 ms = 60 s.
 * Modules remplacables (COPIES mutees, muter-keeper-fix4-20261024.mjs) : REGLEUR_MODULE, DUELS_APP_MODULE, BRAIN_JEU_MODULE.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. Rien n est signe pour une vraie chaine, rien n est envoye hors du faux noeud.
 * NE PROUVE PAS : Base mainnet ; qu un tiers ne cree / rejoigne pas DIRECTEMENT sur le contrat (l app ne peut pas l empecher) ; un vrai noeud
 *   gele (simule ici par un eth_blockNumber fige). */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { keccak256Hex, selecteur, topic } from './keccak.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
const M = await imp(process.env.REGLEUR_MODULE || 'slots-regleur.js');
const DA = await imp(process.env.DUELS_APP_MODULE || 'duels-plan-app.js');
const J = await imp(process.env.BRAIN_JEU_MODULE || 'brain-jeu.js');
const { DUELS_DEPLOIEMENT } = await imp('duels-deploiement.js');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const cas = async (nom, f) => { console.log('— ' + nom); try { await f(); } catch (e) { ko += 1; n += 1; console.log('KO  ' + nom + ' : exception ' + String(e && e.stack || e).slice(0, 300)); } };

const CLE = '0x' + '0'.repeat(63) + '1'; /* la cle de TEST publique n 1 : rien n est signe pour une vraie chaine */
const V1 = String(DUELS_DEPLOIEMENT.adresse).toLowerCase(); /* BlockDuels LIVE, COPIEE de la fiche */
const R = '0x' + 'e0'.repeat(20), SLOTS = '0x' + 'c0'.repeat(20);
const TABLE = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000'];
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const S_DUELS = selecteur('duels(uint256)'), S_TODAY = selecteur('today()'), S_BUYERS = selecteur('buyerCount(uint32)'), S_DAYPOTS = selecteur('dayPots(uint32)');
const S_CLOSE = selecteur('closeDay(uint32)').toLowerCase(), S_SETTLE = selecteur('settle(uint256)').toLowerCase();
const T_JOINED = topic('Joined(uint256,address,uint8[5],uint256)'), T_DSETTLED = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
/* la face d un hash depuis la SPEC de BlockDuels.faceOf (ecrite ici, independante du module, comme dans le PoC de la revue) */
const faceT = (h) => { const k = keccak256Hex(Buffer.from('0x' + String(h).toLowerCase().slice(2, 42), 'utf8')); const o = (i) => parseInt(k.slice(2 + 2 * i, 4 + 2 * i), 16); const te = (o(0) * 256 + o(1)) % 361; return [Math.floor(((te + 30) % 360) / 60), o(6) % 10, o(7) % 19, o(8) % 9, o(9) % 8]; };
const packT = (g) => (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
const unpackT = (p) => [(p >> 16) & 0x0f, (p >> 12) & 0x0f, (p >> 7) & 0x1f, (p >> 3) & 0x0f, p & 0x07];

/* ---------------------------------------------------------------- le faux noeud (forme du PoC de la revue round 3, duels = V1) */
function chaine({ tete = 100000, msBloc = 200, D = V1 } = {}) {
  const ch = { D, tete, logs: [], duels: new Map(), appels: [], envoyes: [], recus: new Map(), refusDuels: false, jours: new Map(), aujourdhui: 20000, base: 1_000_000n, teteVue: null,
    ts: (b) => 1_700_000_000 + Math.floor((b * msBloc) / 1000) };
  ch.hash = (b) => '0x' + u(BigInt(b) * 7919n + 1n);
  ch.duel = (id, t, { gagnant = 'createur', mise = 1_000_000n, statut = 2, log = true } = {}) => {
    const f = faceT(ch.hash(t)), autre = f.map((x, i) => (x + 1) % [6, 10, 19, 9, 8][i]);
    const [gA, gB] = gagnant === 'createur' ? [packT(f), packT(autre)] : gagnant === 'rejoignant' ? [packT(autre), packT(f)] : [packT(autre), packT(autre)];
    ch.duels.set(String(id), { t, statut, gA, gB, mise: BigInt(mise) });
    if (log) ch.logs.push({ address: D, blockNumber: hx(t - 2), topics: [T_JOINED, '0x' + u(id), '0x' + '0'.repeat(24) + 'b2'.repeat(20)], data: '0x' + unpackT(gB).map(u).join('') + u(t) });
  };
  ch.vuParEtat = (id) => { const d = ch.duels.get(String(id)); return d ? { id: String(id), targetBlock: d.t, guessA: unpackT(d.gA), guessB: unpackT(d.gB), stake: d.mise, final: d.statut >= 3 } : null; };
  ch.jour = (d, { n: nb = 3, pot = 15_000_000n, etat = 0, t = 0 } = {}) => ch.jours.set(String(d), { n: BigInt(nb), pot: BigInt(pot), etat, t });
  ch.rpc = async (m, p) => {
    ch.appels.push([m, p]);
    switch (m) {
      case 'eth_chainId': return hx(8453);
      case 'eth_blockNumber': return hx(ch.teteVue !== null ? ch.teteVue : ch.tete);
      case 'eth_getBlockByNumber': { const b = p[0] === 'latest' ? ch.tete : parseInt(p[0], 16); if (b > ch.tete) return null; return { number: hx(b), hash: ch.hash(b), timestamp: hx(ch.ts(b)), baseFeePerGas: hx(ch.base) }; }
      case 'eth_getLogs': { const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16); return ch.logs.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a && l.address === f.address && l.topics[0] === f.topics[0]; }); }
      case 'eth_call': {
        const d = p[0].data, to = p[0].to;
        if (to === D && d.startsWith(S_DUELS)) {
          if (ch.refusDuels) throw new Error('429 Too Many Requests');
          const v = ch.duels.get(String(BigInt('0x' + d.slice(10)))) || { t: 0, statut: 0, gA: 0, gB: 0, mise: 0n };
          return '0x' + [0, 0, v.statut, v.gA, 0, v.t, v.gB, 0, v.mise].map(u).join('');
        }
        if (to === R) {
          if (d === S_TODAY) return '0x' + u(ch.aujourdhui);
          const k = String(BigInt('0x' + (d.slice(10) || '0')));
          const j = ch.jours.get(k) || { n: 0n, pot: 0n, etat: 0, t: 0 };
          if (d.startsWith(S_BUYERS)) return '0x' + u(j.n);
          if (d.startsWith(S_DAYPOTS)) return '0x' + u(j.pot) + u(j.t) + u(j.etat);
        }
        throw new Error('unexpected eth_call');
      }
      case 'eth_maxPriorityFeePerGas': return hx(1000);
      case 'eth_estimateGas': return hx(200000);
      case 'eth_getTransactionCount': return hx(5);
      case 'eth_sendRawTransaction': ch.envoyes.push(p[0]); return null;
      case 'eth_getTransactionReceipt': return ch.recus.has(p[0]) ? ch.recus.get(p[0]) : null;
      case 'eth_getTransactionByHash': return null;
      default: throw new Error('unexpected method ' + m);
    }
  };
  ch.inclureDuel = (hash, id) => { ch.duels.get(String(id)).statut = 3; ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: [{ address: D, topics: [T_DSETTLED, '0x' + u(id)], data: '0x' }] }); };
  ch.inclure = (hash) => ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: [] });
  return ch;
}
const parEtat = (ch) => ({ joints: () => [...ch.duels.keys()].map((id) => ch.vuParEtat(id)).filter((x) => x && !x.final), connu: (id) => ch.vuParEtat(id) });
const horloge = () => { const h = { t: 1_000_000 }; h.maintenant = () => h.t; h.avancer = (ms) => { h.t += ms; }; return h; };
const keeper = (ch, h, x = {}) => M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: h.maintenant, journal: () => {}, msParBloc: 200, ...x,
  duels: { contrat: ch.D, bloc: 0, ...(x.duels || {}) } });

/* la porte telle que /api/duels la sert (serveur-web.js : regleDuels = regleurCouvre(eReg, contrat, Date.now())) puis telle que l app la lit */
const lit = (e, t) => (typeof DA.regleurLitLesDuels === 'function' ? DA.regleurLitLesDuels(e, V1, t) : null);
function porte(r, t) {
  const e = r.etat();
  const couvre = DA.regleurCouvre(e, V1, t);
  const servi = { ok: true, contrat: V1, regleur: { etat: e.etat, adresse: e.adresse || null, regleDuels: couvre } };
  return { couvre, ouverts: DA.duelsOuverts(servi), lit: lit(e, t) };
}
const compte = () => ({ tours: 0, couvre: 0, ouverts: 0, lit: 0 });
const noter = (c, p) => { c.tours += 1; if (p.couvre === true) c.couvre += 1; if (p.ouverts === true) c.ouverts += 1; if (p.lit === true) c.lit += 1; };
const fermee = (c) => c.tours > 0 && c.couvre === 0 && c.ouverts === 0;
async function jouer(ch, r, h, cible, c, { pas = 50, max = 40 } = {}) {
  for (let k = 0; k < max && ch.tete + 1 <= cible + 256; k++) {
    ch.tete += pas; h.avancer(10000);
    const t = await r.tour();
    if (t.fait && t.cible === 'duels') ch.inclureDuel(t.hash, t.ids[0]);
    noter(c, porte(r, h.t));
  }
}

/* ================================================================ A. la porte des duels : FERMEE sur BlockDuels v1, cas du PoC round 3 */
vu(/^0x[0-9a-f]{40}$/.test(V1), 'l adresse de BlockDuels v1 est lue dans duels-deploiement.js : ' + V1);
for (const N of [310, 400]) {
  await cas('A.P1 famine du classement par ' + N + ' egalites a cible plus ancienne (victime inconnue du cache)', async () => {
    const ch = chaine(), h = horloge(), r = keeper(ch, h), c = compte();
    const T7 = ch.tete;
    for (let k = 0; k < N; k++) ch.duel(3000 + k, T7 - 1, { gagnant: 'egalite' });
    ch.duel(7, T7, { gagnant: 'createur', mise: 5_000_000n });
    await jouer(ch, r, h, T7, c);
    vu(fermee(c), 'N=' + N + ' : porte fermee a chaque tour (couvre ' + c.couvre + '/' + c.tours + ', servi ouvert ' + c.ouverts + '/' + c.tours + ')');
  });
}
await cas('A.P1c meme famine, liste par l etat (victime absente du cache)', async () => {
  const ch = chaine(), h = horloge(), ids = new Set(), c = compte();
  const r = keeper(ch, h, { duels: { joints: () => [...ids].map((id) => ch.vuParEtat(id)).filter(Boolean), connu: (id) => (ids.has(String(id)) ? ch.vuParEtat(id) : null) } });
  const T7 = ch.tete;
  for (let k = 0; k < 320; k++) ch.duel(3000 + k, T7 - 1, { gagnant: 'egalite' });
  ch.duel(7, T7, { gagnant: 'createur', mise: 5_000_000n });
  await jouer(ch, r, h, T7, c);
  vu(fermee(c), '320 egalites + victime inconnues du cache : porte fermee a chaque tour (couvre ' + c.couvre + '/' + c.tours + ')');
});
await cas('A.P2 tete gelee : porte fermee, et le regleur DEGRADE', async () => {
  const ch = chaine(), h = horloge(), c = compte();
  const gel = ch.tete; ch.teteVue = gel;
  const r = keeper(ch, h, { duels: parEtat(ch) });
  await r.tour();
  ch.duel(7, gel + 3, { gagnant: 'createur', mise: 5_000_000n });
  let degrades = 0;
  for (let k = 0; k < 8; k++) { ch.tete += 50; h.avancer(10000); await r.tour(); noter(c, porte(r, h.t)); if (r.etat().etat === 'DEGRADE') degrades += 1; }
  vu(fermee(c) && ch.envoyes.length === 0, 'tete vue ' + gel + ', reelle ' + ch.tete + ' : porte fermee ' + (c.tours - c.couvre) + '/' + c.tours + ', aucun envoi');
  vu(degrades === 8 && c.lit === 0, 'le regleur se dit DEGRADE a chaque tour (' + degrades + '/8) et les gardes de sante ne lisent plus (lit ' + c.lit + '/8)');
});
await cas('A.P3 gas au-dessus du plafond (1 gwei)', async () => {
  const ch = chaine(), h = horloge(), r = keeper(ch, h), c = compte();
  ch.base = 2_000_000_000n;
  const T7 = ch.tete; ch.duel(7, T7, { gagnant: 'createur', mise: 5_000_000n });
  let pq = null;
  for (let k = 0; k < 5; k++) { ch.tete += 50; h.avancer(10000); pq = (await r.tour()).pourquoi; noter(c, porte(r, h.t)); }
  vu(fermee(c) && ch.envoyes.length === 0 && /gas price above the cap/.test(String(pq)), 'gas > 1 gwei (' + pq + ') : porte fermee ' + (c.tours - c.couvre) + '/' + c.tours + ', aucun settle');
  vu(c.lit === c.tours, 'temoin : la lecture est SAINE (regleurLitLesDuels ' + c.lit + '/' + c.tours + ') — la porte est fermee par le contrat, pas par une panne');
});
await cas('A.P4 plafond horaire des duels plein', async () => {
  const ch = chaine(), h = horloge(), r = keeper(ch, h, { bornes: { txParHeure: { slots: 60, duels: 0, rolls: 12 } } }), c = compte();
  const T7 = ch.tete; ch.duel(7, T7, { gagnant: 'createur', mise: 5_000_000n });
  let pq = null;
  for (let k = 0; k < 5; k++) { ch.tete += 50; h.avancer(10000); pq = (await r.tour()).pourquoi; noter(c, porte(r, h.t)); }
  vu(fermee(c) && ch.envoyes.length === 0 && /hourly cap/.test(String(pq)), 'plafond plein (' + pq + ') : porte fermee ' + (c.tours - c.couvre) + '/' + c.tours + ', aucun settle');
  vu(c.lit === c.tours, 'temoin : lecture saine (regleurLitLesDuels ' + c.lit + '/' + c.tours + ')');
});
await cas('A.P5 duels(id) tous refuses, en-tetes servis, un duel rejoint par tour', async () => {
  const ch = chaine(), h = horloge(), c = compte();
  ch.refusDuels = true;
  const r = keeper(ch, h, { duels: parEtat(ch) });
  let id = 100;
  ch.duel(7, ch.tete + 1, { gagnant: 'createur', mise: 5_000_000n });
  for (let k = 0; k < 8; k++) { ch.duel(id++, ch.tete + 1, { gagnant: 'createur' }); ch.tete += 50; h.avancer(10000); await r.tour(); noter(c, porte(r, h.t)); }
  vu(fermee(c) && ch.envoyes.length === 0, 'statuts refuses : porte fermee ' + (c.tours - c.couvre) + '/' + c.tours + ' (la sante, elle, dit lit ' + c.lit + '/' + c.tours + ' : le defaut 2 de la revue, sans effet sur la porte)');
});
await cas('A.brain : BlockDuels v1, open true (reponse perimee ou fausse) -> ni DUEL_JOIN ni DUEL_CREATE ; DUEL_SETTLE reste', async () => {
  const T = 1761300000, W = '0x' + '1'.repeat(40), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
  const ouvert = { id: '1', creator: '0x' + '2'.repeat(40), token: USDC, stake: 1000000n, guessA: [1, 1, 1, 1, 1], expiresAt: T + 3600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false };
  const etat = (list, contract = V1) => ({ authorized: true, wallet: W, now: T, budgetUsdc: '10000000', spentUsdc: '0', balanceUsdc: '50000000', history: [], seen: [],
    rules: { rolls: false, settle: false, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0', duels: true, maxDuelStakeUsdc: '2000000', pot: false, potDailyUsdc: '0' },
    rolls: null, missions: null, skins: null, pot: null, duels: { contract, usdc: USDC, guess: [0, 1, 2, 3, 4], expiresIn: 3600, block: 1000, list, open: true } });
  const p = J.prochaineProposition(etat([ouvert])), p0 = J.prochaineProposition(etat([]));
  vu(!['DUEL_JOIN', 'DUEL_CREATE'].includes(p.kind) && !['DUEL_JOIN', 'DUEL_CREATE'].includes(p0.kind) && /new duels are closed/.test(p.why), 'v1, open true : ' + p.kind + ' / ' + p0.kind + ' (ni JOIN ni CREATE) ; pourquoi : ' + String(p.why).slice(0, 100));
  const pris = { ...ouvert, creator: W, joiner: '0x' + '3'.repeat(40), guessB: [2, 2, 2, 2, 2], targetBlock: 995 };
  vu(J.prochaineProposition(etat([pris])).kind === 'DUEL_SETTLE', 'v1 : son duel rejoint et reglable reste propose (DUEL_SETTLE)');
  vu(DA.duelsOuverts({ ok: true, contrat: V1, regleur: { etat: 'ON', regleDuels: true } }) === false, 'app : une reponse qui dit regleDuels true pour v1 n ouvre rien (duelsOuverts false)');
  vu(DA.actionsDuel(pris, null, 1000, T, false).join() === 'SETTLE' && DA.actionsDuel({ ...pris, targetBlock: 990 - 300 }, null, 1000, T, false).join() === 'REFUND', 'les duels deja en jeu gardent Settle (fenetre) puis Refund');
});
await cas('A.texte : la phrase de la carte dit la verite (fermes, pourquoi, Settle / Refund restent)', async () => {
  const s = String(DA.PHRASE_DUELS_FERMES);
  vu(/^New duels are closed/.test(s) && /in this contract/.test(s) && /joins and loses/.test(s) && /expire/.test(s) && /full refund/.test(s) && /Settle and Refund/.test(s) && !/settler|once|until/i.test(s) && s.length <= 160,
    '« ' + s + ' » (' + s.length + ' car.)');
});

/* ================================================================ B. tete gelee : DEGRADE, rien lu ni envoye sur elle */
const lectures = (ch, depuis) => ch.appels.slice(depuis).map(([m]) => m).filter((m) => m !== 'eth_blockNumber');
await cas('B1. duels : tete gelee -> rien n est lu ni envoye ; la tete bouge -> le settle part', async () => {
  const ch = chaine(), h = horloge();
  const r = keeper(ch, h, { duels: parEtat(ch) });
  const H = ch.tete;
  const t1 = await r.tour();
  vu(t1.fait === false && r.etat().etat === 'ON', 'tour 1 (tete ' + H + ', rien a regler) : ON (' + t1.pourquoi + ')');
  ch.duel(7, H - 20, { gagnant: 'createur', mise: 5_000_000n }); /* pret : cible + 16 <= tete, dans la fenetre */
  h.avancer(10000);
  const k0 = ch.appels.length;
  const t2 = await r.tour();
  const e2 = r.etat();
  vu(t2.fait === false && ch.envoyes.length === 0, 'tour 2 (meme tete ' + H + ', 10 s plus tard) : RIEN envoye (' + t2.pourquoi + ')');
  vu(lectures(ch, k0).length === 0, 'tour 2 : aucune lecture sur la tete gelee (appels hors eth_blockNumber : ' + JSON.stringify(lectures(ch, k0)) + ')');
  vu(e2.etat === 'DEGRADE' && e2.degrade && e2.degrade.teteGelee && e2.degrade.teteGelee.tete === H && e2.degrade.teteGelee.seuilMs === 6000 && /has not moved past block 100000/.test(e2.degrade.pourquoi) && /nothing is sent/.test(e2.degrade.pourquoi),
    '/sante : etat ' + e2.etat + ', degrade.pourquoi « ' + (e2.degrade && e2.degrade.pourquoi) + ' »');
  vu(e2.compteurs.toursTeteGelee === 1 && e2.erreurs.some((x) => /has not moved/.test(x.quoi)), 'compteurs.toursTeteGelee 1 ; la raison est dans les erreurs publiees');
  h.avancer(10000); await r.tour();
  vu(r.etat().compteurs.toursTeteGelee === 2 && r.etat().erreurs.filter((x) => /has not moved/.test(x.quoi)).length === 1, 'toujours gelee : compte 2, la raison n est journalisee qu UNE fois');
  ch.tete = H + 50; h.avancer(10000);
  const t3 = await r.tour();
  vu(t3.fait === true && t3.cible === 'duels' && t3.ids[0] === '7' && r.etat().etat === 'ON' && r.etat().degrade === null, 'la tete bouge (' + (H + 50) + ') : le settle du duel 7 part, etat ON, degrade null');
});
await cas('B2. rolls : tete gelee -> pas de closeDay ; la tete bouge -> closeDay part', async () => {
  const ch = chaine(), h = horloge();
  const r = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: h.maintenant, journal: () => {}, msParBloc: 200, rolls: { contrat: R } });
  await r.tour();
  ch.jour(ch.aujourdhui - 1, { n: 3, etat: 0 });
  h.avancer(10000);
  const k0 = ch.appels.length;
  const t2 = await r.tour();
  vu(t2.fait === false && ch.envoyes.length === 0 && lectures(ch, k0).length === 0 && r.etat().etat === 'DEGRADE', 'meme tete 10 s plus tard : rien lu, rien envoye, DEGRADE (' + t2.pourquoi + ')');
  ch.tete += 50; h.avancer(10000);
  const t3 = await r.tour();
  vu(t3.fait === true && t3.cible === 'rolls' && t3.quoi === 'closeDay' && r.etat().etat === 'ON', 'la tete bouge : closeDay(' + t3.ids + ') part, ON');
});
await cas('B3. slots : sur la tete gelee, aucun getLogs des Spun (rien lu)', async () => {
  const ch = chaine(), h = horloge();
  const r = M.creerRegleur({ cle: CLE, contrat: SLOTS, table: TABLE, blocDeploiement: 99000, chainId: 8453, rpc: ch.rpc, maintenant: h.maintenant, journal: () => {}, msParBloc: 200 });
  const kA = ch.appels.length; await r.tour();
  const lusA = ch.appels.slice(kA).filter(([m, p]) => m === 'eth_getLogs' && p[0].address === SLOTS).length;
  h.avancer(10000);
  const k0 = ch.appels.length; const t2 = await r.tour();
  const lus = ch.appels.slice(k0).filter(([m]) => m === 'eth_getLogs').length;
  vu(lusA === 1 && lus === 0 && r.etat().etat === 'DEGRADE' && /has not moved/.test(String(t2.pourquoi)), 'temoin tour 1 : ' + lusA + ' getLogs des slots ; tete gelee : ' + lus + ' getLogs, DEGRADE');
});
await cas('B4. le seuil : 30 temps de bloc (injectes), strictement', async () => {
  const etatApres = async (msBloc, ms, bouge = 0) => {
    const ch = chaine(), h = horloge();
    const r = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: h.maintenant, journal: () => {}, msParBloc: msBloc, rolls: { contrat: R } });
    await r.tour(); h.avancer(ms); ch.tete += bouge; await r.tour(); return r.etat().etat;
  };
  const a = await etatApres(200, 6000), b = await etatApres(200, 6001), c = await etatApres(2000, 59000), d = await etatApres(2000, 61000), e = await etatApres(200, 600000, 1);
  vu(a === 'ON' && b === 'DEGRADE', '200 ms/bloc : 6000 ms sans bouger -> ' + a + ' ; 6001 ms -> ' + b);
  vu(c === 'ON' && d === 'DEGRADE', '2000 ms/bloc : 59 s -> ' + c + ' ; 61 s -> ' + d + ' (le seuil suit le temps de bloc)');
  vu(e === 'ON', 'une tete qui a bouge d UN bloc, meme 10 min plus tard : ON (' + e + ')');
  /* une tete qui RECULE (un autre noeud, en retard) ne compte pas comme un mouvement */
  const ch = chaine(), h = horloge();
  const r = M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: ch.rpc, maintenant: h.maintenant, journal: () => {}, msParBloc: 200, rolls: { contrat: R } });
  await r.tour(); ch.teteVue = ch.tete - 3; h.avancer(10000); await r.tour();
  vu(r.etat().etat === 'DEGRADE' && r.etat().degrade.teteGelee.tete === 100000 && r.etat().degrade.teteGelee.lue === 99997, 'une tete qui recule (99997 apres 100000) pendant 10 s : DEGRADE (plus haute 100000, lue 99997)');
});

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS Base mainnet, un vrai noeud gele, un create / join direct sur le contrat');
process.exitCode = ko ? 1 : 0;
