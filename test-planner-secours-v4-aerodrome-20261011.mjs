/* test-planner-secours-v4-aerodrome-20261011.mjs - (F) planner : USDC -> GMEc / RDDTc rendaient NON_MESURE � execution reverted �.
 * Diagnostic (mesure 2026-10-11, mainnet.base.org) : le marche lu par le serveur (clesRails) designe une pool v4 VIDE
 *   (GMEc fee 50000/ts 500, RDDTc 30000/300) : le QUOTEUR v4 reverte (0x6190b2b0 enveloppant une erreur de liquidite), echange.js:362 ;
 *   la pool MESUREE (cles-v4-actions.js : GMEc 80000/800, RDDTc 50000/101) cote. Et quand le devis v4 manque, Aerodrome ne venait jamais.
 * A. cleV4MesureeDe(action) : la cle mesuree, decodee (poolId recalcule) depuis cles-v4-mesurees.js.
 * B. achatUsdcActionAvecSecours : v4 NON_MESURE -> recote sur la cle mesuree ; sinon Aerodrome (simule) ; sinon le v4 d origine.
 * C. planRail branche USDC -> action v4 appelle le secours. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let rouges = 0;
const ok = (c, m) => { if (c) console.log('  ok  ' + m); else { rouges += 1; console.log('  ROUGE  ' + m); } };
const R = await import(pathToFileURL(path.join(ICI, 'rails-api.js')).href);
const GME = '0xb2000000000000000000007790ed6e48e06ed935', RDDT = '0xb20000000000000000000066242d4067724cb7a1';
console.log('- A. cle mesuree');
ok(typeof R.cleV4MesureeDe === 'function', 'A cleV4MesureeDe exportee');
if (typeof R.cleV4MesureeDe === 'function') {
  const g = R.cleV4MesureeDe(GME), r = R.cleV4MesureeDe(RDDT);
  ok(g && g.fee === 80000 && g.tickSpacing === 800 && /^0x0{40}$/.test(g.hooks), 'A GMEc : 80000 / 800 sans hook');
  ok(r && r.fee === 50000 && r.tickSpacing === 101, 'A RDDTc : 50000 / 101');
  ok(R.cleV4MesureeDe('0xb200000000000000000000000000000000000001') === null, 'A action inconnue : null');
}
console.log('- B. secours');
ok(typeof R.achatUsdcActionAvecSecours === 'function', 'B achatUsdcActionAvecSecours exportee');
if (typeof R.achatUsdcActionAvecSecours === 'function') {
  const nm = { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: execution reverted' };
  const vide = { currency0: 'a', currency1: 'b', fee: 50000, tickSpacing: 500, hooks: '0x' + '0'.repeat(40) };
  const mes = { ...vide, fee: 80000, tickSpacing: 800 };
  let aero = 0;
  const b1 = await R.achatUsdcActionAvecSecours({ pv4: nm, cleLue: vide, cleMesuree: mes,
    planCle: async (c) => (c.fee === 80000 ? { etat: 'APPROBATIONS', resume: { quote: 5n } } : nm), planAero: async () => { aero += 1; return { etat: 'PRET' }; } });
  ok(b1.plan.etat === 'APPROBATIONS' && b1.via === 'planEchange' && aero === 0, 'B1 v4 qui reverte sur une pool vide : recote sur la pool MESUREE, Aerodrome pas appele');
  const b2 = await R.achatUsdcActionAvecSecours({ pv4: nm, cleLue: vide, cleMesuree: mes, planCle: async () => nm, planAero: async () => ({ etat: 'PRET' }) });
  ok(b2.plan.etat === 'PRET' && b2.via === 'planAerodromeSegment' && /Uniswap v4 pool could not quote/.test(b2.choix || ''), 'B2 devis v4 nul partout : Aerodrome (simule) est pris, et c est dit');
  const b3 = await R.achatUsdcActionAvecSecours({ pv4: nm, cleLue: vide, cleMesuree: null, planCle: async () => nm, planAero: async () => ({ etat: 'REFUSE', pourquoi: 'no pool' }) });
  ok(b3.plan === nm && b3.via === 'planEchange', 'B3 rien ne cote : le NON_MESURE d origine reste (pas de chiffre invente)');
  const pret = { etat: 'PRET', resume: { quote: 1n } };
  const b4 = await R.achatUsdcActionAvecSecours({ pv4: pret, cleLue: vide, cleMesuree: mes, planCle: async () => { throw new Error('x'); }, planAero: async () => { throw new Error('x'); } });
  ok(b4.plan === pret, 'B4 v4 qui cote : inchange, aucun secours');
  const b5 = await R.achatUsdcActionAvecSecours({ pv4: nm, cleLue: mes, cleMesuree: mes, planCle: async () => { throw new Error('ne doit pas'); }, planAero: async () => { throw new Error('429'); } });
  ok(b5.plan === nm, 'B5 cle lue = cle mesuree et Aerodrome muet : NON_MESURE d origine');
}
console.log('- C. branchement');
const src = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
ok(/await achatUsdcActionAvecSecours\(\{ *pv4/.test(src), 'C planRail (USDC -> action v4) passe par le secours');
ok(/FRAIS_INTERFACE_BPS_CL/.test(src) && !/0xa6cf/i.test(src.split('achatUsdcActionAvecSecours')[1] || ''), 'C aucun frais touche');
console.log(rouges ? 'ROUGE : ' + rouges : 'VERT');
process.exitCode = rouges ? 1 : 0;
