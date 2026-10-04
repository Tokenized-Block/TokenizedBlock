/* banc-achat-skin-fork-20261004.mjs — L ACHAT D UNE SKIN, EXECUTE SUR UN FORK : 1 USDC au wallet des frais, le choix dans la transaction.
 *
 * CE QUE LE BANC PROUVE (skins.js) :
 *   - le contrat USDC de Base ACCEPTE un `transfer` dont le calldata porte un memo a la suite (status 0x1) ;
 *   - le wallet des frais recoit EXACTEMENT 1 USDC, l acheteur en perd exactement 1 (soldes lus avant/apres, pas un evenement) ;
 *   - `verifierAchatSkin`, nourri de la transaction et du recu LUS SUR LE NOEUD, accepte l achat et nomme l acheteur ;
 *   - le memo se relit dans l input de la transaction (lireMemo + lireMemoSkin) : le block et la skin sont sur la chaine ;
 *   - la meme transaction reclamee pour un autre block ou une autre skin est REFUSEE ;
 *   - un transfert de 1 USDC SANS memo, et un memo avec 0,5 USDC seulement, sont REFUSES ;
 *   - une transaction qui ECHOUE (acheteur sans USDC) est REFUSEE.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle). Ne prouve ni l interface, ni un vrai wallet, ni un smart wallet
 *   (son enveloppe est testee hors reseau dans test-skins-20261004). L USDC d essai est pris a une pool du fork.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-achat-skin-fork-20261004.mjs [http://127.0.0.1:8549] */
import * as S from './skins.js';
import * as F from './frais-creation.js';
import { lireMemo, encodeTransferAvecMemo } from './messages.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const brut = async (method, params) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) throw new Error(r.error.message); return r.result; };
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const BLOCK = '0xb200000000000000000000e4b0c5fbe9c8df579e', AUTRE = '0xb2000000000000000000000000000000000000aa';
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const balance = async (qui) => BigInt(await rpc('eth_call', [{ to: USDC, data: '0x70a08231' + adrMot(qui) }, 'latest']));
async function envoyer(de, tx) {
  let gas = 300000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data, value: '0x0' }])) * 13n / 10n; } catch (_) { /* reverterait : on l envoie pour LIRE le status 0 */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data, value: '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return h; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const lire = async (h) => ({ tx: await rpc('eth_getTransactionByHash', [h]), recu: await rpc('eth_getTransactionReceipt', [h]) });
const verifier = (l, plus = {}) => S.verifierAchatSkin({ ...l, usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: { id: 'gold' }, ...plus });

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)');
const instantane = await rpc('evm_snapshot', []);
try {
  const acheteur = '0x' + ('5c1n' + String(tete)).replace(/[^0-9a-f]/g, 'a').padEnd(40, 'd').slice(0, 40);
  const pauvre = '0x' + ('9a0e' + String(tete)).replace(/[^0-9a-f]/g, 'b').padEnd(40, 'e').slice(0, 40);
  const source = [...POOLS_ACTIONS_AERODROME.values()][0].pool;
  for (const a of [acheteur, pauvre, source]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]); }
  await envoyer(source, { to: USDC, data: '0xa9059cbb' + adrMot(acheteur) + (5000000n).toString(16).padStart(64, '0') });
  ok(await balance(acheteur) === 5000000n && await balance(pauvre) === 0n, 'le compte d essai detient 5 USDC ; le compte « pauvre » n en a pas');

  /* 1. l achat d une skin du catalogue */
  const fAvant = await balance(FRAIS), aAvant = await balance(acheteur);
  const appel = S.appelAchatSkin({ usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: { id: 'gold' } });
  const h1 = await envoyer(acheteur, appel), l1 = await lire(h1);
  ok(l1.recu.status === '0x1', 'USDC accepte un transfer avec memo a la suite : status 0x1');
  ok(await balance(FRAIS) - fAvant === S.SKIN_PRIX_USDC && aAvant - await balance(acheteur) === S.SKIN_PRIX_USDC, 'le wallet des frais recoit EXACTEMENT 1 USDC, l acheteur en perd exactement 1');
  const v1 = verifier(l1);
  ok(v1.ok === true && v1.payeur === acheteur && v1.signataire === acheteur, 'verifierAchatSkin (transaction et recu lus sur le noeud) : accepte, acheteur = ' + acheteur.slice(0, 10) + '…');
  const memo = lireMemo(l1.tx.input), dit = memo.etat === 'LU' ? S.lireMemoSkin(memo.texte) : { ok: false };
  ok(dit.ok && dit.block === BLOCK && dit.recette.id === 'gold', 'le choix est SUR LA CHAINE : l input de la transaction dit « ' + String(memo.texte).slice(0, 60) + ' »');
  ok(verifier(l1, { block: AUTRE }).ok === false, 'la meme transaction reclamee pour un AUTRE block : refusee');
  ok(verifier(l1, { recette: { id: 'ice' } }).ok === false, 'la meme transaction reclamee pour une AUTRE skin : refusee');

  /* 2. une skin « random » : la recette entiere dans le memo */
  const rnd = { id: 'random', angle: 278, h: [17, 237, 163], cube: 45, noyau: 310 };
  const l2 = await lire(await envoyer(acheteur, S.appelAchatSkin({ usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: rnd })));
  const m2 = lireMemo(l2.tx.input), d2 = m2.etat === 'LU' ? S.lireMemoSkin(m2.texte) : { ok: false };
  ok(verifier(l2, { recette: rnd }).ok === true && d2.ok && JSON.stringify(d2.recette) === JSON.stringify(rnd), 'skin random : acceptee, et sa recette (angle, 3 teintes, aretes, noyau) se relit dans la transaction');
  ok(verifier(l2, { recette: { ...rnd, cube: 46 } }).ok === false, 'skin random reclamee avec une teinte differente d UN degre : refusee');

  /* 3. les tricheries */
  const l3 = await lire(await envoyer(acheteur, { to: USDC, data: encodeTransferAvecMemo(FRAIS, 1000000n, '') }));
  ok(l3.recu.status === '0x1' && verifier(l3).ok === false, '1 USDC envoye SANS memo : la transaction passe, la skin est refusee (aucun choix ecrit)');
  const l4 = await lire(await envoyer(acheteur, { to: USDC, data: encodeTransferAvecMemo(FRAIS, 500000n, S.memoSkin(BLOCK, { id: 'gold' })) }));
  ok(l4.recu.status === '0x1' && verifier(l4).ok === false, 'le bon memo avec 0,5 USDC seulement : refuse');
  const l5 = await lire(await envoyer(pauvre, appel));
  ok(l5.recu.status === '0x0' && verifier(l5).ok === false && verifier(l5).etat === 'REFUSE', 'acheteur sans USDC : la transaction ECHOUE (status 0x0) et la skin est refusee');
  ok(await balance(FRAIS) - fAvant === 3500000n, 'temoin de compte : le wallet des frais a recu 1 + 1 + 1 + 0,5 = 3,5 USDC sur les 5 transactions (la 5e a echoue)');
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
