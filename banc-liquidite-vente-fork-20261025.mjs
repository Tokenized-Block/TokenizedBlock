/* banc-liquidite-vente-fork-20261025.mjs — LA VENTE ROUTEE PAR LE MEILLEUR LIEU DE VENTE QUI PASSE, ET L ECRAN QUI DIT CE LIEU (revue de
 * 3d81e06, defaut 1 : AMZN vendu par 'aero-new' pendant que l ecran nommait notre routeur ; NOKc l inverse).
 *
 * FORK SEULEMENT : FORK_URL (defaut http://127.0.0.1:8632) doit etre un anvil BASE (anvil_nodeInfo.forkConfig) :
 *   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/anvil --base --fork-url https://base-rpc.publicnode.com --chain-id 8453 --port 8632
 *   Impersonation et anvil_setBalance sur le fork uniquement ; eth_sendTransaction depuis des comptes impersonnes — rien n est signe.
 * Pour chaque action de SYMS (defaut AMZN,NOKc) :
 *   1. LA DECISION DU SERVEUR, recalculee SUR LE FORK par ses propres fonctions : routeAction (notre route) + coterVenueCL('aero-new', quoter
 *      patche en override) + venuesServies (registre + strictement meilleur) — la forme que sert serveur-web.js a planRail ;
 *   2. achat de 10 USDC par planRail (approbation si demandee, puis le plan PRET), execute ;
 *   3. vente de TOUT ce qui a ete recu par planRail, avec un lecteur de reference (le chemin du serveur qui attache `vente`) ;
 *      on garde : le lieu du plan (`venue`/`pool`), `vente.ici`, le texte, les devis par lieu ; puis on EXECUTE et on verifie
 *      que (a) la transaction part vers le routeur du lieu que l ecran nomme, (b) le recu >= le minimum montre,
 *      (c) le lieu emprunte est le mieux cote PARMI LES LIEUX QUI PASSENT a ce montant. */
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
import { planRail } from './rails-api.js';
import { ROUTEUR_AERO_NOUVEAU, coterVenueCL, venuesServies, passantsVente, codeQuoteurNouvelle, overrideQuoteur } from './liquidite-actions.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { routeAction, routeServie } from './actions-chaine.js';
import { estDeviseConnue } from './pool-sans-hook.js';
import { ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';

const FORK = process.env.FORK_URL || 'http://127.0.0.1:8632';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TESTEUR = '0x1000000000000000000000000000000000000e0e';
const ADRS = { AMZN: '0xb200000000000000000000d9192b6b456483c2e8', NOKc: '0xb2000000000000000000005ac674f707e357409c' };
const SYMS = (process.env.SYMS || 'AMZN,NOKc').split(',');
let id = 1;
async function rpc(method, params = []) {
  const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; } return j.result;
}
const w = (a) => a.toLowerCase().slice(2).padStart(64, '0'), n = (x) => BigInt(x).toString(16).padStart(64, '0');
const solde = async (t, a) => BigInt('0x' + (await rpc('eth_call', [{ to: t, data: selecteur('balanceOf(address)') + w(a) }, 'latest'])).slice(2, 66));
async function envoyer(from, c) {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x1e8480' }]);
  let r = null; for (let i = 0; i < 60 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((ok) => setTimeout(ok, 250)); }
  assert.ok(r, 'no receipt'); return r;
}
const info = await rpc('anvil_nodeInfo').catch(() => null);
assert.ok(info && info.forkConfig, 'not an anvil fork: refusing to run');
assert.equal(await rpc('eth_chainId'), '0x2105');
for (const a of [PM, TESTEUR]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }
await envoyer(PM, { to: USDC, data: selecteur('transfer(address,uint256)') + w(TESTEUR) + n(100_000_000n) });
const maintenant = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16) * 1000;
const appel = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const code = codeQuoteurNouvelle(await rpc('eth_getCode', [QUOTEUR_AERODROME_CL, 'latest']));
assert.ok(code, 'quoter code shape');
const appelDevis = (to, data) => (String(to).toLowerCase() === QUOTEUR_AERODROME_CL ? rpc('eth_call', [{ to, data }, 'latest', overrideQuoteur(code)]) : appel(to, data));
/* la decision du serveur, par ses fonctions, sur l etat du fork */
async function decisionServeur(a) {
  const r = await routeAction({ appel, adr: a });
  assert.equal(r.etat, 'OK', 'our route not read: ' + r.pourquoi);
  const servi = routeServie(r);
  const cN = await coterVenueCL({ appel, appelDevis, venue: 'aero-new', adr: a });
  assert.equal(cN.etat, 'OK', 'aero-new not read');
  Object.assign(servi, venuesServies({ route: servi, coteNeuve: cN, admise: estDeviseConnue(a) }));
  return servi;
}
const routeurDe = (venue) => (venue === 'aero-new' ? ROUTEUR_AERO_NOUVEAU : venue === 'aero-old' ? ROUTEUR_AERODROME_CL : null);
const res = [];
for (const sym of SYMS) {
  const a = ADRS[sym]; assert.ok(a, sym + ': unknown');
  const servi = await decisionServeur(a);
  /* ACHAT_PAR_NOTRE_ROUTE=1 : l ACHAT seul passe par notre routeur (verdict d achat force a 'aero-old') — il pousse le prix de NOTRE pool,
   *   pour reproduire le cas AMZN de la revue (verdict d achat 'aero-new', vente mieux payee par notre route). La VENTE garde le verdict vrai. */
  const forcerAchat = process.env.ACHAT_PAR_NOTRE_ROUTE === '1';
  const deps = async (pourAchat = false) => ({ rpc, chaine: 8453, maintenant: await maintenant(),
    venueAction: () => (pourAchat && forcerAchat ? { ...servi, meilleure: 'aero-old' } : servi), reference: async () => null });
  const etapes = [];
  /* une jambe : planRail, approbations envoyees si demandees, puis le plan PRET (ses appels dans l ordre) */
  const jambe = async (de, vers, montant) => {
    const pourAchat = de === USDC;
    let p = await planRail({ de, vers, montant: String(montant), compte: TESTEUR }, await deps(pourAchat));
    etapes.push(p.etat);
    for (let k = 0; k < 2 && p.etat === 'APPROBATIONS'; k++) {
      for (const c of p.aSigner) assert.equal((await envoyer(TESTEUR, c)).status, '0x1');
      p = await planRail({ de, vers, montant: String(montant), compte: TESTEUR }, await deps(pourAchat));
      etapes.push(p.etat);
    }
    assert.equal(p.etat, 'PRET', sym + ' ' + p.pourquoi);
    const avant = await solde(vers, TESTEUR);
    let dernier = null;
    for (const c of p.aSigner) { const r = await envoyer(TESTEUR, c); assert.equal(r.status, '0x1', sym + ' reverted'); dernier = c; }
    const recu = (await solde(vers, TESTEUR)) - avant;
    assert.ok(recu >= BigInt(p.resume.recoitAuMoins), sym + ' received less than the minimum shown');
    return { p, recu, versRouteur: String(dernier.to).toLowerCase() };
  };
  const achat = await jambe(USDC, a, 10_000_000n);
  const vente = await jambe(a, USDC, achat.recu);
  const pv = vente.p;
  assert.ok(pv.vente && typeof pv.vente.texte === 'string', sym + ': the sale comparison is attached to the plan');
  const ici = pv.vente.ici;
  /* (a) l ecran nomme le lieu que la transaction EMPRUNTE */
  assert.equal(vente.versRouteur, routeurDe(ici), sym + ': the screen says ' + ici + ' but the swap went to ' + vente.versRouteur);
  assert.ok(pv.vente.texte.startsWith('Selling through '), sym + ': ' + pv.vente.texte);
  /* (c) le lieu emprunte est le mieux cote parmi ceux qui passent, au montant vendu (devis lus juste avant le plan) */
  const passants = passantsVente({ route: servi, existante: POOLS_ACTIONS_AERODROME.has(a) ? 'aero-old' : 'uniswap-v4' });
  const q = (v) => { const x = (pv.vente.ventes || []).find((y) => y.venue === v); return x ? BigInt(x.usdc) : null; };
  for (const v of passants) if (v !== ici && q(v) !== null && q(ici) !== null) assert.ok(q(ici) >= q(v), sym + ': ' + v + ' passes and quotes more than ' + ici);
  res.push({ sym, adr: a, serveur: { achetable: servi.achetable, code: servi.code ?? null, meilleure: servi.meilleure ?? null, aeroNew: servi.venues ? servi.venues['aero-new'] : null },
    etapes, achat: { via: achat.p.via, venue: achat.p.venue || achat.p.pool || null, recu: String(achat.recu), versRouteur: achat.versRouteur },
    vente: { via: pv.via, venuePlan: pv.venue || pv.pool || null, ici, choix: pv.vente.choix, texte: pv.vente.texte, ventes: pv.vente.ventes, recuUsdc: String(vente.recu), auMoins: String(pv.resume.recoitAuMoins), versRouteur: vente.versRouteur } });
  console.log(sym.padEnd(6), 'server best buy', servi.meilleure, '| bought via', achat.p.via, '| sale', pv.via, '->', vente.versRouteur, '| screen:', pv.vente.texte, '| received', (Number(vente.recu) / 1e6).toFixed(6), 'USDC (min', (Number(pv.resume.recoitAuMoins) / 1e6).toFixed(6) + ')');
}
const sortie = process.env.SORTIE || 'mesures/liquidite-vente-fork-20261025.json';
fs.writeFileSync(sortie, JSON.stringify({ blocFork: parseInt(await rpc('eth_blockNumber'), 16), lu: new Date().toISOString(), feeWallet: FEE_WALLET, res }, null, 1));
console.log('sale routing on fork:', res.length, 'stocks — screen venue == executed router on all ->', sortie);
