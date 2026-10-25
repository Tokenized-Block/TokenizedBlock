/* banc-cle-par-pool-id-fork-20261026.mjs — UN BLOCK DEVENU ACHETABLE PAR SA CLE LUE VIA SON poolId : ETH -> BLOCK DE BOUT EN BOUT, SUR FORK.
 *
 * POURQUOI : prod 20261025-game46 servait 194 lignes de Market, 153 sans cle de pool connue, 0 achetable ; ADOF REFUSE (« no initialized
 *   pool among the 15 keys read »). cle-par-pool-id.js lit la cle par le poolId que DexScreener sert. Mesure du 2026-10-25
 *   (mesures/cles-par-pool-id-trending-20261026.json) : 151 cles lues, 12 lignes achetables par le verdict du Buy.
 * CE BANC (fork de Base, port DEDIE, compte impersonne, aucune cle privee, rien sur mainnet) :
 *   CIBLE = la premiere ligne TIERS achetable de cette mesure ; son indice (poolId, date) est relu chez DexScreener, en direct.
 *   I.   clePoolParId : horodatages lus SUR LE FORK, un getLogs filtre par le poolId ; le poolId se recalcule ; slot0 != 0 sur le fork ;
 *   II.  verdictAchatMarche (vrai Quoter v4 du fork) : achetable ;
 *   III. planRail (le meme que /api/rails/plan), ETH -> CIBLE, 0,001 ETH, clesDe = CETTE cle seule : PRET ; octets executes == octets du
 *        plan (to, data, value relus dans la tx minee) ; recu >= recoitAuMoins ; recu == quote du plan ; le wallet des frais recoit
 *        EXACTEMENT resume.frais en ETH (0,5 %) ; le compte paie montant + gaz, rien de plus ; la pool de la cle est celle qui bouge ;
 *   IV.  temoin : la MEME demande avec clesDe = [] (l etat de prod d avant) -> REFUSE, rien a signer, rien ne part ;
 *   V.   ADOF (mesures/cle-par-pool-id-adof-20261026.json) : sa cle est LUE, mais le Quoter revert sur son hook -> PAS achetable,
 *        le plan ETH -> ADOF n est ni PRET ni APPROBATIONS (rien a signer) ; USDC -> ADOF dit tel quel.
 * Les sources TB sont celles que prod sert (lues : le banc le verifie).
 * ⚠️ l amont du fork (passerelle tenderly) rend « invalid params » a un getLogs historique : le getLogs (lecture seule) part a publicnode
 *   (LOGS_URL) ; les horodatages de blocs et TOUT le reste sont lus sur le fork.
 * Usage : anvil.exe --base --fork-url https://base.gateway.tenderly.co --port 9971 ; node banc-cle-par-pool-id-fork-20261026.mjs [http://127.0.0.1:9971] */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9971';
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const R = await imp('rails-api.js');
const A = await imp('achat-marche.js');
const F = await imp('frais-creation.js');
const P = await imp('pool.js');
const L = await imp('lancer-pool.js');
const I = await imp('index-routeur.js');
const PSH = await imp('pool-sans-hook.js');
const C = await imp('cle-par-pool-id.js');
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const appelUrl = (url) => async (method, params) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const rpc = appelUrl(URL_FORK);
const rpcLogs = appelUrl(process.env.LOGS_URL || 'https://base-rpc.publicnode.com');
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const SV = L.V4_ADRESSES[8453].stateView;
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + adrMot(qui) }, 'latest'])));
const slot0 = async (cle) => BigInt(String(await rpc('eth_call', [{ to: SV, data: '0x' + P.selecteur('getSlot0(bytes32)') + P.poolId(cle).slice(2) }, 'latest'])).slice(0, 66));
const big = (x) => BigInt(String(x));
const nue = (c) => ({ currency0: c.currency0, currency1: c.currency1, fee: c.fee, tickSpacing: c.tickSpacing, hooks: c.hooks });
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* envoye pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 1800; i += 1) {
    const r = await rpc('eth_getTransactionReceipt', [h]);
    if (r) { const t = await rpc('eth_getTransactionByHash', [h]); return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0'), tx: t }; }
    await new Promise((o) => setTimeout(o, 100));
  }
  throw new Error('receipt never came');
}
const PROD = 'https://tokenizedblock.space';
const lireProd = async (chemin) => { try { return await fetch(PROD + chemin, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(60000) }).then((x) => x.json()); } catch (e) { return { ok: false, pourquoi: e.message }; } };

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
const [br, nb] = await Promise.all([lireProd('/api/blocks-routeur'), lireProd('/api/nos-blocks')]);
I.chargerIndexRouteur(br); I.chargerNosBlocksTb(nb);
ok(I.sourcesTbLues() === true, 'sources TB lues depuis prod (index routeur + nos-blocks) : ' + I.sourcesTbLues());

/* la CIBLE : premiere ligne TIERS achetable de la mesure ; son indice relu chez DexScreener (le flux du serveur) */
const MES = JSON.parse(readFileSync(path.join(ICI, 'mesures', 'cles-par-pool-id-trending-20261026.json'), 'utf8'));
const ligne = MES.lignes.find((l) => l.achat && l.achat.achetable === true && l.achat.classe === 'TIERS');
if (!ok(!!ligne, 'une ligne TIERS achetable dans la mesure : ' + (ligne && ligne.sym + ' ' + ligne.adr))) process.exit(1);
const CIBLE = ligne.adr;
const paires = await fetch('https://api.dexscreener.com/tokens/v1/base/' + CIBLE, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch(() => null);
const ind = (C.indicesPoolIdDepuisPaires(paires, [CIBLE]).get(CIBLE) || [])[0];
if (!ok(!!ind, 'indice DexScreener de la cible : ' + (ind ? ind.poolId.slice(0, 12) + '… cree ' + new Date(ind.creeLeMs).toISOString() : 'aucun'))) process.exit(1);

/* ── I ── */
const r = await C.clePoolParId({ rpc, rpcLogs, poolId: ind.poolId, jeton: CIBLE, creeLeMs: ind.creeLeMs, tete });
if (!ok(r.etat === 'LUE', 'I. cle de ' + ligne.sym + ' lue par son poolId : ' + r.etat + (r.pourquoi ? ' — ' + r.pourquoi : '') + ' (bloc ' + r.bloc + ', ' + (tete - r.bloc) + ' sous la tete)')) process.exit(1);
const cle = nue(r.cle);
ok(P.poolId(cle).toLowerCase() === ind.poolId, 'I. le poolId se recalcule depuis la cle');
ok(tete - r.bloc > 10 * 999, 'I. la pool est hors de la recherche courte d avant (' + (tete - r.bloc) + ' blocs > 9 990)');
const s0 = await slot0(cle);
ok(s0 !== 0n, 'I. la pool est initialisee sur le fork (sqrtPriceX96 ' + s0 + ')');
console.log('     cle : ' + JSON.stringify(cle) + ' · classe ' + PSH.classeBlock(CIBLE, [cle]));

const compte = '0x' + ('c1e9' + tete).padEnd(40, 'a').slice(0, 40);
await rpc('anvil_impersonateAccount', [compte]);
await rpc('anvil_setBalance', [compte, '0x' + (10n * 10n ** 18n).toString(16)]);
const montant = 10n ** 15n;
const snap0 = await rpc('evm_snapshot', []);
try {
  /* ── II ── */
  const quoter = A.quoterV4({ rpc, chaine: 8453 });
  const v = await A.verdictAchatMarche({ jeton: CIBLE, cles: [cle], quoter });
  ok(v.achetable === true && v.quote > 0n, 'II. verdict du Buy : achetable=' + v.achetable + ', devis ' + v.quote + ' pour 0,001 ETH, frais par le ' + v.fraisPar + (v.pourquoi ? ' — ' + v.pourquoi : ''));
  /* ── III ── */
  const deps = { rpc, chaine: 8453, clesDe: async (a) => (String(a).toLowerCase() === CIBLE ? [r.cle] : []) };
  const p = await R.planRail({ de: 'ETH', vers: CIBLE, montant: String(montant), compte }, deps);
  if (ok(p.etat === 'PRET', 'III. plan ETH > ' + ligne.sym + ' : ' + p.etat + ' (' + (p.via || '') + (p.pourquoi ? ' : ' + p.pourquoi : '') + ')')) {
    const frais = big(p.resume.frais), minOut = big(p.resume.recoitAuMoins), quote = big(p.resume.quote);
    ok(frais === (montant * 50n) / 10000n && String(p.resume.fraisDevise) === 'ETH' && String(p.resume.beneficiaireFrais || '').toLowerCase() === FRAIS,
      'III. le plan annonce AVANT signature ' + frais + ' wei (0,5 % de ' + montant + ') en ETH vers le wallet des frais');
    const lire = async () => ({ eth: await solde(ETH, compte), tok: await solde(CIBLE, compte), usdc: await solde(USDC, compte), fEth: await solde(ETH, FRAIS), fTok: await solde(CIBLE, FRAIS), fUsdc: await solde(USDC, FRAIS) });
    const avant = await lire();
    let gaz = 0n; const statuts = [], memes = [];
    for (const c of p.aSigner) {
      const e = await envoyer(compte, c); gaz += e.gaz; statuts.push(e.status);
      memes.push(String(e.tx.to).toLowerCase() === String(c.to).toLowerCase() && String(e.tx.input).toLowerCase() === String(c.data).toLowerCase() && BigInt(e.tx.value) === BigInt(c.value || '0x0'));
      if (e.status !== '0x1') break;
    }
    ok(statuts.length === p.aSigner.length && statuts.every((s) => s === '0x1'), 'III. ' + p.aSigner.length + ' appel(s) executes sans revert (' + statuts.join(',') + ')');
    ok(memes.length === p.aSigner.length && memes.every(Boolean), 'III. octets executes == octets du plan (to, data, value relus dans la tx minee)');
    const apres = await lire();
    const recu = apres.tok - avant.tok;
    ok(recu >= minOut && recu > 0n, 'III. recu ' + recu + ' >= minimum ' + minOut);
    ok(recu === quote, 'III. devis == execution : recu ' + recu + ', quote du plan ' + quote + ' (ecart ' + (recu - quote) + ')');
    ok(apres.fEth - avant.fEth === frais, 'III. le wallet des frais recoit EXACTEMENT ' + (apres.fEth - avant.fEth) + ' wei d ETH (attendu ' + frais + ')');
    ok(avant.eth - apres.eth === montant + gaz, 'III. le compte paie ' + montant + ' wei + ' + gaz + ' de gaz, rien de plus (delta ' + (avant.eth - apres.eth) + ')');
    ok(apres.usdc === avant.usdc && apres.fTok === avant.fTok && apres.fUsdc === avant.fUsdc, 'III. rien d autre ne bouge (USDC du compte, block et USDC du wallet des frais)');
    ok((await slot0(cle)) !== s0, 'III. la pool de la cle lue est celle qui a bouge (slot0 change)');
    console.log('     via ' + p.via + ' · to ' + p.aSigner.map((c) => c.to).join(',') + ' · hook ' + cle.hooks + ' fee ' + cle.fee + ' ts ' + cle.tickSpacing);
  }
  await rpc('evm_revert', [snap0]);
  /* ── IV ── */
  const fAvant = await solde(ETH, FRAIS);
  const p0 = await R.planRail({ de: 'ETH', vers: CIBLE, montant: String(montant), compte }, { rpc, chaine: 8453, clesDe: async () => [] });
  ok(p0.etat !== 'PRET' && p0.etat !== 'APPROBATIONS' && !(p0.aSigner || []).length, 'IV. temoin : sans la cle (etat de prod d avant) -> ' + p0.etat + ' : ' + String(p0.pourquoi || '').slice(0, 110));
  ok((await solde(ETH, FRAIS)) === fAvant, 'IV. rien n est parti');
  /* ── V ── ADOF */
  const FX = JSON.parse(readFileSync(path.join(ICI, 'mesures', 'cle-par-pool-id-adof-20261026.json'), 'utf8'));
  const ADOF = FX.dexscreener.jeton.toLowerCase();
  const ra = await C.clePoolParId({ rpc, rpcLogs, poolId: FX.dexscreener.pairAddress, jeton: ADOF, creeLeMs: FX.dexscreener.pairCreatedAt, tete });
  ok(ra.etat === 'LUE', 'V. ADOF : cle LUE par son poolId (' + ra.etat + ', bloc ' + ra.bloc + ', hook ' + (ra.cle && ra.cle.hooks) + ')');
  if (ra.etat === 'LUE') {
    const va = await A.verdictAchatMarche({ jeton: ADOF, cles: [nue(ra.cle)], quoter });
    ok(va.achetable === false && va.nonCotees.length === 1 && /revert/.test(va.nonCotees[0].raison), 'V. ADOF : PAS achetable — le Quoter v4 revert sur sa pool (' + String(va.nonCotees[0] && va.nonCotees[0].raison || va.pourquoi).slice(0, 90) + ')');
    const pa = await R.planRail({ de: 'ETH', vers: ADOF, montant: String(montant), compte }, { rpc, chaine: 8453, clesDe: async (a) => (String(a).toLowerCase() === ADOF ? [ra.cle] : []) });
    ok(pa.etat !== 'PRET' && pa.etat !== 'APPROBATIONS' && !(pa.aSigner || []).length, 'V. ETH > ADOF avec sa cle : ' + pa.etat + ', rien a signer — ' + String(pa.pourquoi || '').slice(0, 110));
    const pu = await R.planRail({ de: USDC, vers: ADOF, montant: '1000000', compte }, { rpc, chaine: 8453, clesDe: async (a) => (String(a).toLowerCase() === ADOF ? [ra.cle] : []) });
    ok(pu.etat !== 'PRET' && pu.etat !== 'APPROBATIONS', 'V. USDC > ADOF avec sa cle : ' + pu.etat + ' — ' + String(pu.pourquoi || '').slice(0, 140));
  }
} finally { try { await rpc('evm_revert', [snap0]); } catch (_) { /* deja rendu */ } }
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
