/* banc-banque-panier-fork-20261011.mjs — LE PANIER (planEmprunterPanier) EXECUTE sur un fork de Base, sur DEUX vrais marches Morpho.
 * Phil (2026-10-11) : « que tu puisses mettre plusieurs actions tokenisees en garantie en meme temps ».
 * AFFIRME, sur GOOGLc -> USDC (LLTV 77 %) et AAPLc -> USDC (LLTV 62,5 %) — ids copies de /api/banque/marches (prod, 2026-10-11) :
 *   (1) un panier [0,1 GOOGLc / 10 USDC ; 0,05 AAPLc / 2 USDC] : PRET, la sequence ENTIERE simulee ; approbations au MONTANT EXACT ;
 *   (2) les appels s executent tous en 0x1, le compte RECOIT 12 USDC, et il y a DEUX positions Morpho (une par action), chacune avec
 *       sa garantie et sa dette ;
 *   (3) une ligne au-dela du plafond : le panier entier REFUSE, la ligne NOMMEE, aucun appel ;
 *   (4) TEMOIN : la meme action deux fois -> REFUSE.
 * BORNES : fork (base-anvil, comptes usurpes, aucune cle), au bloc affiche ; actions prises a leurs pools Aerodrome (transfert usurpe).
 *   NE PROUVE PAS : un vrai wallet, une liquidation.
 * Usage : node banc-banque-panier-fork-20261011.mjs [http://127.0.0.1:8549]
 */
import * as B from './banque-morpho.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';
import { USDC_BASE } from './frais-creation.js';
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest']));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) {}
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r.status; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('no receipt for ' + h);
}
const executer = async (compte, plan) => { const st = []; for (const c of plan.aSigner) { const s = await envoyer(compte, c); st.push(s); if (s !== '0x1') break; } return st; };
const ID_G = '0xa3913d896b7e9c0e0a84f1be27d376cf2065616101cb7c44674af8a154e684cc'; /* GOOGLc -> USDC, LLTV 77 % */
const ID_A = '0xae1a30486234bf7e7ac166c7c03d9bc5f2cd8a39be2c48e73c665ac7148c3c28'; /* AAPLc -> USDC, LLTV 62,5 % */
const adr = (s) => String(ACTIONS_COINBASE.find((a) => a.symbole === s).adr).toLowerCase();
const GOOGLC = adr('GOOGLc'), AAPLC = adr('AAPLc'), USDC = USDC_BASE.toLowerCase();
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const instantane = await rpc('evm_snapshot', []);
try {
  const compte = ('0x' + 'c7' + String(tete).padStart(12, '0')).padEnd(42, 'f').slice(0, 42);
  await rpc('anvil_impersonateAccount', [compte]); await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const G = 10n ** 7n, A = 5n * 10n ** 6n; /* 0,1 GOOGLc ; 0,05 AAPLc (8 decimales) */
  for (const [jeton, qte, nom] of [[GOOGLC, G, '0,1 GOOGLc'], [AAPLC, A, '0,05 AAPLc']]) {
    const pool = POOLS_ACTIONS_AERODROME.get(jeton).pool;
    await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
    ok(await envoyer(pool, { to: jeton, data: '0xa9059cbb' + adrMot(compte) + qte.toString(16).padStart(64, '0') }) === '0x1', 'mise en place : le compte recoit ' + nom);
  }
  const u0 = await solde(USDC, compte);
  const lignes = [{ id: ID_G, garantie: G, emprunt: 10n * 10n ** 6n }, { id: ID_A, garantie: A, emprunt: 2n * 10n ** 6n }];
  const p = await B.planEmprunterPanier({ rpc, compte, lignes });
  ok(p.etat === 'PRET' && p.resume && p.resume.simule === true && p.resume.panier === true, '(1) panier GOOGLc + AAPLc : PRET, sequence simulee (' + p.etat + (p.pourquoi ? ' — ' + p.pourquoi : '') + ')');
  const appros = (p.aSigner || []).filter((c) => c.data.startsWith('0x' + B.SEL.approve)).map((c) => [c.to.toLowerCase(), BigInt('0x' + c.data.slice(-64))]);
  ok(appros.length === 2 && appros.some(([t, v]) => t === GOOGLC && v === G) && appros.some(([t, v]) => t === AAPLC && v === A), '(1) approbations au MONTANT EXACT de chaque garantie : ' + JSON.stringify(appros.map(([t, v]) => v.toString())));
  const st = p.etat === 'PRET' ? await executer(compte, p) : [];
  ok(st.length === (p.aSigner || []).length && st.length > 0 && st.every((s) => s === '0x1'), '(2) appels executes : ' + st.join(','));
  const du = (await solde(USDC, compte)) - u0;
  ok(du === 12n * 10n ** 6n, '(2) SOLDE : +' + du + ' USDC brut (attendu 12 000 000)');
  for (const [id, g, nom] of [[ID_G, G, 'GOOGLc'], [ID_A, A, 'AAPLc']]) {
    const m = await B.lireMarche({ rpc, id }); const pos = await B.lirePosition({ rpc, marche: m, compte });
    ok(pos.etat === 'LU' && pos.garantie === g && pos.dette > 0n, '(2) position ' + nom + ' SEPAREE : garantie ' + pos.garantie + ', dette ' + pos.dette);
  }
  const trop = await B.planEmprunterPanier({ rpc, compte, lignes: [{ id: ID_G, garantie: 0n, emprunt: 10n ** 6n }, { id: ID_A, garantie: 0n, emprunt: 50n * 10n ** 6n }] });
  ok(trop.etat === 'REFUSE' && /^AAPLc: /.test(trop.pourquoi) && trop.aSigner.length === 0, '(3) une ligne au-dela du plafond : REFUSE nomme (' + trop.pourquoi + ')');
  const deux = await B.planEmprunterPanier({ rpc, compte, lignes: [{ id: ID_G, garantie: 0n, emprunt: 1n }, { id: ID_G, garantie: 0n, emprunt: 1n }] });
  ok(deux.etat === 'REFUSE', '(4) TEMOIN : le meme marche deux fois -> ' + deux.etat);
} finally { await rpc('evm_revert', [instantane]); }
console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
