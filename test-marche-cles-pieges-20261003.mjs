/* test-marche-cles-pieges-20261003.mjs — vieDuBlock n elit pas une pool PIEGE (frais LP statique > 10 %) comme « le marche ».
 * ⛔ MESURE (2026-10-03) : BLUEPILL (26 952 $ / 24 h sur sa pool HIMSc) a six cles exactes, dont une pool ETH sans hook a
 *   88,0238 % de frais LP (liquidite 0) et une pool USDC a 75 %. La pool ETH etait lue la premiere : le block paraissait cote
 *   en ETH, sa vraie pool n etait jamais atteinte, et l echange etait refuse.
 * A. TEMOIN ON-CHAIN (lecture seule) : avec ses six cles (resolues par /api/cle de la prod), le marche lu est la pool HIMSc.
 * B. MUTANT (code seul, copie temporaire) : sans le filtre, le marche lu redevient la pool ETH a 88 %.
 * ⛔ BORNE : prouve le CHOIX de la pool au bloc lu, pas la liquidite future ; le frais dynamique (0x800000) n est pas teste. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();
const BP = '0xb2000000000000000000006745009423d9a49401';
const HIMSC = '0xb20000000000000000000043a599976181bcf336';
const Z = '0x0000000000000000000000000000000000000000';
const CLES = [
  { currency0: HIMSC, currency1: BP, fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' },
  { currency0: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', currency1: BP, fee: 750000, tickSpacing: 7500, hooks: Z },
  { currency0: Z, currency1: BP, fee: 880238, tickSpacing: 200, hooks: Z },
  { currency0: '0x4fc59c42653e052c7ab5c8381f839e2d70504131', currency1: BP, fee: 0, tickSpacing: 1, hooks: '0xac99958349e1fbfb84c17b7aa1a7352ed893a8c0' },
  { currency0: Z, currency1: BP, fee: 871435, tickSpacing: 9303, hooks: Z },
  { currency0: '0x4fc59c42653e052c7ab5c8381f839e2d70504131', currency1: BP, fee: 0, tickSpacing: 1, hooks: '0xd728e21274dc980d088d2b2e8de7a3dfcc5028c0' },
];
const P = await imp('paires.js');
ok(bas(P.ACTIONS_COINBASE.find((x) => x.symbole === 'HIMSc').adr) === HIMSC, 'HIMSC est HIMSc dans le registre');
const rpc = async (method, params) => {
  for (let e = 0; e < 6; e += 1) {
    try {
      const j = await fetch('https://mainnet.base.org', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
      if (!j.error) return j.result;
      if (!/rate|limit/i.test(j.error.message)) throw new Error(j.error.message);
    } catch (x) { if (!/rate|limit|fetch|timeout|abort/i.test(String(x.message))) throw x; }
    await new Promise((o) => setTimeout(o, 800 * (e + 1)));
  }
  throw new Error('rate limit');
};
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const M = await imp('marche.js');
const v = await M.vieDuBlock({ rpc, stateView: SV, jeton: BP, clesExactes: CLES });
ok(v.etat === 'LUE' && bas(v.cle.currency0) === HIMSC && v.cle.fee === 0, 'A. marche lu = la pool HIMSc (' + v.etat + ' ' + (v.via || v.pourquoi) + ')');
ok(!(v.cle && Number(v.cle.fee) > 100000), 'A. jamais une pool a frais LP statique > 10 %');

const src = fs.readFileSync(path.join(ICI, 'marche.js'), 'utf8');
const motif = '&& (Number(c.fee) <= FRAIS_LP_MAX_MARCHE || Number(c.fee) === FRAIS_DYNAMIQUE));';
ok(src.includes(motif), 'B. motif du mutant present');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-cles-pieges-'));
for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'marche.js'), src.replace(motif, ');'));
const Mm = await imp('marche.js', dir);
const vm = await Mm.vieDuBlock({ rpc, stateView: SV, jeton: BP, clesExactes: CLES });
ok(vm.cle && Number(vm.cle.fee) === 880238, 'B. MUTANT sans filtre : la pool ETH a 88 % redevient « le marche » — A la distingue (' + (vm.via || vm.pourquoi) + ')');
fs.rmSync(dir, { recursive: true, force: true });
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
