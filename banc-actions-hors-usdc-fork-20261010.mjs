import { POOLS_PIVOTS_AERODROME } from './plan-franchissement.js';
import fs from 'node:fs';
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { decoderInitialize } from './pools-du-jeton.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8561';
const demandes = process.argv.slice(2).filter((x) => !/^https?:/.test(x));
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } return c; };
const brut = async (method, params) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* reverterait : on l envoie pour LIRE le status 0 */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
/* les memes cles v4 que le serveur : les logs Initialize LUS, redecodes (poolId recalcule) */
const cles = new Map();
for (const l of LOGS_INITIALIZE_ACTIONS) {
  const d = decoderInitialize(l);
  if (!d || !d.cle) continue;
  for (const c of [d.cle.currency0, d.cle.currency1]) { const k = String(c).toLowerCase(); if (k !== USDC) cles.set(k, (cles.get(k) || []).concat([d.cle])); }
}
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async (a) => cles.get(String(a).toLowerCase()) || [] });

/** Une route, de bout en bout. Rend ce qui s est passe, mesure sur les soldes. */
async function trader(sym, de, vers, montant, compte, actionAdr) {
  const jetons = [...new Set([ETH, USDC, actionAdr, de, vers])];
  const avant = { c: {}, f: {} };
  for (const j of jetons) { avant.c[j] = await solde(j, compte); avant.f[j] = await solde(j, FRAIS); }
  let p = await plan(de, vers, montant, compte), gaz = 0n, tours = 0;
  const route = p.route;
  while (p.etat === 'APPROBATIONS' && tours < 3) {
    tours += 1;
    for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; if (r.status !== '0x1') return { route, etat: 'APPROBATION_REVERTEE', pourquoi: 'an approval reverted' }; }
    p = await plan(de, vers, montant, compte);
  }
  if (p.etat !== 'PRET') return { route, etat: p.etat, pourquoi: p.pourquoi, via: p.via };
  const statuts = [];
  for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; statuts.push(r.status); if (r.status !== '0x1') break; }
  const passe = statuts.every((s) => s === '0x1');
  ok(passe, sym + ' ' + route + ' : plan PRET (via ' + p.via + ') mais un appel REVERTE (status ' + statuts.join(', ') + ')');
  if (!passe) return { route, etat: 'REVERTE', via: p.via, pourquoi: 'status ' + statuts.join(', ') };
  const d = { c: {}, f: {} };
  for (const j of jetons) { d.c[j] = await solde(j, compte) - avant.c[j]; d.f[j] = await solde(j, FRAIS) - avant.f[j]; }
  d.c[ETH] += gaz; /* le gaz n est pas le prix du trade */
  const recu = d.c[vers], paye = -d.c[de];
  const frais = jetons.filter((j) => d.f[j] > 0n).map((j) => ({ jeton: j === ETH ? 'ETH' : j === USDC ? 'USDC' : j === actionAdr ? sym : j.slice(0, 8) + '…', montant: d.f[j], brut: j }));
  ok(recu > 0n, sym + ' ' + route + ' : execute, mais le compte ne recoit rien');
  ok(frais.length > 0, sym + ' ' + route + ' : execute (via ' + p.via + ') SANS RIEN payer au wallet des frais');
  /* le frais, rapporte a ce qui a ete paye ou recu dans la MEME unite — sinon on ne compare pas des pommes et des poires */
  let bps = null;
  for (const f of frais) {
    const base = f.brut === de ? paye : (f.brut === vers ? recu + f.montant : null);
    if (base && base > 0n) bps = Number(f.montant * 100000n / base) / 10;
  }
  return { route, etat: 'EXECUTE', via: p.via, pool: p.pool || null, recu, paye, frais, bps, annonce: p.resume && p.resume.fraisBps !== undefined ? Number(p.resume.fraisBps) : null };
}

/* ── banc-actions-hors-usdc-fork-20261010.mjs - X -> USDC -> action et action -> USDC -> X (X = WETH, cbBTC, EURC), route 4 quater ──
 *   Fork base-anvil a NOUS (port 8561 ; celui de Claude, 8549, n est pas touche), comptes impersonnes, aucune cle.
 *   Le compte recoit X depuis la pool X/USDC EPINGLEE ; chaque plan PRET est EXECUTE sur le fork et mesure sur les soldes.
 *   ⛔ BORNES : un fork au bloc affiche - ne prouve ni l interface ni un vrai wallet. Usage : node banc-actions-hors-usdc-fork-20261010.mjs [url] [SYMc ...] */
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete + ' · wallet des frais ' + FRAIS);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const X = [['WETH', '0x4200000000000000000000000000000000000006', 10n ** 16n], ['cbBTC', '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', 30000n], ['EURC', '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42', 20n * 10n ** 6n]];
const pivotDe = (x) => { for (const [k, v] of POOLS_PIVOTS_AERODROME) if (k.split('|').includes(x)) return v.pool; return null; };
const aero = [...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => ({ adr: adr.toLowerCase(), ...t })).filter((a) => !demandes.length || demandes.includes(a.symbole));
const fmt = (r) => (!r ? '-' : r.etat !== 'EXECUTE' ? r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 90) + ')' : '') : 'OK recu ' + r.recu + ' · frais ' + r.frais.map((f) => f.montant + ' ' + f.jeton).join(' + ') + (r.bps !== null ? ' = ' + r.bps + ' bps' : ''));
const bilan = {};
const compter = (k, r) => { bilan[k] = bilan[k] || [0, 0]; bilan[k][1] += 1; if (r && r.etat === 'EXECUTE') bilan[k][0] += 1; };
const instantane = await rpc('evm_snapshot', []);
let serie = 0;
try {
  for (const [sx, xa, mise] of X) {
    const pool = pivotDe(xa);
    if (!ok(!!pool, sx + ' : pool X/USDC epinglee')) continue;
    await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
    for (const a of aero) {
      serie += 1;
      const compte = '0x' + ('ac720' + String(tete) + String(serie)).padEnd(40, 'd').slice(0, 40);
      await rpc('anvil_impersonateAccount', [compte]); await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
      await envoyer(pool, { to: xa, data: '0xa9059cbb' + adrMot(compte) + mot(mise) });
      let achat = null, vente = null;
      try {
        achat = await trader(a.symbole, xa, a.adr, mise, compte, a.adr);
        const detenu = await solde(a.adr, compte);
        if (detenu > 0n) vente = await trader(a.symbole, a.adr, xa, detenu / 2n, compte, a.adr);
      } catch (e) { ok(false, a.symbole + '/' + sx + ' : le banc a leve ' + String((e && e.message) || e).slice(0, 140)); }
      /* un plan PRET qui revert est un KO (trader) ; un REFUSE / NON_MESURE nomme est rapporte, pas compte KO */
      compter(sx + '>ACTION', achat); compter('ACTION>' + sx, vente);
      console.log(a.symbole.padEnd(7) + ' ' + sx.padEnd(5) + ' achat : ' + fmt(achat) + '\n                vente : ' + fmt(vente));
    }
  }
} finally { await rpc('evm_revert', [instantane]); }
console.log('\nBILAN (executes / essayes) : ' + Object.entries(bilan).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(' · '));
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) - fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);