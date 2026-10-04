/* banc-devises-fork-20261004.mjs — UNE DEVISE CONTRE UNE AUTRE (ETH, USDC, OUSD, cbBTC, TOSHI), EXECUTE SUR UN FORK.
 *
 * POURQUOI. QA wallet reel de Grok (2026-10-04, P0) : le planificateur refusait « swap 5 USDC to ETH » (« route USDC>ETH is not
 *   offered by this API yet »). rails-api.js porte maintenant une route devise > devise (directe, sinon par USDC, sinon par ETH).
 * CE QUE LE BANC FAIT : pour chaque paire ordonnee des devises proposables de paires.js, il demande le plan, signe les approbations
 *   (flux de l app : approbations, puis re-plan), envoie le swap, et juge sur les SOLDES : le compte recoit la devise demandee,
 *   au moins le minimum annonce, et le wallet des frais est paye. Une paire refusee est AFFICHEE avec sa raison — ce n est pas
 *   un KO : le banc dit ce que le marche permet aujourd hui, il ne l invente pas.
 * UN KO : un plan PRET qui reverte ; un swap execute qui ne livre rien ; un swap execute qui ne paie rien au wallet des frais.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle), petits montants. Une devise que le compte ne detient pas est
 *   d abord ACHETEE par la route elle-meme (USDC > devise) : une devise qu on ne peut pas acheter ne peut pas etre essayee en
 *   entree, et le banc le dit. */
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { DEVISES_BASE, proposableEnEchange } from './paires.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) })).json(); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* reverterait : on l envoie pour LIRE le status 0 */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async () => [] });
/* sans argument : les 5 devises proposables du registre (~12 min) ; avec des symboles (ex. ETH USDC) : celles-la seulement */
const demandes = process.argv.slice(2).filter((x) => !/^https?:/.test(x));
const devises = DEVISES_BASE.filter((d) => proposableEnEchange(d) && d.chaines.includes(8453) && (!demandes.length || demandes.includes(d.symbole))).map((d) => ({ sym: d.symbole, adr: String(d.adr).toLowerCase() }));
const symDe = (a) => (devises.find((d) => d.adr === a) || {}).sym || a.slice(0, 8);

async function trader(de, vers, montant, compte) {
  const suivis = [...new Set([ETH, USDC, de, vers])];
  const avant = { c: {}, f: {} };
  for (const j of suivis) { avant.c[j] = await solde(j, compte); avant.f[j] = await solde(j, FRAIS); }
  let p = await plan(de, vers, montant, compte), gaz = 0n, tours = 0;
  while (p.etat === 'APPROBATIONS' && tours < 3) {
    tours += 1;
    for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; if (r.status !== '0x1') return { etat: 'APPROBATION_REVERTEE' }; }
    p = await plan(de, vers, montant, compte);
  }
  if (p.etat !== 'PRET') return { etat: p.etat, pourquoi: p.pourquoi };
  const statuts = [];
  for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; statuts.push(r.status); if (r.status !== '0x1') break; }
  const nom = symDe(de) + ' > ' + symDe(vers);
  if (!ok(statuts.every((s) => s === '0x1'), nom + ' : plan PRET mais un appel REVERTE (status ' + statuts.join(', ') + ')')) return { etat: 'REVERTE' };
  const d = { c: {}, f: {} };
  for (const j of suivis) { d.c[j] = await solde(j, compte) - avant.c[j]; d.f[j] = await solde(j, FRAIS) - avant.f[j]; }
  d.c[ETH] += gaz;
  const frais = suivis.filter((j) => d.f[j] > 0n).map((j) => d.f[j] + ' ' + symDe(j));
  ok(d.c[vers] > 0n, nom + ' : execute, mais le compte ne recoit rien');
  ok(frais.length > 0, nom + ' : execute SANS RIEN payer au wallet des frais');
  const min = p.resume && p.resume.recoitAuMoins !== undefined ? BigInt(p.resume.recoitAuMoins) : null;
  if (min !== null) ok(d.c[vers] >= min, nom + ' : recu ' + d.c[vers] + ' < minimum annonce ' + min);
  const bps = d.f[de] > 0n && -d.c[de] > 0n ? Number(d.f[de] * 100000n / -d.c[de]) / 10 : null;
  return { etat: 'EXECUTE', sauts: (p.chemin || []).length, recu: d.c[vers], frais, bps };
}

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · bloc ' + tete + ' · devises : ' + devises.map((d) => d.sym).join(', '));
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const instantane = await rpc('evm_snapshot', []);
const bilan = { executes: 0, refuses: 0 };
try {
  const compte = '0x' + ('de715e' + tete).padEnd(40, '6').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (5n * 10n ** 18n).toString(16)]);
  const source = [...POOLS_ACTIONS_AERODROME.values()][0].pool;
  await rpc('anvil_impersonateAccount', [source]);
  await rpc('anvil_setBalance', [source, '0x' + (10n ** 18n).toString(16)]);
  await envoyer(source, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + (2000n * 10n ** 6n).toString(16).padStart(64, '0') });
  const montantDe = async (d) => (d.adr === ETH ? 5n * 10n ** 15n : d.adr === USDC ? 20n * 10n ** 6n : (await solde(d.adr, compte)) / 3n);
  /* 1. depuis USDC et depuis ETH vers chaque autre devise (cela fournit aussi au compte de quoi essayer les retours) */
  for (const de of devises.filter((d) => d.adr === USDC || d.adr === ETH)) {
    for (const vers of devises.filter((d) => d.adr !== de.adr)) {
      const r = await trader(de.adr, vers.adr, await montantDe(de), compte);
      bilan[r.etat === 'EXECUTE' ? 'executes' : 'refuses'] += 1;
      console.log((de.sym + ' > ' + vers.sym).padEnd(16) + (r.etat === 'EXECUTE' ? 'OK · ' + r.sauts + ' saut(s) · frais ' + r.frais.join(' + ') + (r.bps !== null ? ' = ' + r.bps + ' bps' : '') : r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 110) + ')' : '')));
    }
  }
  /* 2. depuis chaque autre devise, si le compte en detient maintenant */
  for (const de of devises.filter((d) => d.adr !== USDC && d.adr !== ETH)) {
    for (const vers of devises.filter((d) => d.adr !== de.adr)) {
      const m = await montantDe(de);
      if (!(m > 0n)) { console.log((de.sym + ' > ' + vers.sym).padEnd(16) + 'NON ESSAYE (le compte ne detient pas de ' + de.sym + ' : aucun achat n a abouti)'); continue; }
      const r = await trader(de.adr, vers.adr, m, compte);
      bilan[r.etat === 'EXECUTE' ? 'executes' : 'refuses'] += 1;
      console.log((de.sym + ' > ' + vers.sym).padEnd(16) + (r.etat === 'EXECUTE' ? 'OK · ' + r.sauts + ' saut(s) · frais ' + r.frais.join(' + ') + (r.bps !== null ? ' = ' + r.bps + ' bps' : '') : r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 110) + ')' : '')));
    }
  }
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\nBILAN : ' + bilan.executes + ' paire(s) executee(s), ' + bilan.refuses + ' refusee(s) ou non mesuree(s)');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
