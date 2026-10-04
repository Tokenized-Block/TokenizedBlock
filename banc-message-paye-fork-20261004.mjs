/* banc-message-paye-fork-20261004.mjs — UN MESSAGE PAYE VERS UN BLOCK, EXECUTE SUR UN FORK : 0,10 USDC au wallet des frais.
 *
 * POURQUOI. Le prix d un message passe a 0,10 USDC (Phil, 2026-10-04). Le plan est UNE transaction : `USDC.transfer(wallet des
 *   frais, 100000)` avec le message colle derriere le calldata. Les tests hors reseau prouvent l encodage ; ce banc prouve que le
 *   VRAI USDC de Base l execute avec ces octets en plus, que le wallet des frais recoit exactement le prix, et que le message se
 *   RELIT depuis la transaction (pas depuis un evenement).
 * ⛔ BORNES : un fork (base-anvil, compte impersonne, aucune cle) — ne prouve ni un vrai wallet, ni l ecran. L USDC d essai est
 *   pris a une pool du fork par transfert impersonne.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-message-paye-fork-20261004.mjs */
import * as M from './messagerie-blocks.js';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) })).json(); if (r.error) throw new Error(r.error.message); return r.result; };
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (qui) => BigInt(await rpc('eth_call', [{ to: USDC, data: '0x70a08231' + adrMot(qui) }, 'latest']));
async function envoyer(de, tx) {
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data, value: '0x0', gas: '0x493e0' }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
const chaine = parseInt(await rpc('eth_chainId', []), 16);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const instantane = await rpc('evm_snapshot', []);
try {
  const compte = '0x' + ('5e7d' + Date.now()).padEnd(40, 'e').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const source = [...POOLS_ACTIONS_AERODROME.values()][0].pool;
  await rpc('anvil_impersonateAccount', [source]);
  await rpc('anvil_setBalance', [source, '0x' + (10n ** 18n).toString(16)]);
  await envoyer(source, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + (10n ** 6n).toString(16).padStart(64, '0') });
  /* deux blocks du registre comme « de » et « a » : des adresses entieres, lues dans paires.js */
  const de = String(ACTIONS_COINBASE[0].adr).toLowerCase(), a = String(ACTIONS_COINBASE[1].adr).toLowerCase();
  const p = await M.planMessagePaye({ rpc, compte, de, a, texte: 'gm from the fork bench', detientDe: true, devise: 'USDC' });
  if (!ok(p.etat === 'PRET' && p.frais === M.FRAIS_MESSAGE_USDC && p.tx.to.toLowerCase() === USDC, 'plan PRET : un transfert sur le vrai USDC, du frais de la constante (' + M.prixMessageLisible('USDC') + ')')) throw new Error(p.pourquoi || 'plan');
  const cAvant = await solde(compte), fAvant = await solde(FRAIS);
  const r = await envoyer(compte, p.tx);
  ok(r.status === '0x1', 'la transaction est confirmee par le vrai USDC, memo colle derriere le calldata compris');
  const dc = cAvant - await solde(compte), df = await solde(FRAIS) - fAvant;
  ok(dc === 100000n && df === 100000n, 'l envoyeur perd EXACTEMENT 100 000 unites (0,10 USDC) et le wallet des frais en recoit autant (' + dc + ' / ' + df + ')');
  /* relecture : la TRANSACTION (signataire, input), pas un evenement */
  const tx = await rpc('eth_getTransactionByHash', [r.h]);
  const m = M.messageDepuisTransfert({ from: compte, to: FRAIS, value: df, tx: r.h }, tx, 'USDC');
  ok(m.etat === 'MESSAGE' && m.texte === 'gm from the fork bench' && m.de === de && m.a === a && m.signataire === compte && String(tx.from).toLowerCase() === compte,
    'le message se RELIT depuis la transaction : texte, « de », « a », et son signataire (tx.from)');
  /* temoin : sans USDC, le plan refuse — rien n est envoye */
  const pauvre = '0x' + ('dead' + Date.now()).padEnd(40, 'f').slice(0, 40);
  const q = await M.planMessagePaye({ rpc, compte: pauvre, de, a, texte: 'gm', detientDe: true, devise: 'USDC' });
  ok(q.etat === 'REFUSE' && q.manque === 100000n, 'temoin : un compte sans USDC est refuse AVANT toute signature, et le manque est chiffre');
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
