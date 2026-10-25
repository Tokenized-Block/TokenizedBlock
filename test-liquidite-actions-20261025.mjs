/* test-liquidite-actions-20261025.mjs — LES LIEUX D UNE ACTION, LEURS REGLES, LE CHOIX, LE PLAN SUR LE ROUTEUR NEUF ET LA VENTE COMPAREE.
 *
 * Hors reseau : chaines fictives en memoire. ⚠️ NE PROUVE PAS mainnet : la mesure (mesures/liquidite-actions-20261025.json) et le banc
 * fork (banc-liquidite-actions-fork-20261025.mjs, mesures/liquidite-actions-fork-20261025.json) le font.
 * Tient : (1) le quoter n est patche que s il a la forme lue ; (2) une pool non lue n est jamais un refus ; (3) le meilleur lieu QUI PASSE
 * gagne, a egalite la route d avant ; (4) le plan neuf refuse un devis qui ne vient pas de sa pool (override ignore) ; (5) sans verdict
 * 'aero-new' meilleur, le planificateur fait EXACTEMENT les memes lectures et rend EXACTEMENT le meme plan qu avant ; (6) la vente loin
 * sous la reference ne s ouvre pas toute seule dans le wallet. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeQuoteurNouvelle, overrideQuoteur, jugerPool, verdictVenue, meilleureVenue, choisirVenue, phraseVente, calldataEchangeNouvelle,
  planVenueNeuve, venteParVenues, coterVenueCL, verdictServi, ROUTEUR_AERO_NOUVEAU, FACTORY_AERO_NOUVELLE, REGLES, SEUIL_VENTE_LOIN_BPS,
  SELECTEUR_MULTICALL, SELECTEUR_SWEEP_AVEC_FRAIS, ESPACEMENTS_NOUVELLE } from './liquidite-actions.js';
import { FACTORY_AERODROME_CL, SELECTEURS } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
import { planRail } from './rails-api.js';
import { selecteur } from './keccak.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); } catch (e) { console.error('✗ ' + t); throw e; } };
const bas = (x) => String(x).toLowerCase();
const U = bas(USDC_BASE), A = '0xb200000000000000000000fc737aea6196ab5a4c'; /* AVGOc, copiee de la mesure */
const COMPTE = '0x1000000000000000000000000000000000000c0c';
const POOL = '0x086a1447d0851f0aea9d09d6c547fec8e97be413';
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const vieille = bas(FACTORY_AERODROME_CL).slice(2), neuve = FACTORY_AERO_NOUVELLE.slice(2);
const CODE_Q = '0x' + '60'.repeat(600) + vieille + '5b'.repeat(40) + vieille + '5b'.repeat(40) + vieille + '00'.repeat(40);

await cas('le quoter est patche seulement avec ses 3 occurrences exactes', () => {
  const p = codeQuoteurNouvelle(CODE_Q);
  assert.ok(p && p.split(neuve).length - 1 === 3 && !p.includes(vieille));
  assert.equal(codeQuoteurNouvelle(CODE_Q.replace(vieille, '11'.repeat(20))), null, '2 occurrences = un autre code');
  assert.equal(codeQuoteurNouvelle(p), null, 'deja patche');
  assert.equal(codeQuoteurNouvelle('0x'), null);
  assert.deepEqual(Object.keys(overrideQuoteur(p)), [QUOTEUR_AERODROME_CL]);
});

const pool = (x) => ({ pool: POOL, tickSpacing: 10, usdcPool: 102_802_141_692n, achat: 3_096_137n, ecartBps: 5, perteBps: 10, venteMemeEtat: 9_989_593n, ...x });
await cas('les trois regles, et un chiffre absent ne passe jamais', () => {
  assert.deepEqual(jugerPool(pool()), { passe: true, code: null });
  assert.equal(jugerPool(pool({ ecartBps: 101 })).code, 'ECART');
  assert.equal(jugerPool(pool({ ecartBps: 100 })).passe, true, '1 % pile passe');
  assert.equal(jugerPool(pool({ perteBps: 201 })).code, 'ALLER_RETOUR');
  assert.equal(jugerPool(pool({ usdcPool: 9_999_999_999n })).code, 'LIQUIDITE_SOUS_SEUIL');
  assert.equal(jugerPool(pool({ usdcPool: REGLES.usdcMin })).passe, true, '10 000 USDC pile passe');
  assert.equal(jugerPool(pool({ usdcPool: null })).code, 'PROFONDEUR_NON_MESUREE', 'v4 : pas de solde = jamais la regle de profondeur');
  assert.equal(jugerPool(pool({ ecartBps: NaN })).code, 'ECART');
  assert.equal(jugerPool(pool({ erreur: 'x' })).code, 'NON_MESURE');
});

await cas('une pool NON LUE interdit le refus (AVGOc, 2026-10-25)', () => {
  const v = verdictVenue({ etat: 'OK', venue: 'aero-new', pools: [pool({ erreur: 'state not read' }), pool({ pool: '0x' + '1'.repeat(40), usdcPool: 2_802_000_000n })] });
  assert.equal(v.etat, 'NON_MESURE'); assert.equal(v.passe, false);
  const ok = verdictVenue({ etat: 'OK', venue: 'aero-new', pools: [pool({ erreur: 'x' }), pool({ pool: '0x' + '2'.repeat(40) })] });
  assert.equal(ok.passe, true, 'une pool qui passe reste prise meme si une autre n est pas lue');
  const deux = verdictVenue({ etat: 'OK', venue: 'aero-new', pools: [pool({ achat: 3_000_000n }), pool({ pool: '0x' + '3'.repeat(40), achat: 3_100_000n })] });
  assert.equal(deux.pool, '0x' + '3'.repeat(40), 'la plus grande sortie a 10 USDC');
  assert.equal(verdictVenue({ etat: 'OK', venue: 'aero-new', pools: [] }).code, 'SANS_POOL');
});

await cas('le meilleur lieu QUI PASSE gagne ; a egalite la route d avant', () => {
  const o = { venue: 'aero-old', passe: true, achat: 100n }, nw = { venue: 'aero-new', passe: true, achat: 100n };
  assert.equal(meilleureVenue([nw, o]).venue, 'aero-old');
  assert.equal(meilleureVenue([o, { ...nw, achat: 101n }]).venue, 'aero-new');
  assert.equal(meilleureVenue([{ ...o, passe: false, achat: 999n }, nw]).venue, 'aero-new');
  assert.equal(meilleureVenue([{ ...o, passe: false }, { ...nw, passe: false }]), null);
  assert.equal(choisirVenue({ route: { achetable: false }, neuve: { passe: true, achat: '5' } }), 'aero-new');
  assert.equal(choisirVenue({ route: { achetable: true, achat: '5' }, neuve: { passe: true, achat: '5' } }), 'aero-old');
  assert.equal(choisirVenue({ route: { achetable: true, achat: '5' }, neuve: { passe: true, achat: '6' } }), 'aero-new');
  assert.equal(choisirVenue({ route: { achetable: true }, neuve: { passe: true, achat: '6' } }), 'aero-old', 'notre achat non lu : la route d avant');
  assert.equal(choisirVenue({ route: { achetable: false }, neuve: { passe: false, achat: '6' } }), null);
  assert.equal(choisirVenue({ route: null, neuve: null }), null);
});

await cas('la phrase de vente : meilleur lieu, reference, et l alerte « loin »', () => {
  const p = phraseVente({ ventes: [{ venue: 'aero-old', prixUsd: 3.77 }, { venue: 'aero-new', prixUsd: 147.87 }, { venue: 'uniswap-v4', prixUsd: 143.81 }],
    reference: { prixUsd: 148.08, source: 'best-buy' } });
  assert.equal(p.meilleure.venue, 'aero-new'); assert.equal(p.loin, false);
  assert.equal(p.texte, 'Best sell: Aerodrome (newer pool factory), about $147.87 per token. Best buy price anywhere $148.08 (-0.14 %).');
  const loin = phraseVente({ ventes: [{ venue: 'aero-new', prixUsd: 190.95 }], reference: { prixUsd: 220.27, source: 'chainlink' } });
  assert.equal(loin.loin, true);
  assert.match(loin.texte, /Chainlink reference \$220\.27 \(-13\.31 %\)\. ⚠ Every venue pays at least 13\.3 % below it\./);
  assert.equal(phraseVente({ ventes: [{ venue: 'aero-new', prixUsd: 100 }], reference: { prixUsd: 100 / (1 - SEUIL_VENTE_LOIN_BPS / 10000), source: 'chainlink' } }).loin, false, '3 % pile : pas loin');
  assert.equal(phraseVente({ ventes: [] }).texte, 'No venue quotes a sale of this stock right now.');
  assert.match(phraseVente({ ventes: [{ venue: 'uniswap-v4', prixUsd: 2 }] }).texte, /No reference price to compare with\.$/);
});

await cas('les octets du routeur neuf : multicall(exactInputSingle -> routeur, sweepTokenWithFee -> compte)', () => {
  const c = calldataEchangeNouvelle({ tokenIn: U, tokenOut: A, tickSpacing: 10, recipient: COMPTE, amountIn: 10_000_000n, amountOutMinimum: 3_000_000n,
    deadline: 1_000_600, maintenant: 1_000_000, beneficiaireFrais: FEE_WALLET });
  assert.equal(c.etat, 'PRET'); assert.equal(c.to, ROUTEUR_AERO_NOUVEAU);
  assert.ok(c.data.startsWith(SELECTEUR_MULTICALL));
  assert.equal(SELECTEUR_MULTICALL, selecteur('multicall(bytes[])'));
  assert.equal(SELECTEUR_SWEEP_AVEC_FRAIS, selecteur('sweepTokenWithFee(address,uint256,address,uint256,address)'));
  const d = c.data.slice(10);
  assert.equal(BigInt('0x' + d.slice(64, 128)), 2n);
  const swap = d.slice(64 * 5, 64 * 5 + 8);
  assert.equal('0x' + swap, SELECTEURS.exactInputSingle);
  assert.ok(c.data.includes(ROUTEUR_AERO_NOUVEAU.slice(2)), 'le swap rend au routeur, qui balaie');
  assert.ok(c.data.includes(SELECTEUR_SWEEP_AVEC_FRAIS.slice(2) + A.slice(2).padStart(64, '0') + (2_997_000n).toString(16).padStart(64, '0') + COMPTE.slice(2).padStart(64, '0')));
  assert.equal(c.minUtilisateur, '2997000');
  assert.equal(calldataEchangeNouvelle({ tokenIn: U, tokenOut: A, tickSpacing: 10, recipient: ROUTEUR_AERO_NOUVEAU, amountIn: 1n, amountOutMinimum: 1n, deadline: 2, beneficiaireFrais: FEE_WALLET }).etat, 'REFUSE');
  assert.equal(calldataEchangeNouvelle({ tokenIn: U, tokenOut: A, tickSpacing: 10, recipient: COMPTE, amountIn: 1n, amountOutMinimum: 1n, deadline: 2 }).etat, 'REFUSE', 'pas de beneficiaire par defaut');
});

/* une chaine fictive pour le plan : sqrtP = 2^96 (prix moyen 1:1 brut), devis = 99,9 % du moyen */
const Q96 = 1n << 96n;
function chaine({ devis = (m) => (m * 999n) / 1000n, ignoreOverride = false, allowance = 0n, solde = 10n ** 12n, simuleRevert = false, slot0Ko = false } = {}) {
  const log = [];
  const rpc = async (methode, params) => {
    log.push(methode + ':' + (params[0] && params[0].to ? bas(params[0].to) + ':' + String(params[0].data || '').slice(0, 10) : ''));
    if (methode === 'eth_getCode') return CODE_Q;
    if (methode !== 'eth_call') throw new Error('unexpected ' + methode);
    const { to, data, from } = params[0];
    if (bas(to) === QUOTEUR_AERODROME_CL) {
      const m = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      const avecOv = !!(params[2] && params[2][QUOTEUR_AERODROME_CL]);
      return w(avecOv && !ignoreOverride ? devis(m) : (m * 12n) / 10n); /* sans override : la pool de l ANCIENNE factory, autre prix */
    }
    if (bas(to) === POOL && data === selecteur('slot0()')) { if (slot0Ko) throw new Error('timeout'); return w(Q96) + '0'.repeat(64 * 6); }
    if (data.startsWith(selecteur('balanceOf(address)'))) return w(solde);
    if (data.startsWith(selecteur('allowance(address,address)'))) return w(allowance);
    if (data === selecteur('decimals()')) return w(8);
    if (from && bas(to) === ROUTEUR_AERO_NOUVEAU) { if (simuleRevert) throw new Error('execution reverted: Too little received'); return '0x'; }
    throw new Error('execution reverted');
  };
  return { rpc, log };
}
const VERDICT = { venue: 'aero-new', passe: true, pool: POOL, tickSpacing: 10, achat: '3096137' };
const plan = (c, x = {}) => planVenueNeuve({ rpc: c.rpc, sens: 'ACHAT', action: A, montant: 10_000_000n, compte: COMPTE, verdict: VERDICT, beneficiaireFrais: FEE_WALLET, maintenant: 1_000_000_000, ...x });

await cas('le plan neuf : approbation EXACTE d abord, puis le swap SIMULE depuis le compte', async () => {
  const a = await plan(chaine());
  assert.equal(a.etat, 'APPROBATIONS'); assert.equal(a.etapes.length, 1);
  assert.equal(a.etapes[0].to, U);
  assert.ok(a.etapes[0].data.endsWith(ROUTEUR_AERO_NOUVEAU.slice(2).padStart(64, '0') + (10_000_000n).toString(16).padStart(64, '0')));
  assert.equal(a.resume.quote, '9990000'); assert.equal(a.resume.impactBps, '10');
  const c = chaine({ allowance: 10_000_000n });
  const p = await plan(c);
  assert.equal(p.etat, 'PRET'); assert.equal(p.tx.to, ROUTEUR_AERO_NOUVEAU);
  assert.equal(p.resume.recoitAuMoins, String((((9_990_000n * 9900n) / 10000n) * 9990n) / 10000n));
  assert.ok(c.log.some((l) => l.startsWith('eth_call:' + ROUTEUR_AERO_NOUVEAU)), 'la transaction exacte est simulee');
  assert.equal((await plan(chaine({ allowance: 10_000_000n, simuleRevert: true }))).etat, 'REFUSE');
  assert.equal((await plan(chaine({ solde: 1n }))).etat, 'REFUSE');
  const v = await planVenueNeuve({ rpc: chaine({ allowance: 10n ** 12n }).rpc, sens: 'VENTE', action: A, montant: 2_000_000n, compte: COMPTE, verdict: VERDICT, beneficiaireFrais: FEE_WALLET, maintenant: 1_000_000_000 });
  assert.equal(v.etat, 'PRET'); assert.equal(v.resume.payeDevise, A); assert.equal(v.resume.recoitDevise, U);
});

await cas('un devis qui ne vient pas de SA pool (override ignore) est REFUSE ; un prix non lu = NON_MESURE', async () => {
  const r = await plan(chaine({ ignoreOverride: true, allowance: 10n ** 12n }));
  assert.equal(r.etat, 'REFUSE'); assert.match(r.pourquoi, /does not come from this pool/);
  assert.equal((await plan(chaine({ slot0Ko: true }))).etat, 'NON_MESURE');
  assert.equal((await plan(chaine({ devis: (m) => m / 3n }))).etat, 'REFUSE', 'plus de 50 % sous le prix de la pool');
  assert.equal((await plan(chaine(), { verdict: null })).etat, 'NON_MESURE');
});

await cas('la vente comparee par lieu, au meme montant', async () => {
  const c = chaine();
  const route = { achetable: false, pool: '0x' + '4'.repeat(40), tickSpacing: 10, venues: { 'aero-new': VERDICT } };
  const v = await venteParVenues({ rpc: c.rpc, action: A, montant: 100_000_000n, route, refUsd: 330 });
  assert.equal(v.etat, 'OK');
  assert.deepEqual(v.ventes.map((x) => x.venue), ['aero-old', 'aero-new']);
  assert.equal(v.meilleure, 'aero-old', 'la fausse chaine cote l ancienne plus haut : le meilleur est dit tel quel');
  assert.equal(v.reference.source, 'chainlink');
  const sans = await venteParVenues({ rpc: c.rpc, action: A, montant: 100_000_000n, route });
  assert.equal(sans.reference.source, 'best-buy');
});

/* (5) LA ROUTE D AVANT, OCTET POUR OCTET : sans verdict 'aero-new' meilleur, les memes lectures et le meme plan */
const fausseChaine = () => {
  const log = [];
  return { log, rpc: async (m, p) => { log.push(m + JSON.stringify(p)); if (m === 'eth_call' && p[0] && p[0].data === selecteur('decimals()')) return w(8); throw new Error('execution reverted'); } };
};
for (const [de, vers] of [[U, A], [A, U]]) {
  await cas('route d avant inchangee ' + (de === U ? 'USDC>action' : 'action>USDC'), async () => {
    const q = { de, vers, montant: '10000000', compte: COMPTE };
    const x = fausseChaine(), y = fausseChaine(), z = fausseChaine();
    const sans = await planRail(q, { rpc: x.rpc, chaine: 8453 });
    const avecVieille = await planRail(q, { rpc: y.rpc, chaine: 8453, venueAction: () => ({ achetable: true, meilleure: 'aero-old', venues: { 'aero-new': VERDICT } }) });
    const neufNonPasse = await planRail(q, { rpc: z.rpc, chaine: 8453, venueAction: () => ({ achetable: false, meilleure: 'aero-new', venues: { 'aero-new': { ...VERDICT, passe: false } } }) });
    assert.deepEqual(avecVieille, sans); assert.deepEqual(y.log, x.log);
    assert.deepEqual(neufNonPasse, sans); assert.deepEqual(z.log, x.log);
    const neuf = await planRail(q, { rpc: chaine({ allowance: 10n ** 12n }).rpc, chaine: 8453, venueAction: () => ({ achetable: false, meilleure: 'aero-new', venues: { 'aero-new': VERDICT } }) });
    assert.equal(neuf.via, 'planVenueNeuve'); assert.equal(neuf.venue, 'aero-new'); assert.equal(neuf.etat, 'PRET');
    assert.equal(neuf.aSigner[0].to, ROUTEUR_AERO_NOUVEAU);
  });
}

await cas('coterVenueCL : la cle de cache est celle de routeAction, une pool trouvee n est plus relue', async () => {
  const cache = new Map(); const appels = [];
  const appel = async (to, data) => { appels.push(bas(to) + data.slice(0, 10)); if (bas(to) === FACTORY_AERO_NOUVELLE) return /0{63}a$/.test(data) ? w(BigInt(POOL)) : w(0n); throw new Error('execution reverted'); };
  await coterVenueCL({ appel, venue: 'aero-new', adr: A, cachePools: cache, maintenant: 1 });
  assert.equal(cache.get(FACTORY_AERO_NOUVELLE + '|' + A + '|10').pool, POOL);
  assert.equal(cache.size, ESPACEMENTS_NOUVELLE.length);
  const avant = appels.filter((x) => x.startsWith(FACTORY_AERO_NOUVELLE)).length;
  await coterVenueCL({ appel, venue: 'aero-new', adr: A, cachePools: cache, maintenant: 2 });
  assert.equal(appels.filter((x) => x.startsWith(FACTORY_AERO_NOUVELLE)).length, avant, 'aucun getPool relu');
  assert.deepEqual(Object.keys(verdictServi({ venue: 'aero-new', passe: true, achat: 1n })).sort(), ['achat', 'code', 'ecartBps', 'passe', 'perteBps', 'pool', 'tickSpacing', 'usdcPool', 'venteMemeEtat', 'venue']);
});

await cas('le serveur, le Market et le panneau sont branches', () => {
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal((srv.match(/reference: lireReferenceServeur, venueAction: venueActionServie \}/g) || []).length, 2, 'les deux appels du planificateur');
  assert.match(srv, /servi\.meilleure = choisirVenue\(\{ route: servi, neuve: servi\.venues\['aero-new'\] \}\);/);
  assert.match(srv, /if \(vN\.passe && !estDeviseConnue\(p\.adr\)\) \{ vN\.passe = false; vN\.code = 'HORS_REGISTRE'; \}/);
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(app, /if \(liqOk && l\.routeAction && l\.routeAction\.achetable === false && l\.routeAction\.meilleure === 'aero-new'\) \{\n\s+return avecPair\('<button type="button" class="bouton trAcheter" data-acheter-rail="'/);
  assert.match(app, /if \(assezLiquide && l\.routeAction && l\.routeAction\.achetable === false && l\.routeAction\.meilleure === 'aero-new'\) return 'rail';/);
  assert.match(app, /const venteLoin = !!\(p\.vente && p\.vente\.loin === true\);/);
  assert.match(app, /if \(direct && !franchissement && !venteLoin\) return signer\(\);/, 'une vente loin sous la reference n ouvre pas le wallet toute seule');
  assert.match(app, /venteLoin \? 'Sell anyway'/);
});

console.log('✓ test-liquidite-actions-20261025 : ' + n + ' cas');
console.log('   regles 1 % / 2 % / 10 000 USDC, pool non lue = NON_MESURE, meilleur lieu qui passe (egalite : route d avant),');
console.log('   plan neuf (approbation exacte, simulation, devis confronte a sa pool), route d avant identique (memes lectures, meme plan).');
console.log('   ⚠️ chaine fictive : mainnet = la mesure, l execution = le banc fork.');
