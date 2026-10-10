/* test-pool-aero-plus-profonde-20261003.mjs — poolAerodromeDe garde la pool la PLUS PROFONDE, pas la premiere trouvee.
 * ⛔ MESURE (2026-10-03) : MUc / PLTRc / AMZNc ont une pool VIDE a l espacement 1 et leur vraie pool a 10 ; le franchissement
 *   (block -> action, OUSD -> action) calculait son minimum sur la pool vide.
 * A. RPC fictif : 1 vide + 1 profonde -> la profonde ; une seule -> comme avant ; plusieurs sans profondeur lue -> NON_MESURE.
 * B. TEMOIN ON-CHAIN : pour MUc, PLTRc, AMZNc, la pool choisie est celle de la table mesuree (pools-actions-aerodrome.js).
 * C. MUTANT : « la premiere trouvee » (l ancienne regle) doit rater A. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const PF = await imp('plan-franchissement.js');
const T = await imp('pools-actions-aerodrome.js');
const { selecteur } = await imp('keccak.js');
const { USDC_BASE } = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();

/* A. RPC fictif : getPool(ts) -> adresse ; balanceOf(pool) -> profondeur ; token0 -> USDC */
const A = '0x' + 'a'.repeat(40), X = '0x' + 'b'.repeat(40);
const P1 = '0x' + '1'.repeat(40), P10 = '0x' + '2'.repeat(40);
const fictif = ({ pools, profondeurs, profondeurIllisible = false, illisibles = [] }) => async (methode, [{ to, data }]) => {
  const d = bas(data);
  if (d.startsWith(bas(selecteur('balanceOf(address)')))) { const p = '0x' + d.slice(-40); if (profondeurIllisible || illisibles.includes(p)) throw new Error('rate limit'); return '0x' + (profondeurs[p] || 0n).toString(16).padStart(64, '0'); }
  if (d.startsWith(bas(selecteur('token0()')))) return '0x' + A.slice(2).padStart(64, '0');
  for (const [ts, adr] of Object.entries(pools)) {
    const c = (await imp('calldata-aerodrome.js')).calldataGetPool({ tokenA: A, tokenB: X, tickSpacing: Number(ts) });
    if (bas(c.data) === d) return '0x' + adr.slice(2).padStart(64, '0');
  }
  return '0x' + '0'.repeat(64);
};
const deux = await PF.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1, 10: P10 }, profondeurs: { [P1]: 0n, [P10]: 845308n * 10n ** 6n } }), a: A, b: X });
ok(deux.etat === 'PRET' && deux.pool === P10 && deux.tickSpacing === 10 && deux.trouvees === 2, 'pool vide a 1 + profonde a 10 -> la profonde (' + deux.pool + ' ts ' + deux.tickSpacing + ')');
const une = await PF.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1 }, profondeurs: {} }), a: A, b: X });
ok(une.etat === 'PRET' && une.pool === P1, 'une seule pool trouvee : comportement d avant');
const aveugle = await PF.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1, 10: P10 }, profondeurs: {}, profondeurIllisible: true }), a: A, b: X });
ok(aveugle.etat === 'NON_MESURE', 'deux pools, aucune profondeur lisible : NON_MESURE, jamais un choix au hasard');
/* 2026-10-10 (serie complete sous charge) : AMZNc a choisi sa pool VIDE — la profondeur de la vraie n avait pas ete lue */
const partielle = await PF.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1, 10: P10 }, profondeurs: { [P1]: 0n, [P10]: 845308n * 10n ** 6n }, illisibles: [P10] }), a: A, b: X });
ok(partielle.etat === 'NON_MESURE' && /depth of 1 could not be read/.test(String(partielle.pourquoi)),
  'deux pools, la VIDE lue et la profonde NON lue : NON_MESURE (' + partielle.etat + ', ' + (partielle.pool || partielle.pourquoi) + ') — jamais la vide par defaut');

/* C. mutant : l ancienne regle (premiere trouvee) */
const src = fs.readFileSync(path.join(ICI, 'plan-franchissement.js'), 'utf8');
const motif = 'const choisie = lues.length ? lues.reduce((m, x) => (x.prof > m.prof ? x : m)) : trouvees[0];';
ok(src.includes(motif), 'motif du mutant present');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-aero-mut-'));
for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'plan-franchissement.js'), src.replace(motif, 'const choisie = trouvees[0];'));
const PFm = await imp('plan-franchissement.js', dir);
const m = await PFm.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1, 10: P10 }, profondeurs: { [P1]: 0n, [P10]: 845308n * 10n ** 6n } }), a: A, b: X });
ok(m.pool === P1, 'MUTANT « premiere trouvee » : prend la pool vide — le cas A la distingue');
/* mutant 2 : la garde du 2026-10-10 retiree -> la comparaison partielle reprend la vide */
const garde = 'if (trouvees.length > 1 && lues.length < trouvees.length) {';
ok(src.includes(garde), 'motif du mutant 2 present');
fs.writeFileSync(path.join(dir, 'plan-franchissement.js'), src.replace(garde, 'if (false) {'));
const PFm2 = await imp('plan-franchissement.js', dir); /* imp contourne deja le cache des modules (?v=…) */
const m2 = await PFm2.poolAerodromeDe({ rpc: fictif({ pools: { 1: P1, 10: P10 }, profondeurs: { [P1]: 0n, [P10]: 845308n * 10n ** 6n }, illisibles: [P10] }), a: A, b: X });
ok(m2.etat === 'PRET' && m2.pool === P1, 'MUTANT 2 « garde partielle retiree » : choisit la pool vide (' + (m2.pool || m2.etat) + ') — le cas partiel le distingue');
fs.rmSync(dir, { recursive: true, force: true });

/* B. temoin on-chain */
const rpc = async (method, params) => {
  for (let e = 0; e < 6; e += 1) {
    try { const j = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
      if (!j.error) return j.result; if (!/rate|limit/i.test(j.error.message)) throw new Error(j.error.message); } catch (x) { if (!/rate|limit|fetch|timeout/i.test(String(x.message))) throw x; }
    await new Promise((o) => setTimeout(o, 800 * (e + 1)));
  }
  throw new Error('rate limit');
};
for (const sym of ['MUc', 'PLTRc', 'AMZNc']) {
  const [adr, t] = [...T.POOLS_ACTIONS_AERODROME].find(([, x]) => x.symbole === sym);
  let r = null;
  try { r = await PF.poolAerodromeDe({ rpc, a: USDC_BASE, b: adr }); } catch (e) { r = { etat: 'ERREUR', pourquoi: String(e.message) }; }
  ok(r.etat === 'PRET' && bas(r.pool) === t.pool, sym + ' : la pool choisie est la profonde de la table (' + (r.pool || r.etat) + ', ' + (r.trouvees || '?') + ' trouvees)');
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
