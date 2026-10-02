// preuve-frais-vieilles-pools-fork.mjs — FORK ONLY. Les vieilles pools TB (V1 / V2 / V8 ancien / sans hook) restent telles
// quelles (decision fondateur 2026-10-02 14:20) : on PROUVE qu un Buy / Sell fait DANS L APP sur ces pools verse le frais
// a a6cf, au wei, en ETH (ou devise appariee) — jamais en jeton de block — et on liste les blocks ou l app ne le prend pas.
// ⛔ AUCUNE TX MAINNET : refuse tout RPC qui n est pas un anvil (anvil_nodeInfo) de chainId 8453. Expediteurs = adresses
//    vierges usurpees sur le fork (anvil_impersonateAccount), jamais a6cf, jamais le compte anvil n°1.
// Le plan vient de `echange.js` `planEchange` — LE MEME code que le bouton Buy / Sell — et la tx executee est EXACTEMENT
// celle qu il rend (to, data, value). Usage : PORT_FORK=8577 node preuve-frais-vieilles-pools-fork.mjs [sortie.json]
import { writeFileSync } from 'node:fs';
import { planEchange, FRAIS_INTERFACE_BPS } from './echange.js';
import { FEE_WALLET } from './frais-creation.js';
import { HOOK_PREVU, HOOK_V2, HOOK_V8 } from './tokenomics.js';
import { selecteur } from './pool.js';

const URL_FORK = 'http://127.0.0.1:' + (process.env.PORT_FORK || '8577');
let idn = 0;
/* ⚠️ le fork lit l etat manquant chez un RPC public : « failed to get account … Max retries » est une lecture RATEE
 *   (limite de debit amont), pas une reponse — on la rejoue, jamais on ne la lit comme un refus. */
async function rpc(method, params = []) {
  for (let k = 0; ; k++) {
    const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++idn, method, params }) })).json();
    if (!r.error) return r.result;
    const msg = r.error.message || JSON.stringify(r.error);
    if (k < 8 && /failed to get account|Max retries|rate limit|429|failed to get storage|timed out/i.test(msg)) { await new Promise((o) => setTimeout(o, 3000 * (k + 1))); continue; }
    throw new Error(method + ': ' + msg);
  }
}
const ETH = '0x0000000000000000000000000000000000000000';
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const bal = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
const solde = async (t, a) => BigInt(await rpc('eth_call', [{ to: t, data: '0x' + selecteur('balanceOf(address)') + pad(a) }, 'latest']));

/* L INVENTAIRE : les 10 pools sur nos hooks (Initialize filtre sur V1..V8, 649/649 fenetres 50 773 816 -> 52 069 816,
 * puis 4/4 fenetres 52 069 817 -> tete du fork : 0 nouvelle) + la pool TBLOCK/ETH sans hook au format Launch. */
export const VIEILLES_POOLS = [
  { sym: 'TBGAS', jeton: '0xb200000000000000000000df3ffcd9be89b3843c', hook: 'V1', id: '0x085294111dc0da95e5496d5c81deaa094fdf73bd5a1e08163679e5ea3b062a46' },
  { sym: 'RNG', jeton: '0xb2000000000000000000004ff41cbd5ef8e49f14', hook: 'V1', id: '0x70a5fb186197454ed4c46652f268993c815eb18122199a6e3c23b7be022181c1' },
  { sym: 'TUTU', jeton: '0xb20000000000000000000071224edc6587e362d2', hook: 'V1', id: '0x58912ed2a7dd26739a69c8efd744b402f4c846385f138568663f3cff539d0b48' },
  { sym: 'OK', jeton: '0xb2000000000000000000006d6f9102e9e4b221e0', hook: 'V1', id: '0x899903bf12e302255a991abefafa27de71ad86ed1b6b4189f1701adf9906f88a' },
  { sym: 'O', jeton: '0xb200000000000000000000a3f3e63b48ef57c481', hook: 'V1', id: '0xcda8964541e1482e6b8a7c1e01cc0706b08d6d0bd8bb408511b74c93daae33be' },
  { sym: 'A', jeton: '0xb200000000000000000000ab549fa65ad4edae3f', hook: 'V2', id: '0x7860d06ef1eea6c5d1bc5e89c916f2552bceb4e3fe8f2129356e02e345b0036c' },
  { sym: 'BASED', jeton: '0xb200000000000000000000809778b2d38d114351', hook: 'V2', id: '0x44fed48890b1e05c03dc21f236e87a7e4e9b0975e48bc56e426dbb722ccd3a50' },
  { sym: 'IB022', jeton: '0xb200000000000000000000e4b0c5fbe9c8df579e', hook: 'V8', id: '0xd94915e54fa4f264b6b84815540b5e9df410bfa0e1278f063a9b1407b3843b08' },
  { sym: 'SS7K3P', jeton: '0xb200000000000000000000baa5356bfc210cc30a', hook: 'V8', id: '0x152e665d0e0dde0c1f99521d50a5911a88ff01ab2f794f1ca0b52a0e1a93d709' },
  { sym: 'TBLOCK(e7e9)/SPCXc', jeton: '0xb200000000000000000000e7e9db76e8234f8f56', hook: 'V8', id: '0xbde216e1926a657d361f42e5c0a05bfec6d6740df4e756b98630b22ba61e75fe',
    cle: { currency0: '0xb2000000000000000000007b9fcbd005511acbd5', currency1: '0xb200000000000000000000e7e9db76e8234f8f56', fee: 0, tickSpacing: 200, hooks: HOOK_V8 },
    /* cotee en SPCXc (8 decimales) : l app admet SPCXc comme devise de frais quand elle en a LU le prix (app.html fraisDevisesOk) */
    paire: { sym: 'SPCXc', adr: '0xb2000000000000000000007b9fcbd005511acbd5', montant: 10n ** 6n, source: '0x0bf58fe0fac935ac69595c19b12ba0d75e3f8c0e' } },
  { sym: 'TBLOCK', jeton: '0xb20000000000000000000024c30d3fcb7931272e', hook: 'aucun', id: '0x70efd8d40c15908bb874bfa265507e136d9d347152f43725f2c1c910deaab0f9' },
];
const HOOKS = { V1: HOOK_PREVU, V2: HOOK_V2, V8: HOOK_V8, aucun: ETH };

async function envoyer(from, tx) {
  /* nonce explicite : apres un evm_revert, le compteur du pool d anvil peut etre en avance sur l etat */
  const nonce = await rpc('eth_getTransactionCount', [from, 'latest']);
  const h = await rpc('eth_sendTransaction', [{ from, to: tx.to, data: tx.data, value: tx.value || '0x0', gas: '0x2dc6c0', nonce }]);
  let r = await rpc('eth_getTransactionReceipt', [h]);
  for (let k = 0; !r && k < 5; k++) { await rpc('evm_mine'); r = await rpc('eth_getTransactionReceipt', [h]); }
  if (!r) throw new Error('tx non minee ' + h);
  return { h, ok: r.status === '0x1', gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice), r };
}
/* Q = la devise de cotation (ETH natif ou ERC-20). Les deltas utilisateur en ETH sont donnes HORS GAZ (gaz du recu rajoute). */
async function mesurer(from, tx, jeton, Q = ETH) {
  const bq = (a) => (Q === ETH ? bal(a) : solde(Q, a));
  const lire = async () => ({ a6Q: await bq(FEE_WALLET), a6Eth: await bal(FEE_WALLET), a6Bloc: await solde(jeton, FEE_WALLET), uQ: await bq(from), uBloc: await solde(jeton, from) });
  const av = await lire();
  const e = await envoyer(from, tx);
  const ap = await lire();
  return { ok: e.ok, h: e.h, gaz: e.gaz, dA6Q: ap.a6Q - av.a6Q, dA6Eth: ap.a6Eth - av.a6Eth, dA6Bloc: ap.a6Bloc - av.a6Bloc,
    dUQ: ap.uQ - av.uQ + (Q === ETH ? e.gaz : 0n), dUBloc: ap.uBloc - av.uBloc };
}
const s = (x) => (typeof x === 'bigint' ? x.toString() : x);
const ligne = [];
let n = 0, ko = 0;
const ok = (nom, c, vu) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + nom + (c || vu === undefined ? '' : '  vu: ' + vu)); };

const info = await rpc('anvil_nodeInfo').catch(() => null);
const chainId = Number(await rpc('eth_chainId'));
if (chainId !== 8453 || !info) { console.log('KO : pas un fork anvil de Base — arret, rien envoye'); process.exit(1); }
const tete = Number(await rpc('eth_blockNumber'));
console.log('fork Base, bloc ' + tete + ' — a6cf ' + FEE_WALLET);
const M_ACHAT = 10n ** 15n; /* 0,001 ETH */
const HOOK_V8_PPM = 5000n; /* HOOK_FEE() du V8 lu sur la chaine : 5000 / 1e6 = 0,5 % */
const SEULS = process.env.SEULS ? process.env.SEULS.split(',') : null;

for (const [i, p] of VIEILLES_POOLS.entries()) {
  if (SEULS && !SEULS.includes(p.sym)) continue;
  const snap = await rpc('evm_snapshot');
  const u = '0x' + (0xc0ffee0000n + BigInt(i)).toString(16).padStart(40, '0'); /* adresse vierge, aucune cle */
  await rpc('anvil_impersonateAccount', [u]);
  await rpc('anvil_setBalance', [u, '0x' + (10n ** 18n).toString(16)]);
  const L = BigInt(await rpc('eth_call', [{ to: SV, data: '0x' + selecteur('getLiquidity(bytes32)') + p.id.slice(2) }, 'latest']));
  const res = { sym: p.sym, jeton: p.jeton, hook: p.hook, poolId: p.id, liquidite: s(L) };
  console.log('\n=== ' + p.sym + ' (' + p.hook + ', L = ' + L + ') ===');
  const Q = p.paire ? p.paire.adr.toLowerCase() : ETH, nomQ = p.paire ? p.paire.sym : 'ETH';
  const M = p.paire ? p.paire.montant : M_ACHAT;
  const fdo = p.paire ? new Set([Q]) : null;
  const opts = { rpc, chaine: 8453, jeton: p.jeton, compte: u, ...(p.cle ? { cleImposee: p.cle } : {}), ...(fdo ? { fraisDevisesOk: fdo } : {}) };
  if (p.paire) { /* financer l utilisateur en SPCXc depuis une pool qui en detient (fork seulement) */
    await rpc('anvil_impersonateAccount', [p.paire.source]); await rpc('anvil_setBalance', [p.paire.source, '0x' + (10n ** 17n).toString(16)]);
    const t = await envoyer(p.paire.source, { to: Q, data: '0x' + selecteur('transfer(address,uint256)') + pad(u) + (100n * M).toString(16).padStart(64, '0') });
    if (!t.ok) throw new Error('financement ' + nomQ);
  }
  const planifier = async (sens, montant) => { let r = await planEchange({ ...opts, sens, montant });
    if (r.etat === 'APPROBATIONS') { for (const e of r.etapes) { const x = await envoyer(u, e); if (!x.ok) throw new Error('approbation ' + e.nom); } r = await planEchange({ ...opts, sens, montant }); }
    return r; };
  const pa = await planifier('ACHAT', M);
  res.devise = nomQ;
  res.achat = { etat: pa.etat, pourquoi: pa.pourquoi || null, bps: pa.resume ? s(pa.resume.fraisBps) : null, fraisDevis: pa.resume ? s(pa.resume.frais) : null,
    hookCle: pa.cle ? pa.cle.hooks : null };
  if (pa.etat !== 'PRET') {
    console.log('  achat : ' + pa.etat + ' — ' + pa.pourquoi); ok(p.sym + ' achat PRET', false, pa.pourquoi);
    res.verdict = 'APP NE ROUTE PAS : ' + pa.pourquoi; ligne.push(res); await rpc('evm_revert', [snap]); continue;
  }
  if (String(pa.cle.hooks).toLowerCase() !== HOOKS[p.hook].toLowerCase()) res.noteCle = 'l app a choisi une autre cle : ' + pa.cle.hooks;
  ok(p.sym + ' l app trade CETTE vieille pool (hook ' + p.hook + ')', String(pa.cle.hooks).toLowerCase() === HOOKS[p.hook].toLowerCase(), pa.cle.hooks);
  const ma = await mesurer(u, pa.tx, p.jeton, Q);
  const bpsA = BigInt(pa.resume.fraisBps);
  const routeurA = bpsA > 0n ? (M * bpsA) / 10000n : 0n;
  res.achat = { ...res.achat, tx: { to: pa.tx.to, value: pa.tx.value, selecteur: pa.tx.data.slice(0, 10), data: pa.tx.data }, ok: ma.ok, hash: ma.h,
    a6cfDevise: s(ma.dA6Q), a6cfEth: s(ma.dA6Eth), a6cfBloc: s(ma.dA6Bloc), userDeviseHorsGaz: s(ma.dUQ), userBloc: s(ma.dUBloc), routeurAttendu: s(routeurA) };
  ok(p.sym + ' achat execute', ma.ok);
  ok(p.sym + ' achat : l utilisateur paie EXACTEMENT ' + M + ' ' + nomQ + '-wei' + (Q === ETH ? ' (hors gaz)' : '') + ', rien de plus', ma.dUQ === -M, s(ma.dUQ));
  const double = p.hook === 'V8' && Q !== ETH; /* hookPaie de echange.js n est vrai que sur ETH : routeur + hook sur la meme jambe */
  if (double) {
    const hookA = ((M - routeurA) * HOOK_V8_PPM) / 1000000n;
    ok(p.sym + ' achat : CONSTAT DOUBLE FRAIS — a6cf +' + ma.dA6Q + ' ' + nomQ + '-wei = routeur ' + routeurA + ' (floor(M x 50/1e4)) + hook V8 ' + hookA + ' (floor((M-routeur) x 5000/1e6)), au wei', ma.dA6Q === routeurA + hookA && BigInt(pa.resume.frais) === routeurA, s(ma.dA6Q));
    res.achat.doubleFrais = { routeur: s(routeurA), hook: s(hookA) };
  } else if (bpsA > 0n) {
    ok(p.sym + ' achat : frais routeur ' + bpsA + ' bps = floor(' + M + ' x ' + bpsA + ' / 1e4) = ' + routeurA + ' ' + nomQ + '-wei a a6cf, au wei', ma.dA6Q === routeurA && BigInt(pa.resume.frais) === routeurA, s(ma.dA6Q));
  } else {
    ok(p.sym + ' achat : routeur 0 (le hook ' + p.hook + ' paie a6cf) — a6cf recoit du ' + nomQ + ' du hook, > 0, aucun TAKE routeur vers a6cf', ma.dA6Q > 0n && !pa.tx.data.toLowerCase().includes(FEE_WALLET.slice(2)), s(ma.dA6Q));
    res.achat.hookSurEntree_ppm = s((ma.dA6Q * 1000000n) / M);
    if (p.hook === 'V8') ok(p.sym + ' achat : hook V8 = floor(1e15 x 5000 / 1e6) = ' + (M * HOOK_V8_PPM) / 1000000n + ' wei ETH, au wei', ma.dA6Q === (M * HOOK_V8_PPM) / 1000000n, s(ma.dA6Q));
  }
  ok(p.sym + ' achat : le block recu par l utilisateur > 0', ma.dUBloc > 0n, s(ma.dUBloc));
  /* le calldata du routeur ne contient AUCUN TAKE (devise = block, destinataire = a6cf) ; ce que le hook fait de son cote est mesure a part */
  const takeBlocA6 = (d) => d.toLowerCase().includes(pad(p.jeton) + pad(FEE_WALLET));
  ok(p.sym + ' achat : le ROUTEUR ne verse aucun jeton de block a a6cf (aucun TAKE block -> a6cf dans le calldata)' + (ma.dA6Bloc !== 0n ? ' — le hook ' + p.hook + ', lui, en verse ' + ma.dA6Bloc : ''), !takeBlocA6(pa.tx.data));
  if (ma.dA6Bloc !== 0n) res.achat.hookVerseDuBlock = s(ma.dA6Bloc);
  /* ── VENTE de la moitie de ce qui vient d etre achete ── */
  const mv = ma.dUBloc / 2n;
  const pv = await planifier('VENTE', mv);
  res.vente = { etat: pv.etat, pourquoi: pv.pourquoi || null, bps: pv.resume ? s(pv.resume.fraisBps) : null, montant: s(mv) };
  if (pv.etat !== 'PRET') { console.log('  vente : ' + pv.etat + ' — ' + pv.pourquoi); ok(p.sym + ' vente PRET', false, pv.pourquoi); ligne.push(res); await rpc('evm_revert', [snap]); continue; }
  const mvv = await mesurer(u, pv.tx, p.jeton, Q);
  const bpsV = BigInt(pv.resume.fraisBps);
  const doubleV = p.hook === 'V8' && Q !== ETH;
  /* vente double : brut (avant hook) = utilisateur + a6cf ; hook = floor(brut x 5000/1e6) ; le routeur prend 50 bps de ce qui reste */
  const hookV = doubleV ? ((mvv.dUQ + mvv.dA6Q) * HOOK_V8_PPM) / 1000000n : 0n;
  const credit = mvv.dUQ + (bpsV > 0n ? mvv.dA6Q - hookV : 0n);
  const routeurV = bpsV > 0n ? (credit * bpsV) / 10000n : 0n;
  res.vente = { ...res.vente, ok: mvv.ok, hash: mvv.h, a6cfDevise: s(mvv.dA6Q), a6cfBloc: s(mvv.dA6Bloc), userDeviseHorsGaz: s(mvv.dUQ), userBloc: s(mvv.dUBloc),
    creditRouteur: s(credit), routeurAttendu: s(routeurV), tx: { to: pv.tx.to, value: pv.tx.value, selecteur: pv.tx.data.slice(0, 10) } };
  ok(p.sym + ' vente executee', mvv.ok);
  ok(p.sym + ' vente : exactement ' + mv + ' unites de block quittent l utilisateur', mvv.dUBloc === -mv, s(mvv.dUBloc));
  if (doubleV) {
    ok(p.sym + ' vente : CONSTAT DOUBLE FRAIS — a6cf +' + mvv.dA6Q + ' = hook V8 ' + hookV + ' (floor(brut ' + (mvv.dUQ + mvv.dA6Q) + ' x 5000/1e6)) + routeur ' + routeurV + ' (floor(credit ' + credit + ' x 50/1e4)), au wei', mvv.dA6Q === hookV + routeurV, s(mvv.dA6Q));
    res.vente.doubleFrais = { routeur: s(routeurV), hook: s(hookV) };
  } else if (bpsV > 0n) {
    ok(p.sym + ' vente : frais routeur = floor(credit ' + credit + ' x ' + bpsV + ' / 1e4) = ' + routeurV + ' ' + nomQ + '-wei a a6cf, au wei', mvv.dA6Q === routeurV, s(mvv.dA6Q));
  } else {
    ok(p.sym + ' vente : routeur 0 (le hook ' + p.hook + ' paie a6cf en ' + nomQ + ') — a6cf > 0, aucun TAKE routeur vers a6cf', mvv.dA6Q > 0n && !pv.tx.data.toLowerCase().includes(FEE_WALLET.slice(2)), s(mvv.dA6Q));
    res.vente.hookSurSortieBrute_ppm = s((mvv.dA6Q * 1000000n) / (mvv.dUQ + mvv.dA6Q));
    if (p.hook === 'V8') ok(p.sym + ' vente : hook V8 = floor(brut ' + (mvv.dUQ + mvv.dA6Q) + ' x 5000 / 1e6) wei ETH, au wei', mvv.dA6Q === ((mvv.dUQ + mvv.dA6Q) * HOOK_V8_PPM) / 1000000n, s(mvv.dA6Q));
  }
  ok(p.sym + ' vente : a6cf ne recoit AUCUN jeton de block (ni routeur ni hook)', mvv.dA6Bloc === 0n && !takeBlocA6(pv.tx.data), s(mvv.dA6Bloc));
  /* ── TEMOIN NEGATIF : la meme tx d achat, a6cf remplace par un autre beneficiaire dans le calldata => a6cf doit lire +0 ── */
  if (bpsA > 0n) {
    await rpc('evm_revert', [snap]); const snap2 = await rpc('evm_snapshot');
    await rpc('anvil_impersonateAccount', [u]); await rpc('anvil_setBalance', [u, '0x' + (10n ** 18n).toString(16)]);
    if (p.paire) { await rpc('anvil_impersonateAccount', [p.paire.source]); await rpc('anvil_setBalance', [p.paire.source, '0x' + (10n ** 17n).toString(16)]);
      await envoyer(p.paire.source, { to: Q, data: '0x' + selecteur('transfer(address,uint256)') + pad(u) + (100n * M).toString(16).padStart(64, '0') });
      await planifier('ACHAT', M); /* rejoue les approbations */ }
    const autre = '0x000000000000000000000000000000000000beef';
    const bqA = (a) => (Q === ETH ? bal(a) : solde(Q, a));
    const avAutre = await bqA(autre);
    const txFaux = { ...pa.tx, data: pa.tx.data.split(FEE_WALLET.slice(2)).join(autre.slice(2)) };
    const mf = await mesurer(u, txFaux, p.jeton, Q);
    const recuAutre = (await bqA(autre)) - avAutre;
    const resteHook = double ? ((M - routeurA) * HOOK_V8_PPM) / 1000000n : 0n;
    ok(p.sym + ' TEMOIN NEGATIF : beneficiaire du TAKE detourne => a6cf +' + resteHook + (double ? ' (la part du hook seule)' : '') + ' et ' + autre + ' +' + routeurA + ' (le frais routeur)', mf.ok && mf.dA6Q === resteHook && recuAutre === routeurA, s(mf.dA6Q) + ' / ' + s(recuAutre));
    res.temoin = { a6cf: s(mf.dA6Q), detourne: s(recuAutre) };
    await rpc('evm_revert', [snap2]);
  } else await rpc('evm_revert', [snap]);
  res.verdict = (double ? 'DOUBLE FRAIS (routeur 50 bps + hook V8 0,5 %, en ' + nomQ + ') · ' : '') + (bpsA > 0n ? 'achat : routeur ' + bpsA + ' bps ' + nomQ : 'achat : hook ' + p.hook + ' ' + nomQ) + ' · ' + (bpsV > 0n ? 'vente : routeur ' + bpsV + ' bps ' + nomQ : 'vente : hook ' + p.hook + ' ' + nomQ);
  ligne.push(res);
}
console.log('\n' + n + ' verifications, ' + ko + ' KO');
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ blocFork: tete, a6cf: FEE_WALLET, montantAchatWei: s(M_ACHAT), fraisInterfaceBps: s(FRAIS_INTERFACE_BPS), pools: ligne }, null, 1));
process.exit(ko ? 1 : 0);
