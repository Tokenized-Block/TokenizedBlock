/* test-holders-rejeu-reprise-20261026.mjs — LE REJEU DES DETENTEURS (/api/holders) FINIT MALGRE UN NOEUD QUI LIMITE ; IL RESTE FERME SINON.
 *
 * Mesure prod (game56) : /api/holders/<UNIT> reste NON_LU — le noeud refuse au-dela de ~138 fenetres eth_getLogs, la passe (ATOMIQUE :
 *   une fenetre ratee la jette en entier) repart de zero a chaque tour et ne finit jamais depuis la creation d UNIT (bloc 52 694 118).
 * Le correctif (soldes-jeton.js, passeIncrementale — la passe des holders) : fenetres plus petites (PAS_HOLDERS, 1 000 blocs au lieu de
 *   2 000) ; une fenetre refusee est RELUE avec une attente exponentielle ; « range too large » / limite de debit DIVISENT la fenetre par
 *   deux ; un refus de budget d archive (certain jusqu a 00:00 UTC) arrete la passe sans relire. Aucune fenetre n est sautee ni lue deux
 *   fois ; une passe qui ne peut pas finir n est toujours PAS publiee (curseur, soldes et compteur inchanges -> la route dit NON_LU).
 * Cas :
 *   M1 defaut : la premiere fenetre de la passe fait au plus 1 000 blocs.
 *   M2 noeud qui refuse > 400 blocs ET limite (429 toutes les 138 requetes) ET rend une fois `null` : passe COMPLETE de 52 694 118 a la
 *      tete, soldes = la verite (aucun Transfer compte deux fois), fenetres contigues sans trou ni recouvrement, attentes exponentielles.
 *   M3 noeud qui limite TOUJOURS : rien publie, curseur null, soldes intacts, ratees > 0 ; la passe s ARRETE (appels bornes).
 *   M4 refus de budget d archive : aucune relecture, rien publie.
 *   M5 rejouerTransferts SANS option (soldesAuBloc, boucle-pot) : comportement d avant (pas de relecture).
 *   S1 serveur-web.js (tranche reconstruireHolders + holdersCorps executee) : noeud qui limite -> la passe finit, la route ne dit plus NON_LU.
 *   S2 serveur-web.js : noeud qui refuse toute fenetre (budget) -> la route dit NON_LU, jamais une liste.
 * ⛔ PORTABLE LF/CRLF : les fins de fonction sont cherchees avec \r?\n ; les extractions levent si elles ne trouvent rien.
 * ⛔ BORNE : noeud simule. La limite reelle du noeud de prod n est pas reproduite ici (sonde lecture seule a part). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as S from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';

const { TOPIC_TRANSFER, ADRESSE_ZERO, passeIncrementale, rejouerTransferts } = S;
let n = 0;
const rates = [];
const cas = async (titre, f) => { n++; try { await f(); console.log('  ok  ' + titre); } catch (e) { rates.push(titre); console.error('  x  ' + titre + '\n      ' + String(e && e.message).split(/\r?\n/)[0]); } };

const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const CREATION = 52694118;
const TETE = 53119875;                 /* eth_blockNumber lu le 2026-10-26 (mainnet.base.org, lecture seule) */
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
const mot = (a) => '0x' + String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hx = (b) => '0x' + b.toString(16);
const log = (bloc, de, vers, v) => ({ blockNumber: hx(bloc), topics: [TOPIC_TRANSFER, mot(de), mot(vers)], data: mot(v.toString(16)) });

/* l histoire d UNIT simulee : un mint a la creation, puis des transferts etales jusqu a la tete */
const HIST = [log(CREATION, ADRESSE_ZERO, A, 1000000n)];
for (let i = 1; i <= 60; i++) HIST.push(log(CREATION + i * 7001, A, i % 2 ? B : C, BigInt(i)));
HIST.push(log(TETE, B, C, 3n));
const VERITE = new Map();
for (const l of HIST) {
  const de = '0x' + l.topics[1].slice(26), vers = '0x' + l.topics[2].slice(26), v = BigInt(l.data);
  if (de !== ADRESSE_ZERO) VERITE.set(de, (VERITE.get(de) || 0n) - v);
  if (vers !== ADRESSE_ZERO) VERITE.set(vers, (VERITE.get(vers) || 0n) + v);
}

/** noeud simule : `refus(de, a, k, mintSeul)` rend une Error a lever, `null` a rendre (non-liste), ou undefined (sert la fenetre) */
function noeud(refus = () => undefined) {
  const fenetres = [], servies = [];
  let k = 0;
  const rpc = async (methode, params) => {
    if (methode === 'eth_blockNumber') return hx(TETE);
    if (methode === 'eth_call') return mot(1000000n.toString(16));
    if (methode === 'eth_getTransactionReceipt' || methode === 'eth_getTransactionByHash') return null;
    if (methode !== 'eth_getLogs') throw new Error('appel non simule : ' + methode);
    const p = params[0];
    const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
    const mintSeul = (p.topics || []).length > 1;
    k += 1; fenetres.push([de, a]);
    const r = refus(de, a, k, mintSeul);
    if (r instanceof Error) throw r;
    if (r === null) return null;
    const logs = HIST.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a && (!mintSeul || l.topics[1] === mot(ADRESSE_ZERO)); });
    if (!mintSeul) servies.push([de, a]);
    return logs;
  };
  rpc.fenetres = fenetres; rpc.servies = servies;
  return rpc;
}
/* le noeud de la mesure : > 400 blocs « range too large », 429 deux fois toutes les 138 requetes, une fois `null` */
const noeudDeProd = () => {
  let throttle = 0, nul = false;
  return noeud((de, a, k) => {
    if (a - de + 1 > 400) return new Error('block range too large (max 400)');
    if (k % 138 === 0) throttle = 2;
    if (throttle > 0) { throttle -= 1; return new Error('429 Too Many Requests: request limit reached'); }
    if (!nul && de > CREATION + 200000) { nul = true; return null; }
    return undefined;
  });
};
const attentes = () => { const a = []; const f = async (ms) => { a.push(ms); }; f.vues = a; return f; };
const egalesALaVerite = (soldes) => {
  for (const [adr, v] of VERITE) assert.equal(soldes.get(adr), v, 'solde de ' + adr + ' : ' + soldes.get(adr) + ' au lieu de ' + v);
  for (const [adr, v] of soldes) if (v !== 0n) assert.ok(VERITE.has(adr), 'adresse inventee ' + adr);
};
const contigues = (servies, de, a) => {
  const t = [...servies].sort((x, y) => x[0] - y[0]);
  assert.equal(t[0][0], de, 'premiere fenetre servie ' + t[0][0]);
  for (let i = 1; i < t.length; i++) assert.equal(t[i][0], t[i - 1][1] + 1, 'trou ou recouvrement entre ' + t[i - 1] + ' et ' + t[i]);
  assert.equal(t[t.length - 1][1], a, 'derniere fenetre servie ' + t[t.length - 1][1]);
};

await cas('M1 defaut : la premiere fenetre de la passe des holders fait au plus 1 000 blocs', async () => {
  const rpc = noeud();
  const etat = { soldes: new Map(), jusqua: null, ratees: 0 };
  await passeIncrementale({ rpc, jeton: UNIT, etat, naissance: CREATION, fin: CREATION + 5000, attendre: attentes() });
  const [de, a] = rpc.fenetres[0];
  assert.ok(a - de + 1 <= 1000, 'premiere fenetre : ' + (a - de + 1) + ' blocs');
});
await cas('M2 noeud de la mesure (> 400 refuse, 429 toutes les 138, un null) : passe COMPLETE depuis 52 694 118, soldes = verite', async () => {
  const rpc = noeudDeProd(), att = attentes();
  const etat = { soldes: new Map(), jusqua: null, ratees: 0 };
  const r = await passeIncrementale({ rpc, jeton: UNIT, etat, naissance: CREATION, fin: TETE, attendre: att });
  console.log('      ' + rpc.fenetres.length + ' requetes, ' + rpc.servies.length + ' fenetres servies, attentes ' + JSON.stringify(att.vues.slice(0, 6)));
  assert.equal(r.publie, true, JSON.stringify(r));
  assert.equal(etat.jusqua, TETE); assert.equal(etat.ratees, 0);
  egalesALaVerite(etat.soldes);
  contigues(rpc.servies, CREATION, TETE);
  assert.ok(rpc.fenetres.length > 138, 'le noeud a bien limite au-dela de 138 requetes');
  assert.ok(att.vues.length >= 2, 'attentes : ' + att.vues.length);
});
await cas('M2b attente EXPONENTIELLE : relectures successives d une meme fenetre = 2x la precedente', async () => {
  let refus = 3;
  const rpc = noeud(() => (refus-- > 0 ? new Error('503 upstream busy') : undefined)), att = attentes();
  const etat = { soldes: new Map(), jusqua: null, ratees: 0 };
  const r = await passeIncrementale({ rpc, jeton: UNIT, etat, naissance: CREATION, fin: CREATION + 999, attendre: att });
  assert.equal(r.publie, true, JSON.stringify(r));
  assert.equal(att.vues.length, 3, JSON.stringify(att.vues));
  assert.ok(att.vues[0] > 0 && att.vues[1] === 2 * att.vues[0] && att.vues[2] === 2 * att.vues[1], JSON.stringify(att.vues));
});
await cas('M3 noeud qui limite TOUJOURS : rien publie, curseur null, soldes intacts, ratees > 0, et la passe S ARRETE', async () => {
  const rpc = noeud(() => new Error('429 Too Many Requests: request limit reached')), att = attentes();
  const avant = new Map([[A, 5n]]);
  const etat = { soldes: avant, jusqua: null, ratees: 0 };
  const r = await passeIncrementale({ rpc, jeton: UNIT, etat, naissance: CREATION, fin: TETE, attendre: att });
  assert.equal(r.publie, false); assert.equal(etat.jusqua, null); assert.ok(etat.ratees > 0, 'ratees ' + etat.ratees);
  assert.equal(etat.soldes, avant); assert.equal(etat.soldes.get(A), 5n);
  assert.ok(rpc.fenetres.length <= 20, 'la passe continue apres une fenetre perdue : ' + rpc.fenetres.length + ' requetes');
});
await cas('M4 refus de budget d archive : aucune relecture, rien publie', async () => {
  const rpc = noeud(() => new Error('archive node daily budget reached: 3000 calls today (primary node: request limit reached)')), att = attentes();
  const etat = { soldes: new Map(), jusqua: null, ratees: 0 };
  const r = await passeIncrementale({ rpc, jeton: UNIT, etat, naissance: CREATION, fin: TETE, attendre: att });
  assert.equal(r.publie, false); assert.equal(etat.jusqua, null); assert.ok(etat.ratees > 0);
  assert.equal(rpc.fenetres.length, 1, 'requetes : ' + rpc.fenetres.length); assert.equal(att.vues.length, 0);
});
await cas('M5 rejouerTransferts sans option (soldesAuBloc, boucle-pot) : une fenetre refusee n est pas relue (comportement d avant)', async () => {
  let k = 0;
  const rpc = noeud(() => (++k === 1 ? new Error('503 upstream busy') : undefined));
  const r = await rejouerTransferts({ rpc, jeton: UNIT, deBloc: CREATION, aBloc: CREATION + 3999, soldes: new Map(), pas: 2000 });
  assert.equal(r.ratees, 1); assert.equal(rpc.fenetres.length, 2);
});

/* ── S : la tranche livree de serveur-web.js, executee (meme harnais que test-holders-creation-routeur-20261026.mjs) ── */
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const entre = (debut, fin) => {
  const i = src.indexOf(debut); assert.ok(i > 0, 'ancre introuvable : ' + debut);
  const m = fin.exec(src.slice(i)); assert.ok(m, 'fin introuvable apres ' + debut);
  const t = src.slice(i, i + m.index + m[0].length);
  assert.ok(t.length > 200, 'extraction suspecte : ' + debut);
  return t;
};
const tranche = entre('async function reconstruireHolders(jeton) {', /\r?\n\}\r?\n/) + '\n' + entre('async function holdersCorps(jeton) {', /\r?\n\}\r?\n/);
function monter(rpc) {
  const cache = new Map();
  const PARAMS = ['rpcServeur', 'holdersCache', 'HOLDERS_MAX', 'lireNaissance', 'passeIncrementale', 'ecrireHolders', 'apprendreCreationAction',
    'apprendreCreationRouteur', 'naissanceDouteuse', 'oublierNaissance', 'debutRechercheNaissance', 'verifierSomme', 'soldesNegatifs', 'partsHolders', 'POT_FICTIF'];
  const f = new Function(...PARAMS, '"use strict";\n' + tranche + '\n; return { reconstruireHolders, holdersCorps };');
  const m = f(rpc, cache, 200, S.lireNaissance, S.passeIncrementale, () => {}, async () => {}, async () => {}, () => false, () => {}, () => CREATION,
    S.verifierSomme, S.soldesNegatifs, partsHolders, 10n ** 6n);
  assert.equal(typeof m.reconstruireHolders, 'function'); assert.equal(typeof m.holdersCorps, 'function');
  m.cache = cache;
  return m;
}
await cas('S1 serveur : noeud qui limite toutes les 138 requetes -> la passe depuis 52 694 118 finit, /api/holders ne dit plus NON_LU', async () => {
  let throttle = 0;
  const rpc = noeud((de, a, k) => { if (k % 138 === 0) throttle = 1; if (throttle > 0) { throttle -= 1; return new Error('request limit reached'); } return undefined; });
  const m = monter(rpc);
  const e = await m.reconstruireHolders(UNIT);
  assert.equal(e.naissance, CREATION); assert.equal(e.jusqua, TETE, 'jusqua ' + e.jusqua + ', ratees ' + e.ratees); assert.equal(e.ratees, 0);
  egalesALaVerite(e.soldes);
  const corps = JSON.parse(await m.holdersCorps(UNIT));
  assert.notEqual(corps.etat, 'NON_LU', corps.pourquoi); assert.notEqual(corps.etat, 'INCOMPLET', corps.pourquoi);
  assert.ok(Array.isArray(corps.detenteurs) && corps.detenteurs.length > 0, JSON.stringify(corps).slice(0, 200));
});
await cas('S2 serveur : noeud qui refuse toute fenetre de rejeu (budget) -> NON_LU, aucune liste servie', async () => {
  const rpc = noeud((de, a, k, mintSeul) => (mintSeul ? undefined : new Error('archive node daily budget reached: 3000 calls today')));
  const m = monter(rpc);
  const e = await m.reconstruireHolders(UNIT);
  assert.equal(e.jusqua, null); assert.ok(e.ratees > 0);
  const corps = JSON.parse(await m.holdersCorps(UNIT));
  assert.equal(corps.etat, 'NON_LU', JSON.stringify(corps).slice(0, 200)); assert.equal(corps.detenteurs, undefined);
});

console.log((rates.length ? 'ROUGE ' : 'ok ') + 'holders-rejeu-reprise - ' + (n - rates.length) + '/' + n
  + ' ; NE PROUVE PAS la limite reelle du noeud de prod (simulee)');
if (rates.length) process.exit(1);
