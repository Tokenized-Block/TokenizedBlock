/* test-liquidite-correctifs-20261025.mjs — LES CINQ DEFAUTS DE LA REVUE DE 3d81e06 (lieux d echange des actions), UN CAS CHACUN.
 *
 * Hors reseau : chaines fictives en memoire. ⚠️ NE PROUVE PAS mainnet (la mesure le fait) ni l execution (le banc fork le fait).
 *   D1 la VENTE est routee par le meilleur lieu de VENTE qui passe (pas par le verdict d achat a 10 USDC), et l ecran dit le lieu EMPRUNTE ;
 *   D2 le bouton d une APPROBATION dit approbation — « Sell anyway » seulement sur la vente elle-meme ;
 *   D3 la profondeur compte l USDC UTILISABLE au prix courant (devis d une vente de 10 000 USDC), pas balanceOf ;
 *   D4 la mesure prend la decision DU SERVEUR (registre + strictement meilleur), et la reference de repli ne vient que de lieux qui passent ;
 *   D5 un ecart NEGATIF au-dela de -10 bps (un devis au-dessus du prix de sa propre pool) ne passe pas.
 * Plus : le chemin du planificateur qui ATTACHE la vente comparee (avec une reference Chainlink lue) est exerce de bout en bout. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from './liquidite-actions.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { USDC_BASE } from './frais-creation.js';
import { planRail } from './rails-api.js';
import { selecteur } from './keccak.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

/* chaque cas est juge SEUL (un rouge n empeche pas les autres de dire le leur) ; un seul rouge = exit 1 */
let n = 0; const rouges = [];
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ✓ ' + t); } catch (e) { rouges.push(t); console.error('✗ ' + t + '\n    ' + String((e && e.message) || e).split('\n')[0]); } };
const bas = (x) => String(x).toLowerCase();
const U = bas(USDC_BASE);
const AMZN = '0xb200000000000000000000d9192b6b456483c2e8'; /* AMZNc : dans la table Aerodrome (ts 10), copiee de pools-actions-aerodrome.js */
const AVGO = '0xb200000000000000000000fc737aea6196ab5a4c'; /* AVGOc : hors table (sa vente d avant passe par v4) */
const COMPTE = '0x1000000000000000000000000000000000000c0c';
const POOL_N = '0x086a1447d0851f0aea9d09d6c547fec8e97be413';
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const vieille = bas(FACTORY_AERODROME_CL).slice(2);
const CODE_Q = '0x' + '60'.repeat(600) + vieille + '5b'.repeat(40) + vieille + '5b'.repeat(40) + vieille + '00'.repeat(40);
const Q96 = 1n << 96n;
assert.equal(POOLS_ACTIONS_AERODROME.get(AMZN).tickSpacing, 10, 'AMZNc est bien dans la table, ts 10');

/* la chaine fictive : sqrtP = 2^96 (prix moyen 1:1 brut) ; devis du quoter AVEC override = la pool 'aero-new', SANS = la pool 'aero-old' */
function chaine({ neuve = (m) => (m * 999n) / 1000n, ancienne = (m) => (m * 990n) / 1000n, allowance = 10n ** 18n } = {}) {
  const log = [];
  const rpc = async (methode, params) => {
    log.push(methode + ':' + (params[0] && params[0].to ? bas(params[0].to) + ':' + String(params[0].data || '').slice(0, 10) : '') + (params[2] ? ':ov' : ''));
    if (methode === 'eth_getCode') return CODE_Q;
    if (methode === 'eth_simulateV1') throw new Error('execution reverted');
    if (methode !== 'eth_call') throw new Error('unexpected ' + methode);
    const { to, data, from } = params[0];
    if (bas(to) === QUOTEUR_AERODROME_CL) {
      const m = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      return w(params[2] && params[2][QUOTEUR_AERODROME_CL] ? neuve(m) : ancienne(m));
    }
    if (bas(to) === POOL_N && data === selecteur('slot0()')) return w(Q96) + '0'.repeat(64 * 6);
    if (data.startsWith(selecteur('balanceOf(address)'))) return w(10n ** 18n);
    if (data.startsWith(selecteur('allowance(address,address)'))) return w(allowance);
    if (data === selecteur('decimals()')) return w(8);
    if (from && bas(to) === L.ROUTEUR_AERO_NOUVEAU) return '0x';
    throw new Error('execution reverted');
  };
  return { rpc, log };
}
const NEUVE = { venue: 'aero-new', passe: true, code: null, pool: POOL_N, tickSpacing: 10, achat: '3096137' };
const routeDe = (x = {}) => ({ achetable: true, pool: '0x' + '4'.repeat(40), tickSpacing: 10, achat: '3000000', meilleure: 'aero-old', venues: { 'aero-new': NEUVE }, ...x });
const vendre = (action, route, c, x = {}) => planRail({ de: action, vers: U, montant: '200000000', compte: COMPTE }, { rpc: c.rpc, chaine: 8453, maintenant: 1_000_000_000, venueAction: () => route, ...x });

await cas('D1 la vente prend le lieu qui PAIE le plus a ce montant, meme quand l achat a 10 USDC a choisi l autre', async () => {
  /* notre route est la meilleure a l ACHAT (meilleure = aero-old), mais a la VENTE de ce montant 'aero-new' paie plus : la vente y passe */
  const a = await vendre(AMZN, routeDe(), chaine());
  assert.equal(a.via, 'planVenueNeuve', 'la vente suit le meilleur lieu de VENTE (' + a.via + ')');
  assert.equal(a.venue, 'aero-new');
  assert.match(a.choix, /at this amount it pays more for this sale than this app’s usual route/);
  /* l inverse (le cas AMZN mesure) : 'aero-new' gagne l ACHAT, notre route paie plus a la VENTE -> notre route, et pas 'aero-new' */
  const b = await vendre(AMZN, routeDe({ meilleure: 'aero-new', achat: '3000000' }), chaine({ neuve: (m) => (m * 990n) / 1000n, ancienne: (m) => (m * 999n) / 1000n }));
  assert.equal(b.via, 'planAerodromeSegment', 'notre route paie plus a la vente : elle est gardee (' + b.via + ')');
  assert.notEqual(b.venue, 'aero-new');
  /* a egalite, la route d avant */
  const c = await vendre(AMZN, routeDe(), chaine({ neuve: (m) => (m * 995n) / 1000n, ancienne: (m) => (m * 995n) / 1000n }));
  assert.equal(c.via, 'planAerodromeSegment', 'egalite : la route d avant');
  /* notre route NE PASSE PAS (sa vente passerait quand meme par elle avant) : 'aero-new', seul lieu qui passe, meme s il paie moins */
  const d = await vendre(AMZN, routeDe({ achetable: false, code: 'LIQUIDITE_SOUS_SEUIL', meilleure: 'aero-new' }), chaine({ neuve: (m) => (m * 990n) / 1000n, ancienne: (m) => (m * 999n) / 1000n }));
  assert.equal(d.via, 'planVenueNeuve');
  assert.match(d.choix, /this app’s usual route for this sale does not pass its liquidity rules/);
  /* 'aero-new' ne passe pas : la route d avant, sans une lecture de plus */
  const x = chaine(), y = chaine();
  const sans = await planRail({ de: AMZN, vers: U, montant: '200000000', compte: COMPTE }, { rpc: x.rpc, chaine: 8453, maintenant: 1_000_000_000 });
  const np = await vendre(AMZN, routeDe({ venues: { 'aero-new': { ...NEUVE, passe: false, code: 'LIQUIDITE_SOUS_SEUIL' } } }), y);
  assert.deepEqual(np, sans); assert.deepEqual(y.log, x.log);
});

await cas('D1 l ecran nomme le lieu EMPRUNTE, et un lieu qui cote plus sans passer est dit tel', async () => {
  const ref = async () => ({ reference: { etat: 'LU', prixUsd: 100, source: 'chainlink' } });
  const a = await vendre(AMZN, routeDe(), chaine(), { reference: ref });
  assert.equal(a.etat, 'PRET', a.pourquoi);
  assert.ok(a.vente, 'la vente comparee est attachee au plan');
  assert.equal(a.vente.ici, 'aero-new');
  /* 2 actions (8 decimales) vendues a 0,999 du prix 1:1 brut (1 unite brute = 1 unite USDC brute -> 100 $ l action) : 99,90 $ */
  assert.match(a.vente.texte, /^Selling through Aerodrome \(newer pool factory\), about \$99\.90 per token\. Chainlink reference \$100\.00 \(-0\.10 %\)\.$/, a.vente.texte);
  assert.doesNotMatch(a.vente.texte, /Best sell/);
  /* le texte, pur : le lieu emprunte d abord ; un lieu mieux cote qui ne passe pas est NOMME comme tel, jamais « best » */
  const p = L.phraseVente({ ventes: [{ venue: 'aero-old', prixUsd: 248.82 }, { venue: 'aero-new', prixUsd: 248.78 }], ici: 'aero-new', passants: ['aero-new'],
    reference: { prixUsd: 249, source: 'best-buy' } });
  assert.match(p.texte, /^Selling through Aerodrome \(newer pool factory\), about \$248\.78 per token\. Aerodrome \(this app’s router\) quotes more \(\$248\.82\) but does not pass this app’s liquidity rules\./, p.texte);
  assert.equal(p.ici.venue, 'aero-new');
});

await cas('D2 le bouton d une APPROBATION dit approbation ; « Sell anyway » seulement sur la vente', () => {
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = app.match(/function bcLibelleSigner\(\{ franchissement, approbations, venteLoin, n \}\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'le libelle du bouton est une fonction nommee (testable)');
  const f = new Function('return ' + m[0])();
  assert.equal(f({ franchissement: false, approbations: true, venteLoin: true, n: 1 }), 'Sign the 1 approval(s)', 'une approbation n est jamais « Sell anyway »');
  assert.equal(f({ franchissement: false, approbations: false, venteLoin: true, n: 1 }), 'Sell anyway');
  assert.equal(f({ franchissement: false, approbations: false, venteLoin: false, n: 1 }), 'Sign in my wallet');
  assert.equal(f({ franchissement: true, approbations: true, venteLoin: true, n: 2 }), 'My wallet can batch — sign the 2 approval(s)');
  assert.match(app, /bcBoutons\(m, \[\[bcLibelleSigner\(\{ franchissement, approbations, venteLoin, n: p\.aSigner\.length \}\), signer\], \['Dismiss', refuser, true\]\]\);/, 'le bouton prend ce libelle');
});

const pool = (x) => ({ pool: POOL_N, tickSpacing: 10, usdcPool: 102_802_141_692n, usdcUtilisable: 9_990_000_000n, achat: 3_096_137n, ecartBps: 5, perteBps: 10, venteMemeEtat: 9_989_593n, ...x });
await cas('D3 la profondeur = l USDC UTILISABLE au prix courant, pas le solde de la pool (AVGOc, tx 0x16e0d0bb…, 2 802 USDC actifs)', async () => {
  assert.equal(L.jugerPool(pool({ usdcUtilisable: 2_802_000_000n })).code, 'LIQUIDITE_SOUS_SEUIL', '102 k$ de solde, 2,8 k$ utilisables : refuse');
  assert.equal(L.jugerPool(pool({ usdcPool: 0n })).passe, true, 'le solde ne decide plus');
  assert.equal(L.jugerPool(pool({ usdcUtilisable: undefined })).code, 'PROFONDEUR_NON_MESUREE');
  const seuil = (L.REGLES.usdcMin * BigInt(10000 - L.REGLES.perteProfondeurMaxBps)) / 10000n;
  assert.equal(L.jugerPool(pool({ usdcUtilisable: seuil })).passe, true, 'le seuil pile passe');
  assert.equal(L.jugerPool(pool({ usdcUtilisable: seuil - 1n })).code, 'LIQUIDITE_SOUS_SEUIL');
  /* coterVenueCL cote la VENTE de ce que 10 000 USDC valent au prix de la pool : la pool en rend 2 802 -> refusee, malgre 102 k$ de solde */
  const appel = async (to, data) => {
    if (bas(to) === L.FACTORY_AERO_NOUVELLE) return /0{63}a$/.test(data) ? w(BigInt(POOL_N)) : w(0n);
    if (bas(to) === U && data.startsWith(selecteur('balanceOf(address)'))) return w(102_802_141_692n);
    if (bas(to) === POOL_N && data === selecteur('liquidity()')) return w(10n ** 15n);
    if (bas(to) === POOL_N && data === selecteur('slot0()')) return w(Q96) + '0'.repeat(64 * 6);
    if (bas(to) === QUOTEUR_AERODROME_CL) {
      const tin = '0x' + data.slice(10 + 24, 10 + 64), m = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      if (tin === U) return w((m * 9995n) / 10000n);
      return w(m >= 10n ** 10n ? 2_802_000_000n : (m * 9990n) / 10000n); /* une vente de 10 000 USDC vide la tranche active */
    }
    throw new Error('execution reverted');
  };
  const c = await L.coterVenueCL({ appel, venue: 'aero-new', adr: AVGO });
  const p = c.pools.find((x) => x.pool === POOL_N);
  assert.equal(p.usdcPool, 102_802_141_692n, 'le solde reste dit');
  assert.equal(p.usdcUtilisable, 2_802_000_000n, 'l USDC utilisable est le devis d une vente de 10 000 USDC au prix de la pool');
  const v = L.verdictVenue(c);
  assert.equal(v.passe, false); assert.equal(v.code, 'LIQUIDITE_SOUS_SEUIL');
  assert.equal(L.verdictServi(v).usdcUtilisable, '2802000000', 'servi');
});

await cas('D4 la decision servie (registre + strictement meilleur) est UNE fonction, prise par le serveur ET la mesure', () => {
  assert.equal(typeof L.venuesServies, 'function');
  const cote = { etat: 'OK', venue: 'aero-new', pools: [pool()] };
  const hors = L.venuesServies({ route: { achetable: false }, coteNeuve: cote, admise: false });
  assert.equal(hors.venues['aero-new'].passe, false); assert.equal(hors.venues['aero-new'].code, 'HORS_REGISTRE', 'BUDc : refuse par le serveur');
  assert.equal(hors.meilleure, null);
  assert.equal(L.venuesServies({ route: { achetable: false }, coteNeuve: cote, admise: true }).meilleure, 'aero-new');
  assert.equal(L.venuesServies({ route: { achetable: true, achat: String(3_096_137n) }, coteNeuve: cote, admise: true }).meilleure, 'aero-old', 'egalite : la route d avant');
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(srv, /Object\.assign\(servi, venuesServies\(\{ route: servi, coteNeuve: cN, admise: estDeviseConnue\(p\.adr\) \}\)\);/, 'le serveur');
  const mes = readFileSync(new URL('./mesure-liquidite-actions-20261025.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(mes, /venuesServies\(\{ route: servie, coteNeuve: cNew, admise: estDeviseConnue\(a\) \}\)/, 'la mesure : la MEME decision');
  assert.match(mes, /routeAction\(\{ appel, adr: a, bloc \}\)/, 'la mesure : notre route jugee par routeAction, comme le serveur');
  assert.doesNotMatch(mes, /meilleureVenue\(/, 'plus de decision propre a la mesure');
});

await cas('D4 la reference de repli ne vient que de lieux qui PASSENT (HTZc : 3 831 417 $ d une pool qui refuse)', async () => {
  const c = chaine();
  const route = { achetable: false, code: 'ECART', pool: '0x' + '4'.repeat(40), tickSpacing: 10, achat: '1', venues: { 'aero-new': { ...NEUVE, passe: false, code: 'ECART', achat: '1' } } };
  const v = await L.venteParVenues({ rpc: c.rpc, action: AVGO, montant: 100_000_000n, route });
  assert.equal(v.reference, null, 'aucun lieu ne passe : pas de reference (' + JSON.stringify(v.reference) + ')');
  const v2 = await L.venteParVenues({ rpc: c.rpc, action: AVGO, montant: 100_000_000n, route: { ...route, venues: { 'aero-new': { ...NEUVE, achat: '3000000' } } } });
  assert.equal(v2.reference.source, 'best-buy'); assert.ok(Math.abs(v2.reference.prixUsd - 10 / 0.03) < 1e-6, 'le lieu qui passe');
});

await cas('D5 un devis AU-DESSUS du prix de sa propre pool (ecart < -10 bps) ne passe pas, comme au planificateur', () => {
  assert.equal(L.jugerPool(pool({ ecartBps: -11 })).passe, false);
  assert.equal(L.jugerPool(pool({ ecartBps: -11 })).code, 'ECART_NEGATIF');
  assert.equal(L.jugerPool(pool({ ecartBps: -10 })).passe, true, '-10 bps pile passe (la borne du planificateur)');
  assert.equal(L.jugerPool(pool({ ecartBps: -5000 })).code, 'ECART_NEGATIF');
});

await cas('le chemin du planificateur qui ATTACHE la vente comparee : reference Chainlink lue, ecart et alerte sur le lieu emprunte', async () => {
  const ref = (prixUsd) => async () => ({ reference: { etat: 'LU', prixUsd, source: 'chainlink' } });
  /* vente de 2 actions (8 decimales) -> 99,90 $ par action sur 'aero-new' ; reference 110 $ -> -9,18 %, loin */
  const loin = await vendre(AMZN, routeDe(), chaine(), { reference: ref(110) });
  assert.equal(loin.vente.reference.source, 'chainlink');
  assert.equal(loin.vente.ecartBps, -918);
  assert.equal(loin.vente.loin, true);
  assert.match(loin.vente.texte, /Chainlink reference \$110\.00 \(-9\.18 %\)\. ⚠ This sale pays 9\.2 % below it\./, loin.vente.texte);
  assert.deepEqual(loin.vente.ventes.map((x) => x.venue).sort(), ['aero-new', 'aero-old']);
  assert.equal(loin.vente.choix, 'PAIE_PLUS');
  const pres = await vendre(AMZN, routeDe(), chaine(), { reference: ref(100) });
  assert.equal(pres.vente.loin, false); assert.equal(pres.vente.ecartBps, -10);
  /* une approbation porte aussi la vente comparee (l ecran la dit AVANT la premiere signature) */
  const ap = await vendre(AMZN, routeDe(), chaine({ allowance: 0n }), { reference: ref(110) });
  assert.equal(ap.etat, 'APPROBATIONS'); assert.equal(ap.vente.loin, true); assert.equal(ap.vente.ici, 'aero-new');
  /* sans reference lue (ni Chainlink, ni lieu qui passe... ici 'aero-new' passe : repli 'best-buy' = son prix d achat a 10 USDC) */
  const sansRef = await vendre(AMZN, routeDe(), chaine(), { reference: async () => null });
  assert.equal(sansRef.vente.reference.source, 'best-buy');
});

if (rouges.length) { console.error('✗ test-liquidite-correctifs-20261025 : ' + rouges.length + ' rouge(s) sur ' + n + ' cas'); process.exitCode = 1; }
else console.log('✓ test-liquidite-correctifs-20261025 : ' + n + ' cas');
console.log('   D1 vente routee par le meilleur lieu de VENTE qui passe, lieu emprunte dit ; D2 approbation != « Sell anyway » ;');
console.log('   D3 profondeur = USDC utilisable (vente de 10 000 USDC cotee) ; D4 decision du serveur partagee, repli des lieux qui passent ; D5 ecart < -10 bps refuse.');
console.log('   ⚠️ chaine fictive : mainnet = la mesure, l execution = le banc fork.');
