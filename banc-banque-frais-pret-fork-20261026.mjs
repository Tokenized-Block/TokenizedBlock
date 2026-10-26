/* banc-banque-frais-pret-fork-20261026.mjs - LES FRAIS DE LA BANK, EXECUTES sur un fork de Base (decision de Phil, 2026-10-26 :
 *   « colle toi au data de morpho ajoute les bon frais » : le Lend paie la MEME regle que le Borrow ; sortir reste gratuit).
 * Marche : GOOGLc -> USDC « Safer » (LLTV 62,5 %), id 0x0cc78b1f… COPIE de blue-api.morpho.org (le meme que le Supply live
 *   0xb91a3e0f…0c58), parametres relus sur la chaine par le plan.
 * AFFIRME, sur les SOLDES et les octets mines (jamais sur un evenement) :
 *   (0) le frais Morpho du marche relu sur la chaine (market(id).fee) est celui que le plan met dans son resume ;
 *   (1) SUPPLY M : plan PRET ; chaque transaction minee porte EXACTEMENT les octets du plan (to + input) ; status 0x1 ; le wallet perd
 *       M + frais, la caisse gagne frais = 0,1 % de M (arrondi superieur), Morpho recoit M (la position vaut M a 1 unite d arrondi pres) ;
 *       l autorisation USDC -> Morpho revient a 0 ;
 *   (2) WITHDRAW tout : PRET, octets = plan, la caisse +0, le wallet recoit ce que la position valait, parts a 0 ;
 *   (3) BORROW E sur une garantie GOOGLc : PRET, octets = plan, le wallet recoit E - frais, la caisse +frais (0,1 % de E), la dette >= E ;
 *       autorisations GOOGLc -> Morpho et USDC -> Morpho a 0 ;
 *   (4) REPAY tout : PRET, octets = plan, la caisse +0, dette a 0 ; l autorisation USDC -> Morpho APRES : mesuree et dite ;
 *   (5) retirer la garantie : PRET, la caisse +0, le GOOGLc revient ;
 *   (6) TEMOIN : un Supply avec un solde de M seul (sans le frais) est REFUSE, rien a signer.
 * BORNES : un fork (base-anvil, comptes usurpes, aucune cle), au bloc affiche ; le GOOGLc et l USDC d essai sont pris a la pool Aerodrome
 *   GOOGLc (transfert usurpe, impossible sur la vraie chaine). NE PROUVE PAS : l interface, un vrai wallet, un lot wallet_sendCalls.
 * Usage : anvil --base --fork-url <rpc Base> --port <ton port>, puis node banc-banque-frais-pret-fork-20261026.mjs http://127.0.0.1:<port>
 */
import * as B from './banque-morpho.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const lire = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (j, qui) => lire(j, '0x70a08231' + adrMot(qui));
const autorise = (j, qui, vers) => lire(j, '0xdd62ed3e' + adrMot(qui) + adrMot(vers));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) {}
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('no receipt for ' + h);
}
/* execute le plan pas a pas et verifie que CHAQUE transaction minee porte les octets du plan (to + input), sans rien en changer */
async function executer(compte, plan) {
  const st = []; let memesOctets = true;
  for (const c of plan.aSigner) {
    const r = await envoyer(compte, c); st.push(r.status);
    const t = await rpc('eth_getTransactionByHash', [r.h]);
    if (String(t.to).toLowerCase() !== String(c.to).toLowerCase() || String(t.input).toLowerCase() !== String(c.data).toLowerCase() || String(t.from).toLowerCase() !== compte) memesOctets = false;
    if (r.status !== '0x1') break;
  }
  return { st, tous: st.length === plan.aSigner.length && st.every((s) => s === '0x1'), memesOctets };
}

const ID = '0x0cc78b1f4993015116e90626a18a1ba0e1ca73d0b75781b231d02fa5536e62a5'; /* GOOGLc -> USDC, LLTV 62,5 % « Safer » (API Morpho, 2026-10-26) */
const GOOGLC = String(ACTIONS_COINBASE.find((a) => a.symbole === 'GOOGLc').adr).toLowerCase();
const USDC = USDC_BASE.toLowerCase(), CAISSE = FEE_WALLET.toLowerCase(), MORPHO = B.MORPHO_BLUE;
const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const instantane = await rpc('evm_snapshot', []);
try {
  const m = await B.lireMarche({ rpc, id: ID });
  const feeChaine = BigInt('0x' + (await rpc('eth_call', [{ to: MORPHO, data: '0x' + B.SEL.market + ID.slice(2) }, 'latest'])).slice(2 + 64 * 5, 2 + 64 * 6));
  ok(m.etat === 'LU' && m.params.collateralToken === GOOGLC && m.params.loanToken === USDC && m.params.lltv === 625000000000000000n,
    'marche lu : GOOGLc -> USDC, LLTV ' + (m.params && m.params.lltv) + ', liquidite ' + m.liquidite + ' unites USDC');
  const compte = ('0x' + 'fe' + String(tete).padStart(12, '0')).padEnd(42, 'd').slice(0, 42);
  await rpc('anvil_impersonateAccount', [compte]); await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  const pool = POOLS_ACTIONS_AERODROME.get(GOOGLC).pool;
  await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
  const donner = async (j, q) => (await envoyer(pool, { to: j, data: '0xa9059cbb' + adrMot(compte) + q.toString(16).padStart(64, '0') })).status === '0x1';

  /* (6) TEMOIN d abord : 5 USDC pile au solde, pas le frais */
  const M = 5n * 10n ** 6n, F = B.fraisPret(M);
  ok(await donner(USDC, M), 'mise en place : le compte recoit 5 USDC (pile M)');
  const court = await B.planPreter({ rpc, compte, id: ID, montant: M });
  ok(court.etat === 'REFUSE' && court.aSigner.length === 0, '(6) TEMOIN : solde = M sans le frais -> ' + court.etat + ' (' + court.pourquoi + ')');
  ok(await donner(USDC, F), 'mise en place : + le frais (' + F + ' unites)');

  /* (1) SUPPLY */
  const u0 = await solde(USDC, compte), c0 = await solde(USDC, CAISSE), mo0 = await solde(USDC, MORPHO);
  const p1 = await B.planPreter({ rpc, compte, id: ID, montant: M });
  ok(p1.etat === 'PRET' && p1.aSigner.length === 3 && p1.resume.fraisApp === String(F) && p1.resume.totalSortant === String(M + F),
    '(1) supply 5 USDC : ' + p1.etat + (p1.pourquoi ? ' — ' + p1.pourquoi : '') + ', ' + p1.aSigner.length + ' appels, frais ' + (p1.resume && p1.resume.fraisApp));
  ok(p1.resume && p1.resume.feeMorpho === feeChaine.toString(), '(0) frais Morpho du resume = market(id).fee lu sur la chaine : ' + feeChaine);
  const x1 = await executer(compte, p1);
  const du1 = u0 - (await solde(USDC, compte)), dc1 = (await solde(USDC, CAISSE)) - c0, dm1 = (await solde(USDC, MORPHO)) - mo0;
  ok(x1.tous && x1.memesOctets, '(1) mine : ' + x1.st.join(',') + ' ; octets mines = octets du plan : ' + x1.memesOctets);
  ok(du1 === M + F && dc1 === F && F === 5000n && dm1 === M, '(1) SOLDES : wallet -' + du1 + ' (attendu ' + (M + F) + '), caisse +' + dc1 + ' (attendu 5 000), Morpho +' + dm1 + ' (attendu ' + M + ')');
  const mS = await B.lireMarche({ rpc, id: ID }), posS = await B.lirePosition({ rpc, marche: mS, compte });
  /* la valeur de la position selon Morpho (SharesMathLib.toAssetsDown, parts virtuelles 1e6 / actif virtuel 1) */
  const valeurS = (posS.supplyShares * (mS.totaux.supplyAssets + 1n)) / (mS.totaux.supplyShares + 10n ** 6n);
  ok(valeurS <= M && valeurS >= M - 1n, '(1) la position vaut ' + valeurS + ' (M a 1 unite d arrondi pres, en faveur de Morpho)');
  ok((await autorise(USDC, compte, MORPHO)) === 0n, '(1) autorisation USDC -> Morpho revenue a 0');

  /* (2) WITHDRAW tout */
  const u2 = await solde(USDC, compte), c2 = await solde(USDC, CAISSE);
  const p2 = await B.planRetirerPret({ rpc, compte, id: ID, tout: true });
  const x2 = p2.etat === 'PRET' ? await executer(compte, p2) : { tous: false, memesOctets: false, st: [] };
  const mW = await B.lireMarche({ rpc, id: ID }), posW = await B.lirePosition({ rpc, marche: mW, compte });
  const du2 = (await solde(USDC, compte)) - u2, dc2 = (await solde(USDC, CAISSE)) - c2;
  ok(p2.etat === 'PRET' && p2.resume.fraisApp === '0' && x2.tous && x2.memesOctets && !p2.aSigner.some((c) => c.frais),
    '(2) withdraw tout : ' + p2.etat + ', mine ' + x2.st.join(',') + ', octets = plan ' + x2.memesOctets + ', aucun appel de frais, fraisApp 0');
  ok(dc2 === 0n && posW.supplyShares === 0n && du2 >= valeurS && du2 <= M && du2 >= BigInt(p2.resume.preteLu), '(2) SOLDES : caisse +' + dc2 + ', wallet +' + du2 + ' (la position valait ' + valeurS + ' ; resume.preteLu ' + p2.resume.preteLu + '), parts a ' + posW.supplyShares);

  /* (3) BORROW sur garantie */
  const G = 10n ** 7n, E = 10n * 10n ** 6n; /* 0,1 GOOGLc (8 decimales), 10 USDC */
  ok(await donner(GOOGLC, G), 'mise en place : le compte recoit 0,1 GOOGLc');
  const u3 = await solde(USDC, compte), c3 = await solde(USDC, CAISSE), g3 = await solde(GOOGLC, compte);
  const p3 = await B.planEmprunter({ rpc, compte, id: ID, garantie: G, emprunt: E });
  const FE = B.fraisEmprunt(E);
  const x3 = p3.etat === 'PRET' ? await executer(compte, p3) : { tous: false, memesOctets: false, st: [] };
  const du3 = (await solde(USDC, compte)) - u3, dc3 = (await solde(USDC, CAISSE)) - c3, dg3 = g3 - (await solde(GOOGLC, compte));
  ok(p3.etat === 'PRET' && x3.tous && x3.memesOctets && p3.resume.fraisApp === String(FE) && p3.resume.feeMorpho === feeChaine.toString(),
    '(3) borrow 10 USDC sur 0,1 GOOGLc : ' + p3.etat + (p3.pourquoi ? ' — ' + p3.pourquoi : '') + ', mine ' + x3.st.join(',') + ', octets = plan ' + x3.memesOctets);
  ok(du3 === E - FE && dc3 === FE && FE === 10000n && dg3 === G, '(3) SOLDES : wallet +' + du3 + ' USDC (attendu ' + (E - FE) + '), caisse +' + dc3 + ' (attendu 10 000), -' + dg3 + ' GOOGLc');
  const mB = await B.lireMarche({ rpc, id: ID }), posB = await B.lirePosition({ rpc, marche: mB, compte });
  ok(posB.garantie === G && posB.dette >= E, '(3) position : garantie ' + posB.garantie + ', dette ' + posB.dette + ' (>= ' + E + ')');
  ok((await autorise(GOOGLC, compte, MORPHO)) === 0n && (await autorise(USDC, compte, MORPHO)) === 0n, '(3) autorisations GOOGLc et USDC -> Morpho a 0');

  /* (4) REPAY tout : il faut la dette (> ce qui a ete recu, frais compris) - 1 USDC de plus, pris a la pool */
  ok(await donner(USDC, 10n ** 6n), 'mise en place : + 1 USDC pour rembourser frais et interets');
  const u4 = await solde(USDC, compte), c4 = await solde(USDC, CAISSE);
  const p4 = await B.planRembourser({ rpc, compte, id: ID, tout: true });
  const x4 = p4.etat === 'PRET' ? await executer(compte, p4) : { tous: false, memesOctets: false, st: [] };
  const mR = await B.lireMarche({ rpc, id: ID }), posR = await B.lirePosition({ rpc, marche: mR, compte });
  const du4 = u4 - (await solde(USDC, compte)), dc4 = (await solde(USDC, CAISSE)) - c4, reste4 = await autorise(USDC, compte, MORPHO);
  ok(p4.etat === 'PRET' && p4.resume.fraisApp === '0' && x4.tous && x4.memesOctets && !p4.aSigner.some((c) => c.frais),
    '(4) repay tout : ' + p4.etat + (p4.pourquoi ? ' — ' + p4.pourquoi : '') + ', mine ' + x4.st.join(',') + ', octets = plan ' + x4.memesOctets + ', fraisApp 0');
  ok(dc4 === 0n && posR.borrowShares === 0n, '(4) SOLDES : caisse +' + dc4 + ', wallet -' + du4 + ' (dette lue ' + p4.resume.detteLue + '), parts de dette ' + posR.borrowShares);
  ok(reste4 === 0n && p4.resume.autorisationRemiseA0 === true && p4.aSigner[p4.aSigner.length - 1].remiseA0 === true,
    '(4) autorisation USDC -> Morpho apres le remboursement total : ' + reste4 + ' (autorise ' + p4.resume.autorise + ', paye ' + du4 + ', remise a 0 en dernier appel)');

  /* (5) retirer la garantie */
  const c5 = await solde(USDC, CAISSE), g5 = await solde(GOOGLC, compte);
  const p5 = await B.planRetirerGarantie({ rpc, compte, id: ID, montant: G });
  const x5 = p5.etat === 'PRET' ? await executer(compte, p5) : { tous: false, memesOctets: false, st: [] };
  ok(p5.etat === 'PRET' && x5.tous && x5.memesOctets && (await solde(USDC, CAISSE)) === c5 && (await solde(GOOGLC, compte)) - g5 === G && p5.resume.fraisApp === '0',
    '(5) retirer la garantie : ' + p5.etat + ', caisse +0, le GOOGLc revient, fraisApp 0');
} finally { await rpc('evm_revert', [instantane]); }
console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
