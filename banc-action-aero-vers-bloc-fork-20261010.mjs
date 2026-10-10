/* banc-action-aero-vers-bloc-fork-20261010.mjs — P4 (2026-10-10) : NVDAc (action de la table Aerodrome) PAIE un block v4 (IB022, cote en ETH)
 *   en UN lot atomique : Aerodrome NVDAc -> USDC, puis Uniswap v4 USDC -> ETH -> IB022 (rails-api.js, branche 4 ter).
 * AFFIRME sur un fork de Base (base-anvil, compte usurpe) : plan PRET, `atomique`, appels executes sans revert dans l ordre du lot,
 *   IB022 recu >= minimum, frais verse dans UNE devise et JAMAIS en block ; TEMOIN NEGATIF : la jambe v4 seule (sans la jambe
 *   Aerodrome) reverte — le lot n a de sens qu atomique. NE PROUVE PAS : l envoi groupe EIP-5792 d un vrai wallet (ici les appels
 *   partent un par un depuis le meme compte, dans le meme ordre).
 * Usage : node banc-action-aero-vers-bloc-fork-20261010.mjs [url du fork, defaut http://127.0.0.1:8549]
 */
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
  const compte = '0x' + ('a7e0' + tete).padEnd(40, 'e').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const nv = sym('NVDAc');
  ok(POOLS_ACTIONS_AERODROME.has(nv), 'NVDAc est une action de la table Aerodrome');
  const achat = await trader('ETH > NVDAc (mise en place)', ETH, nv, 2n * 10n ** 15n, compte, [ETH, nv]);
  if (!ok(achat.etat === 'EXECUTE' && achat.recu > 0n, 'le compte detient du NVDAc (' + (achat.recu || 0n) + ' unites)')) throw new Error('setup: ' + JSON.stringify(achat).slice(0, 200));
  const jetons = [ETH, USDC, nv, IB022];
  /* TEMOIN NEGATIF d abord (snapshot) : la jambe v4 seule reverte, le compte n a pas l USDC */
  const p0 = await plan(nv, IB022, achat.recu, compte);
  ok(p0.etat === 'PRET' && p0.atomique === true && p0.via === 'actionAerodromeVersBloc', 'NVDAc > IB022 : plan PRET, atomique (via ' + p0.via + ', ' + p0.etat + (p0.pourquoi ? ' — ' + String(p0.pourquoi).slice(0, 120) : '') + ')');
  if (p0.etat === 'PRET') {
    const s0 = await rpc('evm_snapshot', []);
    const v4 = p0.aSigner.slice(2);
    let st = [];
    for (const c of v4) { const r = await envoyer(compte, c); st.push(r.status); }
    ok(st[st.length - 1] !== '0x1', 'TEMOIN NEGATIF : la jambe v4 seule (sans Aerodrome) reverte : ' + st.join(','));
    await rpc('evm_revert', [s0]);
  }
  const r = await trader('NVDAc > IB022', nv, IB022, achat.recu, compte, jetons);
  if (ok(r.etat === 'EXECUTE', 'NVDAc > IB022 : ' + r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 160) + ')' : ''))) {
    ok(r.recu > 0n && r.recu >= BigInt(r.resume.recoitAuMoins), 'NVDAc > IB022 : recu ' + r.recu + ' >= minimum ' + r.resume.recoitAuMoins);
    ok(r.frais.length === 1, 'frais dans UNE devise : ' + r.frais.map(([j, v]) => v + ' ' + nom(j)).join(' + '));
    ok(!r.frais.some(([j]) => j === IB022 || j === nv), 'aucun frais en block (ni en action)');
    console.log('     resume : fraisParHook ' + r.resume.fraisParHook + ' · fraisBpsJambe1 ' + r.resume.fraisBpsJambe1 + ' · fraisBpsJambe2 ' + r.resume.fraisBpsJambe2 + ' · fraisMarcheBps ' + r.resume.fraisMarcheBps + ' · pivotAuMoins ' + r.resume.pivotAuMoins);
    const resteU = await solde(USDC, compte);
    console.log('     USDC reste au compte : ' + resteU + ' unites (borne : la tolerance au-dela du minimum Aerodrome)');
  }
} finally { await rpc('evm_revert', [snap]); }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
