/* banc-bloc-vers-action-fork-20261010.mjs — UN BLOCK SE VEND CONTRE UNE ACTION A POOL v4, ET L INVERSE, EXECUTE SUR UN FORK.
 *
 * POURQUOI (QA de Phil, 2026-10-10) : IB022 > LLYc / GMEc / DJTc etait REFUSE dans le panneau (« a block sells here for its own
 *   quote token, another block, or a tokenized stock with a measured Aerodrome pool »). La route passe maintenant en UN appel au
 *   routeur : block -> ETH -> USDC -> action (rails-api.js, route 2). L inverse (action -> USDC -> ETH -> block) est la route 5.
 * CE QUI EST UN KO : un plan PRET dont un appel reverte ; un trade execute ou le compte ne recoit rien ; un trade execute ou le
 *   wallet des frais ne recoit RIEN, ou recoit dans PLUS D UNE devise (regle « une fois par swap »), ou recoit du BLOCK.
 * TEMOIN NEGATIF : un block contre une action de la table Aerodrome (NVDAc) n est PAS rendu par cette route (il reste un
 *   franchissement, via planFranchissement) — la nouvelle branche ne s applique qu aux actions a pool v4.
 * ⛔ BORNES : fork (anvil, comptes impersonnes, aucune cle) au bloc affiche ; ne prouve ni l interface ni un vrai wallet.
 * Usage : anvil --fork-url <rpc Base> --port 8549, puis node banc-bloc-vers-action-fork-20261010.mjs [http://127.0.0.1:8549] */
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { ACTIONS_COINBASE } from './paires.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { decoderInitialize } from './pools-du-jeton.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import fs from 'node:fs';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const rpc = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* on l envoie pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
const cles = new Map();
for (const l of LOGS_INITIALIZE_ACTIONS) {
  const d = decoderInitialize(l);
  if (!d || !d.cle) continue;
  for (const c of [d.cle.currency0, d.cle.currency1]) { const k = String(c).toLowerCase(); if (k !== USDC) cles.set(k, (cles.get(k) || []).concat([d.cle])); }
}
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async (a) => cles.get(String(a).toLowerCase()) || [] });
async function trader(nom, de, vers, montant, compte, jetons) {
  const avant = { c: {}, f: {} };
  for (const j of jetons) { avant.c[j] = await solde(j, compte); avant.f[j] = await solde(j, FRAIS); }
  let p = await plan(de, vers, montant, compte), gaz = 0n, tours = 0;
  while (p.etat === 'APPROBATIONS' && tours < 3) {
    tours += 1;
    for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; if (r.status !== '0x1') return { etat: 'APPROBATION_REVERTEE' }; }
    p = await plan(de, vers, montant, compte);
  }
  if (p.etat !== 'PRET') return { etat: p.etat, pourquoi: p.pourquoi, via: p.via };
  const st = [];
  for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; st.push(r.status); if (r.status !== '0x1') break; }
  if (!ok(st.every((s) => s === '0x1'), nom + ' : plan PRET (' + p.via + ') execute sans revert')) return { etat: 'REVERTE' };
  const d = { c: {}, f: {} };
  for (const j of jetons) { d.c[j] = await solde(j, compte) - avant.c[j]; d.f[j] = await solde(j, FRAIS) - avant.f[j]; }
  d.c[ETH] += gaz;
  return { etat: 'EXECUTE', via: p.via, recu: d.c[vers], paye: -d.c[de], frais: jetons.filter((j) => d.f[j] > 0n).map((j) => [j, d.f[j]]), resume: p.resume };
}
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
/* IB022 : adresse LUE dans le depot (pool-sans-hook.js, liste des blocks TB), jamais recopiee de memoire */
const IB022 = (fs.readFileSync(new URL('./pool-sans-hook.js', import.meta.url), 'utf8').match(/'(0x[0-9a-f]{40})', \/\* IB022 /) || [])[1];
if (!ok(/^0x[0-9a-f]{40}$/.test(String(IB022)), 'IB022 se lit dans pool-sans-hook.js')) process.exit(1);
const sym = (s) => String(ACTIONS_COINBASE.find((a) => a.symbole === s).adr).toLowerCase();
const nom = (j) => (j === ETH ? 'ETH' : j === USDC ? 'USDC' : j === IB022 ? 'IB022' : (ACTIONS_COINBASE.find((a) => String(a.adr).toLowerCase() === j) || {}).symbole || j.slice(0, 8));
const snap = await rpc('evm_snapshot', []);
try {
  const compte = '0x' + ('b10c' + tete).padEnd(40, 'd').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const achat = await trader('ETH > IB022 (mise en place)', ETH, IB022, 3n * 10n ** 15n, compte, [ETH, IB022]);
  if (!ok(achat.etat === 'EXECUTE' && achat.recu > 0n, 'le compte detient de l IB022 (' + (achat.recu || 0n) + ' unites)')) throw new Error('setup: ' + JSON.stringify(achat).slice(0, 200));
  const part = achat.recu / 4n;
  for (const s of ['LLYc', 'GMEc', 'DJTc']) {
    const a = sym(s), jetons = [ETH, USDC, IB022, a];
    const r = await trader('IB022 > ' + s, IB022, a, part, compte, jetons);
    if (!ok(r.etat === 'EXECUTE', 'IB022 > ' + s + ' : ' + r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 120) + ')' : ''))) continue;
    ok(r.via === 'planEchangeMultiSauts', 'IB022 > ' + s + ' : UN appel au routeur (via ' + r.via + ')');
    ok(r.recu > 0n, 'IB022 > ' + s + ' : le compte recoit ' + r.recu + ' unites de ' + s);
    ok(r.frais.length === 1, 'IB022 > ' + s + ' : le wallet des frais est paye dans UNE devise : ' + r.frais.map(([j, v]) => v + ' ' + nom(j)).join(' + '));
    ok(!r.frais.some(([j]) => j === IB022), 'IB022 > ' + s + ' : aucun frais verse en block');
    console.log('     resume : fraisBps ' + (r.resume && r.resume.fraisBps) + ' · fraisParHook ' + (r.resume && r.resume.fraisParHook) + ' · fraisMarcheBps ' + (r.resume && r.resume.fraisMarcheBps));
    /* l INVERSE : l action recue rachete du block (route 5) */
    const r2 = await trader(s + ' > IB022', a, IB022, r.recu, compte, jetons);
    if (!ok(r2.etat === 'EXECUTE', s + ' > IB022 : ' + r2.etat + (r2.pourquoi ? ' (' + String(r2.pourquoi).slice(0, 120) + ')' : ''))) continue;
    ok(r2.recu > 0n, s + ' > IB022 : le compte recoit ' + r2.recu + ' unites d IB022');
    ok(r2.frais.length === 1 && !r2.frais.some(([j]) => j === IB022), s + ' > IB022 : frais dans UNE devise, pas en block : ' + r2.frais.map(([j, v]) => v + ' ' + nom(j)).join(' + '));
  }
  /* 2026-10-10 (QA Grok) : IB022 > USDC, block cote en ETH vendu contre USDC en UN appel (block -> ETH -> USDC) */
  const ru = await trader('IB022 > USDC', IB022, USDC, part, compte, [ETH, USDC, IB022]);
  if (ok(ru.etat === 'EXECUTE', 'IB022 > USDC : ' + ru.etat + (ru.pourquoi ? ' (' + String(ru.pourquoi).slice(0, 120) + ')' : ''))) {
    ok(ru.via === 'planEchangeMultiSauts', 'IB022 > USDC : UN appel au routeur (via ' + ru.via + ')');
    ok(ru.recu > 0n, 'IB022 > USDC : le compte recoit ' + ru.recu + ' unites USDC');
    ok(ru.frais.length === 1 && !ru.frais.some(([j]) => j === IB022), 'IB022 > USDC : frais dans UNE devise, pas en block : ' + ru.frais.map(([j, v]) => v + ' ' + nom(j)).join(' + '));
    console.log('     resume : fraisBps ' + (ru.resume && ru.resume.fraisBps) + ' · fraisParHook ' + (ru.resume && ru.resume.fraisParHook) + ' · fraisMarcheBps ' + (ru.resume && ru.resume.fraisMarcheBps));
  }
  /* TEMOIN NEGATIF : une action de la table Aerodrome ne prend PAS la nouvelle branche */
  const nv = sym('NVDAc');
  ok(POOLS_ACTIONS_AERODROME.has(nv), 'NVDAc est dans la table Aerodrome (temoin)');
  const pn = await plan(IB022, nv, part, compte);
  ok(pn.via !== 'planEchangeMultiSauts', 'temoin negatif : IB022 > NVDAc ne passe PAS par la nouvelle branche v4 (via ' + pn.via + ', ' + pn.etat + ')');
} finally { await rpc('evm_revert', [snap]); }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
