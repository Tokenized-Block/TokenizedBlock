/* test-memestock-devise-connue-20261003.mjs — UN BLOCK TIERS COTE DANS UNE DEVISE CONNUE ET VENDABLE, SUR UN HOOK TIERS,
 * SE TRADE ICI AVEC NOTRE 0,5 % PRIS DANS LA DEVISE (Phil, 2026-10-03 : « l appliquer de partout »).
 * HORS RESEAU (RPC de laboratoire) : la REGLE D ADMISSION de planEchange, pour chaque devise connue (USDC, OUSD, cbBTC,
 * TOSHI, une action), avec les deux garde-fous qui restent : prix + liquidite LUS (fraisDevisesOk) sinon refus, et une
 * devise INCONNUE toujours refusee. La preuve au wei sur fork est dans banc-memestock-tiers-fork-20261003.mjs.
 * MUTANT (copie, code seul) : l admission ramenee aux seules actions -> USDC/OUSD/cbBTC/TOSHI refuses -> ce test le voit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();
const BLOCK = '0xb200000000000000000000' + '9'.repeat(18); /* un block tiers fictif */
const COMPTE = '0x' + '1'.repeat(40);
const HOOK_TIERS = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc'; /* le lanceur de SI, COBALT, Walle, POKEMON (mesure prod) */
const rpcLabo = async (methode) => {
  if (methode === 'eth_call') return '0x' + (10n ** 8n).toString(16).padStart(64, '0');
  if (methode === 'eth_getBalance') return '0x' + (10n ** 20n).toString(16);
  if (methode === 'eth_blockNumber') return '0x3160000';
  return '0x';
};
const marcheEn = (devise) => ({ etat: 'LUE', vie: 10, devise: 'X', via: 'v4', decimales: 18,
  cle: { currency0: bas(devise) < BLOCK ? bas(devise) : BLOCK, currency1: bas(devise) < BLOCK ? BLOCK : bas(devise), fee: 0, tickSpacing: 200, hooks: HOOK_TIERS } });
const jouer = async (E, devise, mesuree) => E.planEchange({ rpc: rpcLabo, chaine: 8453, jeton: BLOCK, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 6n,
  marcheLu: marcheEn(devise), fraisDevisesOk: mesuree ? new Set([bas(devise)]) : new Set() });

const E = await imp('echange.js');
const P = await imp('paires.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const devises = [['USDC', USDC_BASE], ...['OUSD', 'cbBTC', 'TOSHI'].map((s) => [s, P.DEVISES_BASE.find((d) => d.symbole === s).adr]),
  ['NVDAc', P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr]];
for (const [sym, adr] of devises) {
  const p = await jouer(E, adr, true);
  ok(p.etat !== 'REFUSE' && p.resume && BigInt(p.resume.fraisBps) === 50n && p.resume.beneficiaireFrais === FEE_WALLET && p.resume.fraisDevise === 'pair',
    sym + ' mesuree, hook tiers : admis, 50 bps vers a6cf, dans la devise (' + p.etat + ' ' + (p.pourquoi || '') + ')');
  if (sym !== 'USDC') {
    const q = await jouer(E, adr, false);
    ok(q.etat === 'REFUSE' && /could not price|sellable/i.test(q.pourquoi), sym + ' NON mesuree : refus « pas vendable » (' + q.etat + ')');
  }
}
const inconnue = await jouer(E, '0x' + '7'.repeat(40), true);
ok(inconnue.etat === 'REFUSE' && /not a TokenizedBlock market/.test(inconnue.pourquoi), 'devise inconnue (meme « mesuree ») sur hook tiers : refusee');

/* MUTANT : l admission ramenee aux seules actions Coinbase */
const src = fs.readFileSync(path.join(ICI, 'echange.js'), 'utf8');
const motif = 'const deviseVendable = estDeviseConnue(deviseTiers) || ACTIONS_COINBASE.some(';
ok(src.includes(motif), 'motif du mutant present');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-devise-connue-'));
for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'echange.js'), src.replace(motif, 'const deviseVendable = ACTIONS_COINBASE.some('));
const Em = await imp('echange.js', dir);
const mO = await jouer(Em, P.DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr, true);
const mN = await jouer(Em, P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr, true);
ok(mO.etat === 'REFUSE' && mN.etat !== 'REFUSE', 'MUTANT « actions seules » : OUSD refuse, NVDAc admis — le cas OUSD le distingue');
fs.rmSync(dir, { recursive: true, force: true });
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
