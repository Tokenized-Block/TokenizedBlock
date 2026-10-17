/* banc-buy-tiers-fork-20261017.mjs — LE BUY DE MARKET SUR LES BLOCKS TIERS : VERDICT SERVEUR, ACHAT REEL, FRAIS A L ARRIVEE.
 *
 * POURQUOI (mesure prod du 2026-10-17, 17:12Z) : 159 lignes de Market sans Buy ; 13 d entre elles ont une pool ETH sur le hook o1
 *   Standard (0x1f91…2acc) qui cote, 3 une pool ETH sans hook (0,25 %) ; 28 des 33 lignes qui AVAIENT Buy ne cotaient pas.
 * CE BANC EXECUTE, sur un fork de Base (base-anvil, port DEDIE) :
 *   I.   achat-marche.js (verdictAchatMarche, vrai Quoter v4 du fork) : achetable sur les blocks tiers dont la cle est connue du serveur de
 *        prod (/api/cle, depuisCache) ; PAS achetable sur Tope (hook tiers dont le Quoter revert 0x6190b2b0) ; PAS achetable sur une cle
 *        piege (frais LP 88 %) — refusee AVANT tout devis (0 appel au Quoter).
 *   II.  le planificateur serveur (rails-api planRail, le meme que /api/rails/plan) : ETH > block, 0,001 ETH, pour 4 blocks tiers ; les
 *        appels sont ENVOYES sur le fork et les SOLDES lus : block recu >= recoitAuMoins ; le wallet des frais recoit EXACTEMENT
 *        resume.frais en ETH = 0,5 % ; le compte paie montant + gaz, rien d autre ne bouge (USDC du compte, block et USDC du wallet
 *        des frais).
 *   III. trou (c) : planEchange avec une cle PIEGE imposee (BASEDOG, 88,31 % sans hook) -> REFUSE refusPiegeLp, rien a signer.
 *   IV.  temoin negatif par le planificateur : ETH > Tope -> rien de PRET, le wallet des frais ne bouge pas.
 * ⛔ BORNES : fork (compte impersonne, aucune cle privee, rien sur mainnet) ; les cles viennent du /api/cle de PROD (copiees de la reponse,
 *   jamais tapees), avec repli sur des cles LUES sur la chaine le 2026-10-17 (poolId recalcule ET slot0 != 0 sur le fork) ; les sources TB
 *   sont celles que prod sert au moment du banc (non lues = tout B20 inconnu est un block : les achats seraient refuses, et le banc le DIT).
 *   Ne prouve ni l interface (le bouton), ni un vrai wallet.
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://base.gateway.tenderly.co --port 9963
 *         node banc-buy-tiers-fork-20261017.mjs [http://127.0.0.1:9963] */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9963';
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const R = await imp('rails-api.js');
const E = await imp('echange.js');
const A = await imp('achat-marche.js');
const F = await imp('frais-creation.js');
const P = await imp('pool.js');
const L = await imp('lancer-pool.js');
const I = await imp('index-routeur.js');
const PSH = await imp('pool-sans-hook.js');
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const rpc = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const SV = L.V4_ADRESSES[8453].stateView;
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
const slot0 = async (cle) => BigInt(String(await rpc('eth_call', [{ to: SV, data: '0x' + P.selecteur('getSlot0(bytes32)') + P.poolId(cle).slice(2) }, 'latest'])).slice(0, 66));
const big = (x) => BigInt(String(x));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* on l envoie pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 1800; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came');
}
/* ── les blocks du banc : adresses et cles LUES sur la chaine le 2026-10-17 (Initialize du PoolManager, poolId recalcule), repli si prod ne sert pas la cle ── */
const HO1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
const SANS = '0x0000000000000000000000000000000000000000';
const BLOCKS = [
  { sym: 'tekcat', adr: '0xb200000000000000000000f5af2ce9372d0a0f01', repli: [{ currency0: ETH, currency1: '0xb200000000000000000000f5af2ce9372d0a0f01', fee: 0, tickSpacing: 200, hooks: HO1 }] },
  { sym: 'BASEDOG', adr: '0xb200000000000000000000b3020837cb3a0e9701', repli: [{ currency0: ETH, currency1: '0xb200000000000000000000b3020837cb3a0e9701', fee: 0, tickSpacing: 200, hooks: HO1 },
    { currency0: ETH, currency1: '0xb200000000000000000000b3020837cb3a0e9701', fee: 883131, tickSpacing: 200, hooks: SANS }] },
  { sym: 'POOPCOIN', adr: '0xb200000000000000000000d000e4d490b6ff0001', repli: [{ currency0: ETH, currency1: '0xb200000000000000000000d000e4d490b6ff0001', fee: 0, tickSpacing: 200, hooks: HO1 }] },
  { sym: 'FRONTIER', adr: '0xb2000000000000000000007069b6ab1f98f1d701', repli: [{ currency0: ETH, currency1: '0xb2000000000000000000007069b6ab1f98f1d701', fee: 0, tickSpacing: 200, hooks: HO1 }] },
  { sym: 'PAX', adr: '0xb2000000000000000000001cb153a0101e7fa378', repli: [{ currency0: ETH, currency1: '0xb2000000000000000000001cb153a0101e7fa378', fee: 2500, tickSpacing: 25, hooks: SANS }] },
];
const TOPE = { sym: 'Tope', adr: '0xb2000000000000000000000a03cd7220becec781', repli: [{ currency0: ETH, currency1: '0xb2000000000000000000000a03cd7220becec781', fee: 100, tickSpacing: 1, hooks: '0x0458e5256a20ac2f8abddba11fa4d00f3fa800cc' },
  { currency0: '0x4fc59c42653e052c7ab5c8381f839e2d70504131', currency1: '0xb2000000000000000000000a03cd7220becec781', fee: 0, tickSpacing: 1, hooks: '0x9c92347349b34f1a58c617ca8f2929f4b11128c0' }] };
const PROD = 'https://tokenizedblock.space';
const lireProd = async (chemin) => { try { return await fetch(PROD + chemin, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(60000) }).then((x) => x.json()); } catch (e) { return { ok: false, pourquoi: e.message }; } };
const nettoyer = (c) => ({ currency0: String(c.currency0).toLowerCase(), currency1: String(c.currency1).toLowerCase(), fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: String(c.hooks || SANS).toLowerCase() });
async function clesDe(b) {
  const j = await lireProd('/api/cle/' + b.adr);
  if (j && j.ok === true && Array.isArray(j.cles) && j.cles.length) return { cles: j.cles.map(nettoyer), source: 'prod /api/cle' + (j.depuisCache ? ' (cache)' : '') };
  /* repli : les cles lues le 2026-10-17 — chacune doit exister sur le fork (slot0 != 0), sinon elle n entre pas */
  const vivantes = [];
  for (const c of b.repli) { try { if ((await slot0(c)) !== 0n) vivantes.push(nettoyer(c)); } catch (_) { /* non lue : n entre pas */ } }
  return { cles: vivantes, source: 'repli (cles lues le 2026-10-17, slot0 != 0 verifie sur le fork)' };
}

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
/* les sources TB, telles que prod les sert (le serveur les charge avant chaque jugement) */
const [br, nb] = await Promise.all([lireProd('/api/blocks-routeur'), lireProd('/api/nos-blocks')]);
I.chargerIndexRouteur(br); I.chargerNosBlocksTb(nb);
ok(I.sourcesTbLues() === true, 'sources TB lues depuis prod (index routeur + nos-blocks) : ' + I.sourcesTbLues() + (I.sourcesTbLues() ? '' : ' — ' + JSON.stringify([I.etatIndexRouteur().pourquoi])));
for (const b of [...BLOCKS, TOPE]) { Object.assign(b, await clesDe(b)); console.log('     ' + b.sym + ' : ' + b.cles.length + ' cle(s) · ' + b.source + ' · classe ' + PSH.classeBlock(b.adr, b.cles)); }
ok(BLOCKS.every((b) => b.cles.length >= 1), 'chaque block du banc a au moins une cle');

const compte = '0x' + ('b10c7' + tete).padEnd(40, 'e').slice(0, 40);
await rpc('anvil_impersonateAccount', [compte]);
await rpc('anvil_setBalance', [compte, '0x' + (10n * 10n ** 18n).toString(16)]);
const snap0 = await rpc('evm_snapshot', []);
const quoter = A.quoterV4({ rpc, chaine: 8453 });
let executes = 0;
try {
  /* ── I. le verdict serveur, sur le vrai Quoter ── */
  for (const b of BLOCKS) {
    const v = await A.verdictAchatMarche({ jeton: b.adr, cles: b.cles, quoter });
    b.verdict = v;
    ok(v.achetable === true && v.cle && v.quote > 0n, 'I. ' + b.sym + ' : achetable (' + v.achetable + ', devis ' + v.quote + ' pour 0,001 ETH, frais par le ' + v.fraisPar + (v.ecartees.length ? ', ecartees : ' + v.ecartees.map((e) => e.pourquoi).join(' / ') : '') + ')');
  }
  const vT = await A.verdictAchatMarche({ jeton: TOPE.adr, cles: TOPE.cles, quoter });
  ok(vT.achetable === false && vT.nonCotees.length >= 1, 'I. Tope : PAS achetable — ' + vT.pourquoi);
  const basedog = BLOCKS.find((b) => b.sym === 'BASEDOG');
  const piege = basedog.cles.find((c) => c.fee > 100000 && c.hooks === SANS);
  if (ok(!!piege, 'I. BASEDOG a une cle piege sans hook (' + (piege && (piege.fee / 10000).toFixed(2)) + ' % de frais LP)')) {
    let appels = 0;
    const vP = await A.verdictAchatMarche({ jeton: basedog.adr, cles: [piege], quoter: async (c, m) => { appels += 1; return quoter(c, m); } });
    ok(vP.achetable === false && appels === 0 && /LP fee/.test(vP.pourquoi), 'I. la cle piege seule : PAS achetable, 0 appel au Quoter (' + vP.pourquoi + ')');
  }
  /* ── II. l achat reel par le planificateur serveur, soldes lus ── */
  const montant = 10n ** 15n;
  for (const b of BLOCKS) {
    if (executes >= 4) break;
    const deps = { rpc, chaine: 8453, clesDe: async (a) => (String(a).toLowerCase() === b.adr ? b.cles : []) };
    const avant = { eth: await solde(ETH, compte), tok: await solde(b.adr, compte), usdc: await solde(USDC, compte),
      fEth: await solde(ETH, FRAIS), fTok: await solde(b.adr, FRAIS), fUsdc: await solde(USDC, FRAIS) };
    const s0 = await slot0(b.verdict.cle);
    const p = await R.planRail({ de: 'ETH', vers: b.adr, montant: String(montant), compte }, deps);
    if (!ok(p.etat === 'PRET', 'II. ' + b.sym + ' : plan ' + p.etat + ' (' + (p.via || '') + (p.pourquoi ? ' : ' + p.pourquoi : '') + ')')) continue;
    const frais = big(p.resume.frais), minOut = big(p.resume.recoitAuMoins);
    ok(frais === (montant * 50n) / 10000n && String(p.resume.fraisDevise) === 'ETH' && String(p.resume.beneficiaireFrais || '').toLowerCase() === FRAIS,
      'II. ' + b.sym + ' : le plan annonce AVANT signature un frais de ' + frais + ' wei (0,5 % de ' + montant + ') en ETH vers le wallet des frais');
    let gaz = 0n, statuts = [];
    for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; statuts.push(r.status); if (r.status !== '0x1') break; }
    if (!ok(statuts.length === p.aSigner.length && statuts.every((s) => s === '0x1'), 'II. ' + b.sym + ' : ' + p.aSigner.length + ' appel(s) executes sans revert (' + statuts.join(',') + ')')) continue;
    executes += 1;
    const apres = { eth: await solde(ETH, compte), tok: await solde(b.adr, compte), usdc: await solde(USDC, compte),
      fEth: await solde(ETH, FRAIS), fTok: await solde(b.adr, FRAIS), fUsdc: await solde(USDC, FRAIS) };
    const recu = apres.tok - avant.tok;
    ok(recu >= minOut && recu > 0n, 'II. ' + b.sym + ' : recu ' + recu + ' unites >= minOut ' + minOut);
    ok(apres.fEth - avant.fEth === frais, 'II. ' + b.sym + ' : le wallet des frais recoit EXACTEMENT ' + (apres.fEth - avant.fEth) + ' wei d ETH (attendu ' + frais + ')');
    ok(avant.eth - apres.eth === montant + gaz, 'II. ' + b.sym + ' : le compte paie ' + montant + ' wei + ' + gaz + ' de gaz, rien de plus (delta ' + (avant.eth - apres.eth) + ')');
    ok(apres.usdc === avant.usdc && apres.fTok === avant.fTok && apres.fUsdc === avant.fUsdc, 'II. ' + b.sym + ' : rien d autre ne bouge (USDC du compte, block et USDC du wallet des frais)');
    ok((await slot0(b.verdict.cle)) !== s0, 'II. ' + b.sym + ' : la pool du verdict est celle qui a bouge (slot0 change)');
    console.log('     ' + b.sym + ' · via ' + p.via + ' · ' + p.aSigner.length + ' appel(s) · hook ' + b.verdict.cle.hooks.slice(0, 10) + '… fee ' + b.verdict.cle.fee);
  }
  ok(executes >= 4, 'II. ' + executes + ' achat(s) reel(s) executes sur des blocks tiers (au moins 4 demandes)');
  /* ── III. trou (c) sur le fork : la cle piege imposee a planEchange ── */
  if (piege) {
    const fAvant = await solde(ETH, FRAIS);
    const pc = await E.planEchange({ rpc, chaine: 8453, jeton: basedog.adr, compte, sens: 'ACHAT', montant, cleImposee: piege });
    ok(pc.etat === 'REFUSE' && pc.refusPiegeLp === true && !pc.tx, 'III. BASEDOG, cle piege imposee (88,31 %) : ' + pc.etat + ' refusPiegeLp=' + pc.refusPiegeLp + ' — ' + pc.pourquoi);
    ok((await solde(ETH, FRAIS)) === fAvant, 'III. rien n est parti : le wallet des frais est inchange');
  }
  /* ── IV. temoin negatif par le planificateur : Tope ── */
  const fAvantT = await solde(ETH, FRAIS);
  const pT = await R.planRail({ de: 'ETH', vers: TOPE.adr, montant: String(montant), compte }, { rpc, chaine: 8453, clesDe: async (a) => (String(a).toLowerCase() === TOPE.adr ? TOPE.cles : []) });
  ok(pT.etat !== 'PRET' && pT.etat !== 'APPROBATIONS', 'IV. ETH > Tope : rien a signer (' + pT.etat + ' : ' + String(pT.pourquoi || '').slice(0, 120) + ')');
  ok((await solde(ETH, FRAIS)) === fAvantT, 'IV. le wallet des frais est inchange');
} finally { await rpc('evm_revert', [snap0]); }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
