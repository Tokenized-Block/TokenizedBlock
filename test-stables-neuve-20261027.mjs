/* test-stables-neuve-20261027.mjs — USDC <-> CADD / MXNB / USDT par 'aero-new' (stables-neuve.js, rails-api.js 4 sexies, wallet-fiat.js aVenir).
 * Hors reseau : un rpc qui ne repond rien (planVenueNeuve s arrete donc NON_MESURE « quoter code not read » — c est le `via` qui est juge).
 * Usage : node test-stables-neuve-20261027.mjs [dossier]   (dossier = une COPIE mutee ; defaut : ici) */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] || '.');
const imp = (f) => import(pathToFileURL(path.join(dir, f)).href);
const { STABLES_NEUVE, porteStableNeuve, verdictStableNeuve, STABLE_NEUVE_MAX_MS } = await imp('stables-neuve.js');
const { planRail } = await imp('rails-api.js');
const { A_VENIR, MESURES_ROUTEES, aVenir } = await imp('wallet-fiat.js');
const { DEVISES_BANNIES } = await imp('plan-franchissement.js');
const { USDC_BASE } = await imp('frais-creation.js');

let ok = 0, ko = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('ok  ', nom); } catch (e) { ko++; console.log('FAIL', nom, '-', String(e.message).split('\n')[0]); } };
const bas = (a) => String(a).toLowerCase();
const USDC = bas(USDC_BASE);
const sym = (s) => bas(A_VENIR.find((x) => x.symbole === s).adr);
const CADD = sym('CADD'), MXNB = sym('MXNB'), USDT = sym('USDT');
const AUDF = Object.keys(MESURES_ROUTEES).find((k) => MESURES_ROUTEES[k].symbole === 'AUDF');
const EURC = [...DEVISES_BANNIES.keys()].find((k) => DEVISES_BANNIES.get(k) === 'EURC');
const COMPTE = '0x' + '11'.repeat(20), POOL = '0x' + '22'.repeat(20);
const MAINTENANT = 1_800_000_000_000;
const passe = { venue: 'aero-new', passe: true, code: null, pool: POOL, tickSpacing: 1, usdcPool: '57384938135', usdcUtilisable: '9953120576', achat: '1', venteMemeEtat: '1', ecartBps: 5, perteBps: 10 };
const echoue = { ...passe, passe: false, code: 'LIQUIDITE_SOUS_SEUIL' };
const rpcMuet = async () => { throw new Error('offline bench'); };
const plan = (de, vers, servi) => planRail({ de, vers, montant: '10000000', compte: COMPTE },
  { rpc: rpcMuet, chaine: 8453, maintenant: MAINTENANT, venueStable: () => servi });

await t('STABLES_NEUVE = exactly CADD, MXNB, USDT (from A_VENIR)', () => {
  assert.deepEqual([...STABLES_NEUVE.keys()].sort(), [CADD, MXNB, USDT].sort());
});
await t('EURC (banned) is never a newer-factory stable', () => {
  assert.ok(EURC && /^0x[0-9a-f]{40}$/.test(EURC));
  for (const b of DEVISES_BANNIES.keys()) assert.ok(!STABLES_NEUVE.has(bas(b)));
});
await t('AUDF is never a newer-factory stable', () => { assert.ok(AUDF); assert.ok(!STABLES_NEUVE.has(AUDF)); });

for (const [s, a] of [['CADD', CADD], ['MXNB', MXNB], ['USDT', USDT]]) {
  await t(s + ': USDC -> ' + s + ' on a fresh passing measurement goes to planVenueNeuve (aero-new)', async () => {
    const r = await plan(USDC, a, { v: passe, t: MAINTENANT - 60_000, bloc: 53_200_000 });
    assert.equal(r.via, 'planVenueNeuveFraisEntree'); assert.equal(r.venue, 'aero-new'); /* 2026-10-27 : frais en USDC a l entree */
    assert.notEqual(r.etat, 'PRET'); /* hors reseau : jamais PRET sans devis lu */
  });
  await t(s + ': ' + s + ' -> USDC on a fresh passing measurement goes to planVenueNeuve', async () => {
    const r = await plan(a, USDC, { v: passe, t: MAINTENANT - 60_000, bloc: 53_200_000 });
    assert.equal(r.via, 'planVenueNeuve');
  });
}
await t('measured gate: a failing fresh measurement -> REFUSE, « measured, not routed » + the measured reason', async () => {
  const r = await plan(USDC, CADD, { v: echoue, t: MAINTENANT - 60_000, bloc: 53_200_000 });
  assert.equal(r.etat, 'REFUSE'); assert.equal(r.via, 'stableNeuve');
  assert.match(String(r.pourquoi), /measured, not routed/); assert.match(String(r.pourquoi), /too shallow/); assert.match(String(r.pourquoi), /53200000/);
});
await t('measured gate: no measurement -> NON_MESURE, not planned', async () => {
  const r = await plan(USDC, MXNB, null);
  assert.equal(r.etat, 'NON_MESURE'); assert.equal(r.via, 'stableNeuve'); assert.match(String(r.pourquoi), /no fresh measurement/);
});
await t('measured gate: a stale passing measurement (> 15 min) -> NON_MESURE', async () => {
  const r = await plan(USDC, USDT, { v: passe, t: MAINTENANT - STABLE_NEUVE_MAX_MS - 1, bloc: 1 });
  assert.equal(r.etat, 'NON_MESURE'); assert.equal(r.via, 'stableNeuve');
});
await t('measured gate: a passing verdict without its pool -> not planned', () => {
  const p = porteStableNeuve({ adr: CADD, servi: { v: { ...passe, pool: null }, t: MAINTENANT, bloc: 1 }, maintenant: MAINTENANT });
  assert.notEqual(p.etat, 'OK');
});
await t('EURC: USDC -> EURC and EURC -> USDC stay REFUSED even if everything « passes »', async () => {
  for (const [d, v] of [[USDC, EURC], [EURC, USDC]]) {
    const r = await plan(d, v, { v: passe, t: MAINTENANT, bloc: 1 });
    assert.equal(r.etat, 'REFUSE'); assert.notEqual(r.via, 'planVenueNeuve'); assert.match(String(r.pourquoi), /EURC|banned|not offered/i);
  }
  assert.notEqual(porteStableNeuve({ adr: EURC, servi: { v: passe, t: MAINTENANT, bloc: 1 }, maintenant: MAINTENANT }).etat, 'OK');
});
await t('AUDF: USDC -> AUDF never goes through the newer-factory stable route', async () => {
  const r = await plan(USDC, AUDF, { v: passe, t: MAINTENANT, bloc: 1 });
  assert.ok(!['planVenueNeuve', 'planVenueNeuveFraisEntree', 'stableNeuve'].includes(r.via)); assert.notEqual(r.etat, 'PRET');
});
await t('verdictStableNeuve: a pool under the depth rule does not pass; a lookup that was not read is NON_MESURE', () => {
  const pool = { pool: POOL, tickSpacing: 1, usdcPool: 13473538883n, liquidite: 1n, sqrtP: 1n, achat: 9_990_000n, ecartBps: 5, venteMemeEtat: 9_980_000n, perteBps: 10, usdcUtilisable: 9_000_000_000n };
  assert.equal(verdictStableNeuve({ etat: 'OK', venue: 'aero-new', pools: [pool] }).passe, false);
  assert.equal(verdictStableNeuve({ etat: 'OK', venue: 'aero-new', pools: [{ ...pool, usdcUtilisable: 9_953_120_576n }] }).passe, true);
  assert.equal(verdictStableNeuve({ etat: 'NON_MESURE', venue: 'aero-new', pourquoi: 'x' }).code, 'NON_MESURE');
});
await t('card: fresh passing -> routed line with a Swap button; failing -> « measured, not routed » + reason; unread -> old phrase', () => {
  const servis = [{ adr: CADD, frais: true, bloc: 53_200_000, verdict: passe }, { adr: MXNB, frais: true, bloc: 53_200_000, verdict: echoue }, { adr: USDT, frais: false, bloc: 1, verdict: passe }];
  const l = aVenir({ servis }), de = (a) => l.find((x) => x.adr === a);
  assert.equal(de(CADD).routee, true); assert.equal(de(CADD).bouton, 'Swap USDC to CADD'); assert.match(de(CADD).phrase, /routed through the newer Aerodrome pool factory/);
  assert.equal(de(MXNB).routee, false); assert.match(de(MXNB).phrase, /measured, not routed yet/); assert.match(de(MXNB).phrase, /too shallow/);
  assert.equal(de(USDT).routee, false); assert.ok(!de(USDT).bouton);
  assert.deepEqual(aVenir().map((x) => x.phrase), aVenir({ servis: null }).map((x) => x.phrase));
  assert.ok(aVenir({ servis: [{ adr: EURC, frais: true, bloc: 1, verdict: passe }] }).every((x) => x.adr !== EURC && !x.routee));
});
/* ── 2026-10-27 (proprietaire) : ACHAT = frais EN USDC A L ENTREE. Une chaine SIMULEE (prix 1:1, tout repond) : la FORME du plan. ── */
const { FEE_WALLET } = await imp('frais-creation.js');
const { QUOTEUR_AERODROME_CL } = await imp('rolls-en-action.js');
const { FACTORY_AERODROME_CL, FRAIS_INTERFACE_BPS_CL } = await imp('calldata-aerodrome.js');
const { ROUTEUR_AERO_NOUVEAU } = await imp('liquidite-actions.js');
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const montantsCotes = [];
const rpcChaine = async (methode, params) => {
  if (methode === 'eth_getCode') return '0x' + '60'.repeat(600) + bas(FACTORY_AERODROME_CL).slice(2).repeat(3);
  if (methode !== 'eth_call') throw new Error('unexpected ' + methode);
  const { to, data } = params[0], d = String(data);
  if (bas(to) === bas(QUOTEUR_AERODROME_CL)) { const m = BigInt('0x' + d.slice(10 + 128, 10 + 192)); montantsCotes.push(m); return '0x' + mot(m); }
  if (d.startsWith('0x3850c7bd')) return '0x' + mot(1n << 96n);            /* slot0 : prix 1 */
  if (d.startsWith('0x70a08231') || d.startsWith('0xdd62ed3e')) return '0x' + mot(10n ** 30n); /* solde, allowance */
  return '0x' + mot(0);                                                    /* simulations */
};
const planChaine = (de, vers) => planRail({ de, vers, montant: '10000000', compte: COMPTE },
  { rpc: rpcChaine, chaine: 8453, maintenant: MAINTENANT, venueStable: () => ({ v: passe, t: MAINTENANT - 60_000, bloc: 53_200_000 }) });
const FRAIS = (10_000_000n * BigInt(FRAIS_INTERFACE_BPS_CL)) / 10000n;
await t('buy fee: USDC -> CADD has a USDC.transfer(FEE_WALLET, fee) leg at today’s rate, and the swap is quoted on amount - fee', async () => {
  assert.ok(FRAIS > 0n && /^0x[0-9a-fA-F]{40}$/.test(FEE_WALLET));
  montantsCotes.length = 0;
  const r = await planChaine(USDC, CADD);
  assert.equal(r.etat, 'PRET', String(r.pourquoi));
  const f = r.appels.filter((x) => bas(x.to) === USDC && x.data.startsWith('0xa9059cbb'));
  assert.equal(f.length, 1);
  assert.equal(f[0].data, '0xa9059cbb' + bas(FEE_WALLET).slice(2).padStart(64, '0') + mot(FRAIS));
  assert.deepEqual(montantsCotes, [10_000_000n - FRAIS]);
  assert.equal(r.resume.fraisDevise, USDC); assert.equal(r.resume.fraisMontant, String(FRAIS)); assert.equal(r.resume.montantEchange, String(10_000_000n - FRAIS));
  const sw = r.appels.filter((x) => bas(x.to) === bas(ROUTEUR_AERO_NOUVEAU));
  assert.equal(sw.length, 1); assert.ok(sw[0].data.includes(mot(10_000_000n - FRAIS)), 'swap amountIn = amount - fee');
});
await t('buy fee: no sweepTokenWithFee on the output stable (MXNB, USDT too)', async () => {
  for (const a of [CADD, MXNB, USDT]) {
    const r = await planChaine(USDC, a);
    assert.equal(r.etat, 'PRET');
    assert.ok(r.aSigner.every((x) => !x.data.includes('e0e189a0')), 'no sweepTokenWithFee');
    assert.ok(r.aSigner.every((x) => !(bas(x.to) === a)), 'nothing sent from the stable');
  }
});
await t('sell side unchanged: CADD -> USDC = planVenueNeuve, one multicall with sweepTokenWithFee in USDC', async () => {
  const r = await planChaine(CADD, USDC);
  assert.equal(r.via, 'planVenueNeuve'); assert.equal(r.etat, 'PRET');
  assert.equal(r.appels.length, 1); assert.equal(bas(r.appels[0].to), bas(ROUTEUR_AERO_NOUVEAU));
  const i = r.appels[0].data.indexOf('e0e189a0'); assert.ok(i > 0);
  assert.equal(r.appels[0].data.slice(i + 8, i + 72), USDC.slice(2).padStart(64, '0'));
});
console.log(ok + ' ok, ' + ko + ' failed');
process.exit(ko ? 1 : 0);
