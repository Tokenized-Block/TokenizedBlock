/* test-liquidite-mutants-20261025.mjs — LES TROIS MUTANTS QUI SURVIVAIENT A LA SERIE (revue de 203fcd7), ET LA PHRASE NFLXc.
 *
 * ⛔ Pourquoi ce fichier : la revue a mute le code et la SERIE est restee verte trois fois. Le seul garde de M4 etait le banc fork
 *   `banc-liquidite-vente-fork-20261025.mjs`, que la serie ne lance pas. Chaque cas ci-dessous a ete vu ROUGE sur une copie mutee.
 *   M1 la quantite de profondeur (coterVenueCL) dans le MAUVAIS sens de prix : la chaine fictive d avant cotait a 1:1 (sqrtP = 2^96),
 *      ou les deux sens donnent le meme chiffre. Ici le prix n est pas 1:1, et l action est tour a tour token1 puis token0.
 *   M4 l ecran nomme 'aero-new' alors que la vente passe par NOTRE routeur (0x698c…) : l ecran doit nommer EXACTEMENT le lieu du
 *      routeur que le swap du plan appelle (forme NOKc : 'aero-new' ne passe pas, la vente part par notre routeur).
 *   M6 un devis de vente NON LU envoie la vente a 'aero-new' : la regle « les deux devis lus » n etait pas testee.
 *   NFLXc l ecran disait « does not pass this app’s liquidity rules » d un lieu ou l app n a simplement PAS de chemin de vente
 *      (l action n est pas dans la table Aerodrome) — alors que le serveur juge notre route achetable.
 * Hors reseau : chaine fictive en memoire. ⚠️ NE PROUVE PAS mainnet (la mesure) ni l execution (le banc fork). */
import assert from 'node:assert/strict';
import * as L from './liquidite-actions.js';
import { FACTORY_AERODROME_CL, ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { USDC_BASE } from './frais-creation.js';
import { planRail } from './rails-api.js';
import { selecteur } from './keccak.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

let n = 0; const rouges = [];
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ✓ ' + t); } catch (e) { rouges.push(t); console.error('✗ ' + t + '\n    ' + String((e && e.message) || e).split('\n')[0]); } };
const bas = (x) => String(x).toLowerCase();
const U = bas(USDC_BASE);
const AMZN = '0xb200000000000000000000d9192b6b456483c2e8'; /* AMZNc : dans la table Aerodrome */
const AVGO = '0xb200000000000000000000fc737aea6196ab5a4c'; /* AVGOc : HORS table (la forme NFLXc) */
const COMPTE = '0x1000000000000000000000000000000000000c0c';
const POOL_N = '0x086a1447d0851f0aea9d09d6c547fec8e97be413';
const POOL_O = bas(POOLS_ACTIONS_AERODROME.get(AMZN).pool);
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const Q96 = 1n << 96n;
const vieille = bas(FACTORY_AERODROME_CL).slice(2);
const CODE_Q = '0x' + '60'.repeat(600) + vieille + '5b'.repeat(40) + vieille + '5b'.repeat(40) + vieille + '00'.repeat(40);
assert.ok(BigInt(U) < BigInt(AMZN) && BigInt(U) < BigInt(AVGO), 'USDC est token0 face aux actions b2…');
assert.ok(!POOLS_ACTIONS_AERODROME.has(AVGO), 'AVGOc est hors table');

/* ── M1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/* une pool CL fictive a un prix NON 1:1 : sqrtP = 10 * 2^96 -> token1/token0 = 100 en unites brutes. Le quoter rend le prix moyen
 * moins 5 bps (achat) / 10 bps (vente), dans le sens que la pool impose. */
function appelPoolCL({ action, usdcEst0 }) {
  const sqrtP = 10n * Q96;
  const versToken1 = (m) => m * 100n, versToken0 = (m) => m / 100n;
  return async (to, data) => {
    if (bas(to) === L.FACTORY_AERO_NOUVELLE) return /0{63}a$/.test(data) ? w(BigInt(POOL_N)) : w(0n);
    if (bas(to) === U && data.startsWith(selecteur('balanceOf(address)'))) return w(500_000_000_000n);
    if (bas(to) === POOL_N && data === selecteur('liquidity()')) return w(10n ** 15n);
    if (bas(to) === POOL_N && data === selecteur('slot0()')) return w(sqrtP) + '0'.repeat(64 * 6);
    if (bas(to) === QUOTEUR_AERODROME_CL) {
      const tin = '0x' + data.slice(10 + 24, 10 + 64), m = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      const entreeEst0 = tin === U ? usdcEst0 : !usdcEst0;
      const mid = entreeEst0 ? versToken1(m) : versToken0(m);
      return w((mid * (tin === U ? 9995n : 9990n)) / 10000n);
    }
    throw new Error('execution reverted ' + to + ' ' + action);
  };
}
await cas('M1 la quantite de profondeur suit le SENS du prix (prix 100:1, l action en token1 puis en token0)', async () => {
  /* USDC token0 (vraies actions b2…) : 10 000 USDC valent 10 000e6 * 100 unites d action */
  const c1 = await L.coterVenueCL({ appel: appelPoolCL({ action: AVGO, usdcEst0: true }), venue: 'aero-new', adr: AVGO });
  const p1 = c1.pools.find((x) => x.pool === POOL_N);
  assert.equal(p1.quantiteProfondeur, L.REGLES.usdcMin * 100n, 'USDC token0 : quantite = usdcMin * prix (' + p1.quantiteProfondeur + ')');
  assert.equal(p1.usdcUtilisable, (L.REGLES.usdcMin * 9990n) / 10000n, 'la vente de cette quantite rend ~10 000 USDC');
  assert.equal(L.verdictVenue(c1).passe, true, 'la pool profonde passe (' + L.verdictVenue(c1).code + ')');
  /* l action en token0 (adresse sous USDC) : 1 unite d action = 100 unites USDC, la quantite est usdcMin / 100 */
  const BAS = '0x0100000000000000000000000000000000000b20';
  const c0 = await L.coterVenueCL({ appel: appelPoolCL({ action: BAS, usdcEst0: false }), venue: 'aero-new', adr: BAS });
  const p0 = c0.pools.find((x) => x.pool === POOL_N);
  assert.equal(p0.quantiteProfondeur, L.REGLES.usdcMin / 100n, 'action token0 : quantite = usdcMin / prix (' + p0.quantiteProfondeur + ')');
  assert.equal(p0.usdcUtilisable, (L.REGLES.usdcMin * 9990n) / 10000n);
  assert.equal(L.verdictVenue(c0).passe, true, 'action token0 : passe (' + L.verdictVenue(c0).code + ')');
});

/* ── LA CHAINE FICTIVE OU LES DEUX ROUTEURS BATISSENT UN PLAN PRET ─────────────────────────────────────────────────────── */
/* notre factory rend la pool de la table (pinned) ; slot0 1:1 ; eth_simulateV1 passe (notre routeur) ; eth_call `from` passe ('aero-new').
 * Devis du quoter AVEC override = 'aero-new', SANS = notre routeur ; `neuve`/`ancienne` = null -> ce devis est illisible. */
function chaine({ neuve = (m) => (m * 999n) / 1000n, ancienne = (m) => (m * 990n) / 1000n, poolAncienne = POOL_O } = {}) {
  const rpc = async (methode, params) => {
    if (methode === 'eth_getCode') return CODE_Q;
    if (methode === 'eth_simulateV1') return [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1', returnData: '0x' })) }];
    if (methode !== 'eth_call') throw new Error('unexpected ' + methode);
    const { to, data, from } = params[0];
    if (bas(to) === QUOTEUR_AERODROME_CL) {
      const m = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      const f = params[2] && params[2][QUOTEUR_AERODROME_CL] ? neuve : ancienne;
      if (!f) throw new Error('rate limited');
      return w(f(m));
    }
    if (bas(to) === bas(FACTORY_AERODROME_CL)) return w(BigInt(poolAncienne));
    if (bas(to) === poolAncienne && data === selecteur('token0()')) return w(BigInt(U));
    if ((bas(to) === POOL_N || bas(to) === poolAncienne) && data === selecteur('slot0()')) return w(Q96) + '0'.repeat(64 * 6);
    if (data.startsWith(selecteur('balanceOf(address)'))) return w(10n ** 18n);
    if (data.startsWith(selecteur('allowance(address,address)'))) return w(10n ** 18n);
    if (data === selecteur('decimals()')) return w(8);
    if (from && bas(to) === L.ROUTEUR_AERO_NOUVEAU) return '0x';
    throw new Error('execution reverted');
  };
  return { rpc };
}
const NEUVE = { venue: 'aero-new', passe: true, code: null, pool: POOL_N, tickSpacing: 10, achat: '3096137' };
const NEUVE_KO = { ...NEUVE, passe: false, code: 'LIQUIDITE_SOUS_SEUIL' };
const routeDe = (x = {}) => ({ achetable: true, pool: POOL_O, tickSpacing: 10, achat: '3000000', meilleure: 'aero-old', venues: { 'aero-new': NEUVE }, ...x });
const ref = async () => ({ reference: { etat: 'LU', prixUsd: 100, source: 'chainlink' } });
const vendre = (action, route, c) => planRail({ de: action, vers: U, montant: '200000000', compte: COMPTE },
  { rpc: c.rpc, chaine: 8453, maintenant: 1_000_000_000, venueAction: () => route, reference: ref });
/* le lieu du routeur que le SWAP du plan appelle (la derniere etape : l approbation, si elle y est, vient avant) */
const LIEU_DU_ROUTEUR = { [bas(ROUTEUR_AERODROME_CL)]: 'aero-old', [bas(L.ROUTEUR_AERO_NOUVEAU)]: 'aero-new' };
function lieuDuSwap(plan) {
  const etapes = plan.tx ? [plan.tx] : (plan.appels || plan.etapes || []);
  const swap = etapes[etapes.length - 1];
  assert.ok(swap && swap.to, 'le plan porte un swap');
  const lieu = LIEU_DU_ROUTEUR[bas(swap.to)];
  assert.ok(lieu, 'le swap appelle un routeur connu (' + swap.to + ')');
  return lieu;
}
function ecranNommeLeSwap(plan, attendu) {
  assert.equal(plan.etat, 'PRET', plan.pourquoi);
  const lieu = lieuDuSwap(plan);
  assert.equal(lieu, attendu, 'le swap part par ' + lieu);
  assert.ok(plan.vente && plan.vente.texte, 'la vente comparee est a l ecran');
  assert.equal(plan.vente.ici, lieu, 'l ecran nomme ' + plan.vente.ici + ' mais le swap appelle ' + lieu);
  assert.ok(plan.vente.texte.startsWith('Selling through ' + L.VENUES[lieu].libelle + ','), plan.vente.texte);
}

await cas('M4 forme NOKc : la nouvelle factory ne passe pas, la vente part par NOTRE routeur, et l ecran nomme notre routeur', async () => {
  const p = await vendre(AMZN, routeDe({ venues: { 'aero-new': NEUVE_KO } }), chaine());
  ecranNommeLeSwap(p, 'aero-old');
  /* elle cote plus mais ne passe pas : dit tel quel */
  assert.match(p.vente.texte, /Aerodrome \(newer pool factory\) quotes more \(\$99\.90\) but does not pass this app’s liquidity rules\./, p.vente.texte);
});

await cas('M4 les deux passent : l ecran nomme toujours le routeur que le swap appelle (notre routeur paie plus, puis la nouvelle)', async () => {
  const a = await vendre(AMZN, routeDe({ meilleure: 'aero-new' }), chaine({ neuve: (m) => (m * 990n) / 1000n, ancienne: (m) => (m * 999n) / 1000n }));
  ecranNommeLeSwap(a, 'aero-old');
  assert.equal(a.vente.choix, 'USUELLE_PAIE_AUTANT');
  const b = await vendre(AMZN, routeDe(), chaine());
  ecranNommeLeSwap(b, 'aero-new');
  assert.equal(b.vente.choix, 'PAIE_PLUS');
});

/* ── M6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
await cas('M6 un devis de vente NON LU n envoie jamais la vente a la nouvelle factory', async () => {
  const route = routeDe();
  for (const ventes of [[{ venue: 'aero-new', usdc: '199800000' }], [{ venue: 'aero-old', usdc: '198000000' }], [],
    [{ venue: 'aero-new', usdc: '199800000' }, { venue: 'aero-old', usdc: 'x' }]]) {
    const c = L.choisirVenteVenue({ route, ventes, existante: 'aero-old' });
    assert.equal(c.venue, 'aero-old', JSON.stringify(ventes) + ' -> ' + c.venue);
    assert.equal(c.raison, 'NON_COMPARE');
    assert.equal(c.verdict, undefined, 'aucun verdict neuf porte');
  }
  /* de bout en bout : le devis de notre routeur est illisible (le noeud refuse) -> la vente ne part PAS par la nouvelle factory */
  const p = await planRail({ de: AMZN, vers: U, montant: '200000000', compte: COMPTE }, { rpc: chaine({ ancienne: null }).rpc, chaine: 8453, maintenant: 1_000_000_000, venueAction: () => route });
  assert.notEqual(p.venue, 'aero-new', 'la vente est partie par la nouvelle factory sur un devis non lu');
  assert.notEqual(p.via, 'planVenueNeuve');
});

/* ── NFLXc ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
await cas('NFLXc : « pas dans la table Aerodrome de cette app » n est pas « ne passe pas les regles »', async () => {
  /* l action est hors table : notre route est achetable, mais cette app n a aucun chemin de vente par notre routeur */
  const lx = L.lieuxVente({ route: routeDe(), existante: 'uniswap-v4' });
  assert.deepEqual(lx, { passants: ['aero-new'], sansChemin: ['aero-old'] });
  assert.deepEqual(L.lieuxVente({ route: routeDe(), existante: 'aero-old' }), { passants: ['aero-old', 'aero-new'], sansChemin: [] });
  assert.deepEqual(L.lieuxVente({ route: routeDe({ achetable: false }), existante: 'aero-old' }).sansChemin, [], 'en table, refuse = les regles');
  const ventes = [{ venue: 'aero-old', prixUsd: 68.24 }, { venue: 'aero-new', prixUsd: 68.23 }];
  const p = L.phraseVente({ ventes, ici: 'aero-new', ...lx });
  assert.match(p.texte, /^Selling through Aerodrome \(newer pool factory\), about \$68\.23 per token\. Aerodrome \(this app’s router\) quotes more \(\$68\.24\) but this stock is not in this app’s Aerodrome table, so this app has no sale path there\./, p.texte);
  assert.doesNotMatch(p.texte, /liquidity rules/);
  /* en table et refusee par ses regles : la phrase des regles, inchangee */
  const r = L.phraseVente({ ventes, ici: 'aero-new', ...L.lieuxVente({ route: routeDe({ achetable: false }), existante: 'aero-old' }) });
  assert.match(r.texte, /Aerodrome \(this app’s router\) quotes more \(\$68\.24\) but does not pass this app’s liquidity rules\./, r.texte);
  /* de bout en bout, a l ecran : AVGOc (hors table), notre route achetable et cotant plus, la vente part par la nouvelle factory */
  const e = await vendre(AVGO, routeDe(), chaine({ neuve: (m) => (m * 990n) / 1000n, ancienne: (m) => (m * 999n) / 1000n }));
  ecranNommeLeSwap(e, 'aero-new');
  assert.match(e.vente.texte, /Aerodrome \(this app’s router\) quotes more \(\$99\.90\) but this stock is not in this app’s Aerodrome table, so this app has no sale path there\./, e.vente.texte);
  assert.doesNotMatch(e.vente.texte, /liquidity rules/);
});

if (rouges.length) { console.error('✗ test-liquidite-mutants-20261025 : ' + rouges.length + ' rouge(s) sur ' + n + ' cas'); process.exitCode = 1; }
else console.log('✓ test-liquidite-mutants-20261025 : ' + n + ' cas');
console.log('   M1 profondeur dans le sens du prix (100:1, deux sens) ; M4 l ecran nomme le routeur du swap ; M6 devis non lu -> route d avant ;');
console.log('   NFLXc hors table != hors regles. ⚠️ chaine fictive : mainnet = la mesure, l execution = le banc fork.');
