/* banc-banque-morpho-fork-20261010.mjs — TokenizedBank phase 1 (banque-morpho.js) EXECUTEE sur un fork de Base.
 * AFFIRME, sur le vrai marche Morpho GOOGLc -> USDC (id copie de blue-api.morpho.org, parametres relus sur la chaine) :
 *   (1) le marche se lit (parametres, totaux, prix de l oracle) et sa garantie est une action du registre ;
 *   (2) deposer 0,1 GOOGLc et emprunter 10 USDC : plan PRET (simule), appels executes en 0x1, le compte RECOIT 10 USDC, la
 *       position Morpho porte la garantie et une dette ; l approbation est du MONTANT EXACT ;
 *   (3) emprunter au-dela du plafond (marge 70 % du LLTV) : REFUSE, aucun appel ;
 *   (4) rembourser TOUT : PRET, execute, dette a 0 ; puis retirer TOUTE la garantie : PRET, execute, le GOOGLc revient ;
 *   (5) preter 5 USDC : PRET, execute, parts de pret > 0 ; (6) TEMOIN : un id de marche inexistant -> REFUSE.
 * BORNES : un fork (base-anvil, comptes usurpes, aucune cle), au bloc affiche ; le GOOGLc d essai est pris a sa pool Aerodrome
 *   (transfert usurpe, impossible sur la vraie chaine). NE PROUVE PAS : l interface, un vrai wallet, une liquidation.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-banque-morpho-fork-20261010.mjs [http://127.0.0.1:8549]
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

const ID = '0xa3913d896b7e9c0e0a84f1be27d376cf2065616101cb7c44674af8a154e684cc'; /* GOOGLc -> USDC, LLTV 77 % (API Morpho, 2026-10-10) */
const GOOGLC = String(ACTIONS_COINBASE.find((a) => a.symbole === 'GOOGLc').adr).toLowerCase();
const USDC = USDC_BASE.toLowerCase();
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const instantane = await rpc('evm_snapshot', []);
try {
  const m = await B.lireMarche({ rpc, id: ID });
  ok(m.etat === 'LU' && m.params.collateralToken === GOOGLC && m.params.loanToken === USDC && m.prix > 0n,
    '(1) marche lu : GOOGLc -> USDC, LLTV ' + (m.params && m.params.lltv) + ', prix oracle ' + m.prix + ', liquidite ' + m.liquidite + ' unites USDC');
  const compte = ('0x' + 'b4' + String(tete).padStart(12, '0')).padEnd(42, 'e').slice(0, 42);
  await rpc('anvil_impersonateAccount', [compte]); await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const pool = POOLS_ACTIONS_AERODROME.get(GOOGLC).pool;
  await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
  const DIXIEME = 10n ** 7n; /* 0,1 GOOGLc (8 decimales) */
  ok(await envoyer(pool, { to: GOOGLC, data: '0xa9059cbb' + adrMot(compte) + DIXIEME.toString(16).padStart(64, '0') }) === '0x1', 'mise en place : le compte recoit 0,1 GOOGLc');

  const EMPRUNT = 10n * 10n ** 6n;
  const u0 = await solde(USDC, compte), g0 = await solde(GOOGLC, compte);
  const p = await B.planEmprunter({ rpc, compte, id: ID, garantie: DIXIEME, emprunt: EMPRUNT });
  ok(p.etat === 'PRET' && p.resume.simule === true, '(2) deposer 0,1 GOOGLc + emprunter 10 USDC : PRET, simule (' + p.etat + (p.pourquoi ? ' — ' + p.pourquoi : '') + ')');
  const appro = (p.aSigner || []).find((c) => c.data.startsWith('0x' + B.SEL.approve));
  ok(!!appro && BigInt('0x' + appro.data.slice(-64)) === DIXIEME, '(2) l approbation est du MONTANT EXACT (0,1 GOOGLc), jamais l infini');
  const st = p.etat === 'PRET' ? await executer(compte, p) : [];
  ok(st.length === p.aSigner.length && st.every((s) => s === '0x1'), '(2) appels executes : ' + st.join(','));
  const du = (await solde(USDC, compte)) - u0, dg = g0 - (await solde(GOOGLC, compte));
  ok(du === EMPRUNT && dg === DIXIEME, '(2) SOLDES : +' + du + ' USDC brut, -' + dg + ' GOOGLc brut');
  const m2 = await B.lireMarche({ rpc, id: ID }); const pos = await B.lirePosition({ rpc, marche: m2, compte });
  ok(pos.etat === 'LU' && pos.garantie === DIXIEME && pos.dette >= EMPRUNT, '(2) position Morpho : garantie ' + pos.garantie + ', dette ' + pos.dette);

  const trop = await B.planEmprunter({ rpc, compte, id: ID, garantie: 0n, emprunt: 30n * 10n ** 6n });
  ok(trop.etat === 'REFUSE' && trop.aSigner.length === 0, '(3) 30 USDC de plus sur 0,1 GOOGLc : REFUSE (' + trop.pourquoi + ')');

  /* rembourser tout : il faut un peu plus que la dette lue (interets) — on donne au compte 1 USDC de plus, pris a la meme pool */
  await envoyer(pool, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + (10n ** 6n).toString(16).padStart(64, '0') });
  const r = await B.planRembourser({ rpc, compte, id: ID, tout: true });
  ok(r.etat === 'PRET', '(4) rembourser tout : ' + r.etat + (r.pourquoi ? ' — ' + r.pourquoi : ''));
  const sr = r.etat === 'PRET' ? await executer(compte, r) : [];
  const m3 = await B.lireMarche({ rpc, id: ID }); const pos3 = await B.lirePosition({ rpc, marche: m3, compte });
  ok(sr.every((s) => s === '0x1') && pos3.borrowShares === 0n, '(4) execute (' + sr.join(',') + '), parts de dette restantes : ' + pos3.borrowShares);
  const w = await B.planRetirerGarantie({ rpc, compte, id: ID, montant: DIXIEME });
  const gAv = await solde(GOOGLC, compte);
  const sw = w.etat === 'PRET' ? await executer(compte, w) : [];
  ok(w.etat === 'PRET' && sw.every((s) => s === '0x1') && (await solde(GOOGLC, compte)) - gAv === DIXIEME, '(4) retirer toute la garantie : ' + w.etat + ', le GOOGLc revient');

  /* apres le remboursement le compte n a plus que ~0,99 USDC : il recoit 5 USDC de la meme pool pour preter */
  await envoyer(pool, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + (5n * 10n ** 6n).toString(16).padStart(64, '0') });
  const l = await B.planPreter({ rpc, compte, id: ID, montant: 5n * 10n ** 6n });
  const sl = l.etat === 'PRET' ? await executer(compte, l) : [];
  const m4 = await B.lireMarche({ rpc, id: ID }); const pos4 = await B.lirePosition({ rpc, marche: m4, compte });
  ok(l.etat === 'PRET' && sl.every((s) => s === '0x1') && pos4.supplyShares > 0n, '(5) preter 5 USDC : ' + l.etat + (l.pourquoi ? ' — ' + l.pourquoi : '') + ', parts de pret ' + pos4.supplyShares);

  const faux = await B.planPreter({ rpc, compte, id: '0x' + '12'.repeat(32), montant: 1n });
  ok(faux.etat === 'REFUSE', '(6) TEMOIN : id inexistant -> ' + faux.etat + ' (' + faux.pourquoi + ')');
} finally { await rpc('evm_revert', [instantane]); }
console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
