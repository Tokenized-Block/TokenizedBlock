/* banc-marche-actions-fork-20261004.mjs — TOUT LE MARCHE DES ACTIONS TOKENISEES, EXECUTE SUR UN FORK, AVEC NOS FRAIS.
 *
 * POURQUOI. Phil, 2026-10-04 : « les trades avec action tokenisee sur l app comme sur Coinbase wallet, avec nos fees, si tout
 *   fonctionne — important, c est notre market tout entier ». Les bancs d avant prouvaient 3 actions sur un chemin ; aucun ne disait,
 *   pour CHAQUE action du registre, si on peut l acheter, la revendre, et si le wallet des frais est paye.
 *
 * CE QUE LE BANC FAIT, pour chaque action de ACTIONS_COINBASE (paires.js) et chaque route demandee au planificateur de prod
 *   (rails-api.js planRail, les memes cles v4 que le serveur) :
 *     USDC > ACTION, ETH > ACTION, ACTION > USDC, ACTION > ETH
 *   les appels rendus sont envoyes TELS QUELS depuis un compte neuf (approbations, puis re-plan, puis swap — le flux de l app).
 *   Tout se juge sur l ETAT apres la transaction : status du recu, soldes lus avant/apres (jamais un evenement).
 * CE QUI EST UN KO (le banc sort en erreur) :
 *   - un plan rendu PRET dont un appel REVERTE (l utilisateur aurait paye le gaz pour rien) ;
 *   - un trade execute qui ne paie RIEN au wallet des frais (ni ETH, ni USDC, ni l action) ;
 *   - un trade execute ou le compte ne recoit rien.
 * CE QUI N EST PAS UN KO, mais est COMPTE et affiche : une route refusee par le planificateur (pas de pool lue, route non offerte).
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle) au bloc affiche — ne prouve ni l interface, ni un vrai wallet, ni
 *   le prix de demain. L USDC d essai est pris a une pool Aerodrome du fork (un transfert impersonne, impossible sur la vraie chaine).
 *   Montants d essai petits (50 USDC, 0,01 ETH) : une pool fine peut refuser plus gros — le banc ne mesure pas la profondeur.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis
 *   node banc-marche-actions-fork-20261004.mjs [http://127.0.0.1:8549] [SYMc …]      (sans symbole : les 58) */
import fs from 'node:fs';
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
import { decoderInitialize } from './pools-du-jeton.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
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

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete + ' · wallet des frais ' + FRAIS);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);
const registre0 = ACTIONS_COINBASE.map((a) => ({ symbole: a.symbole, adr: String(a.adr).toLowerCase() }));
const registre = registre0.filter((a) => !demandes.length || demandes.includes(a.symbole));
const aero = [...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => ({ adr: adr.toLowerCase(), ...t }));
console.log(registre.length + ' actions essayees · ' + aero.length + ' pools Aerodrome en table · ' + cles.size + ' pools v4 lues');

const fmt = (r) => {
  if (!r) return '—';
  if (r.etat !== 'EXECUTE') return r.etat + (r.pourquoi ? ' (' + String(r.pourquoi).slice(0, 70) + ')' : '');
  return 'OK ' + (r.pool || (r.via === 'planAchatEthAction' ? 'aerodrome' : r.via)) + ' · frais ' + r.frais.map((f) => f.montant + ' ' + f.jeton).join(' + ') + (r.bps !== null ? ' = ' + r.bps + ' bps' : '');
};
const bilan = { 'USDC>ACTION': [0, 0], 'ETH>ACTION': [0, 0], 'ACTION>USDC': [0, 0], 'ACTION>ETH': [0, 0], 'ACTION>BLOCK': [0, 0], 'ACTION>ACTION': [0, 0] };
/* le block paye en action : celui que la sonde du serveur lit a chaque demarrage (adresse LUE dans serveur-web.js, jamais recopiee) */
const BLOCK_CIBLE = (fs.readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').match(/const BLOCK_SONDE = '(0x[0-9a-f]{40})';/) || [])[1];
if (!ok(/^0x[0-9a-f]{40}$/.test(String(BLOCK_CIBLE)), 'le block cible (BLOCK_SONDE du serveur) se lit dans serveur-web.js')) process.exit(1);
/* l autre action d un echange action>action : la premiere action a pool v4 qui n est pas celle traitee */
const autreV4 = (a) => registre0.find((x) => x.adr !== a && cles.has(x.adr) && !POOLS_ACTIONS_AERODROME.has(x.adr) && x.symbole !== 'CAKEc');
const compter = (route, r) => { bilan[route][1] += 1; if (r && r.etat === 'EXECUTE') bilan[route][0] += 1; };
const sansRoute = [];
const instantane = await rpc('evm_snapshot', []);
let serie = 0;
try {
  for (const a of registre) {
    serie += 1;
    const compte = '0x' + ('ac710' + String(tete) + String(serie)).padEnd(40, 'c').slice(0, 40);
    await rpc('anvil_impersonateAccount', [compte]);
    await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
    const source = aero.find((t) => t.adr !== a.adr && t.symbole === 'NVDAc') || aero.find((t) => t.adr !== a.adr);
    await rpc('anvil_impersonateAccount', [source.pool]);
    await rpc('anvil_setBalance', [source.pool, '0x' + (10n ** 18n).toString(16)]);
    const MISE = 50n * 10n ** 6n;
    await envoyer(source.pool, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + mot(MISE) });
    const lignes = {};
    try {
      lignes.au = await trader(a.symbole, USDC, a.adr, MISE, compte, a.adr);
      lignes.ae = await trader(a.symbole, ETH, a.adr, 10n ** 16n, compte, a.adr);
      const detenu = await solde(a.adr, compte);
      if (detenu > 0n) {
        /* un quart par sortie : USDC, ETH, un block, une autre action — les quatre sont essayees sur le meme compte */
        const part = detenu / 4n;
        lignes.vu = await trader(a.symbole, a.adr, USDC, part, compte, a.adr);
        lignes.ve = await trader(a.symbole, a.adr, ETH, part, compte, a.adr);
        lignes.vb = await trader(a.symbole, a.adr, BLOCK_CIBLE, part, compte, a.adr);
        const autre = autreV4(a.adr);
        const reste = await solde(a.adr, compte);
        lignes.va = autre && reste > 0n ? await trader(a.symbole, a.adr, autre.adr, reste, compte, a.adr) : null;
        if (lignes.va) lignes.va.vers = autre.symbole;
      }
    } catch (e) { ok(false, a.symbole + ' : le banc a leve ' + String((e && e.message) || e).slice(0, 140)); }
    compter('USDC>ACTION', lignes.au); compter('ETH>ACTION', lignes.ae); compter('ACTION>USDC', lignes.vu); compter('ACTION>ETH', lignes.ve);
    compter('ACTION>BLOCK', lignes.vb); compter('ACTION>ACTION', lignes.va);
    if (!lignes.au || lignes.au.etat !== 'EXECUTE') sansRoute.push(a.symbole);
    console.log(a.symbole.padEnd(8) + ' achat USDC : ' + fmt(lignes.au) + '\n         achat ETH  : ' + fmt(lignes.ae) + '\n         vente USDC : ' + fmt(lignes.vu) + '\n         vente ETH  : ' + fmt(lignes.ve)
      + '\n         paie un block : ' + fmt(lignes.vb) + '\n         contre ' + ((lignes.va && lignes.va.vers) || 'une action').padEnd(6) + ' : ' + fmt(lignes.va));
  }
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\nBILAN (executes / essayes) : ' + Object.entries(bilan).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(' · '));
console.log('sans achat possible en USDC (' + sansRoute.length + ') : ' + (sansRoute.join(', ') || 'aucune'));
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
