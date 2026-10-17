// test-ajouter-paire-20261017.mjs - 2026-10-17, ADD A PAIR to a block already born: block/ETH stays, block/<stock> opens next to it
// on the 7030 hook, in one batch. Off-chain: a mock chain answers each read; the planner must refuse what the hook refuses, never
// guess a price, state the real cost, and build the batch in the order the hook needs (registration paid BEFORE initialize).
// MEASURED on a base-anvil fork of Base at 52724026 (banc-ajouter-paire-fork-20261017.mjs, 39/39): UNIT/AAPLc opened by UNIT's real
// creator 0x31e0..de3b at sqrtPriceX96 210742839469389866827, 6 calls, 1 435 649 gas; a buy of 100000 AAPLc raw paid 70 to a6cf and 30 to
// the creator (reclaimed to his balance). This file pins the planner's refusals and arithmetic; the fork bench pins the chain.
import { selecteur, poolId, cleDePool, sqrtPriceDepuisPrix, prixDepuisSqrt } from './pool.js';
import { HOOK_7030, HOOK_V8 } from './tokenomics.js';
import { CLES_PRIX, USDC_BASE } from './prix-eth.js';
import { FEEDS_CHAINLINK, REGISTRE_ORACLE_COINBASE } from './reference-action.js';
import { V4_ADRESSES, PERMIT2 } from './lancer-pool.js';
import { SIG_INSCRIRE_CAUTION, SIG_INSCRIRE_CAUTION_SEL } from './lancer-pool-v2.js';
import { plancher7030 } from './hook-7030-descripteur.js';
import { ACTIONS_COINBASE } from './paires.js';
import { FRAIS_OUVERTURE_WEI } from './frais-creation.js';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
let AP;
try { AP = await import('./ajouter-paire.js'); } catch (e) { ok(false, 'ajouter-paire.js loads (' + e.message.slice(0, 100) + ')'); console.log('KO ' + ko + '/' + n); process.exit(1); }
const { planAjouterPaire, prixDeLaNouvellePaire, blocsPourDevise, AJOUTER_PAIRE_ACTIF, ETATS_AJOUT } = AP;

const ETH = '0x0000000000000000000000000000000000000000';
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x1111111111111111111111111111111111111111';
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const AAPL = ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc').adr.toLowerCase();
const SV = V4_ADRESSES[8453].stateView.toLowerCase(), POSM = V4_ADRESSES[8453].posm.toLowerCase();
const H = HOOK_7030.toLowerCase();
const mot = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const S = (f) => '0x' + selecteur(f);
const MAINTENANT = Date.UTC(2026, 9, 15, 15, 0, 0); /* un jeudi : reference A_JOUR */
const SQRT_MARCHE = 10000n << 96n; /* UNIT/ETH lu sur mainnet le 2026-10-17 : 1 UNIT = 1e-8 ETH */
const REF = 34366499999n; /* Chainlink AAPL, 8 decimales, lu le 2026-10-17 */
const SQRT_ETHUSDC = sqrtPriceDepuisPrix({ prixNum: 2431542089n, prixDen: 1000000n, decDevise: 6, decBlock: 18, deviseEst0: false });
const cleN = cleDePool(AAPL, UNIT, { fee: 0, tickSpacing: 200, hooks: HOOK_7030 });
const pidN = poolId(cleN).slice(2);
const pidMarche7030 = poolId(cleDePool(ETH, UNIT, { fee: 0, tickSpacing: 200, hooks: HOOK_7030 })).slice(2);
const pidMarcheV8 = poolId(cleDePool(ETH, UNIT, { fee: 0, tickSpacing: 200, hooks: HOOK_V8 })).slice(2);
const pidsEthUsdc = CLES_PRIX.map((k) => poolId(cleDePool(ETH, USDC_BASE, k)).slice(2));
const FEED = FEEDS_CHAINLINK.get(AAPL).feed.toLowerCase();
const texteAbi = (s) => mot(0x20) + mot(s.length) + Buffer.from(s).toString('hex').padEnd(64, '0');

/** une chaine simulee : chaque lecture a une reponse, toute lecture inattendue JETTE (et le test le verra en NON_MESURE) */
function chaine(o = {}) {
  const journal = { appels: 0, simules: null, inattendus: [] };
  const rpc = async (m, p) => {
    journal.appels++;
    if (o.plante && o.plante(m, p)) throw new Error('node down');
    if (m === 'eth_getCode') return String(p[0]).toLowerCase() === H ? '0x6080' : '0x';
    if (m === 'eth_getBalance') return '0x' + (o.soldeEth ?? 10n ** 16n).toString(16);
    if (m === 'eth_simulateV1') { journal.simules = p[0].blockStateCalls[0].calls; return [{ calls: journal.simules.map((_, i) => ({ status: o.simKo === i ? '0x0' : '0x1', error: o.simKo === i ? { message: 'execution reverted' } : undefined })) }]; }
    if (m !== 'eth_call') throw new Error('unexpected ' + m);
    const to = String(p[0].to).toLowerCase(), d = String(p[0].data).toLowerCase(), sel = d.slice(0, 10), arg = d.slice(10);
    if (to === SV && sel === S('getSlot0(bytes32)')) {
      const pid = arg;
      let s = 0n;
      if (pid === pidN) s = o.sqrtNouvelle || 0n;
      else if (pid === pidMarche7030) s = o.sqrtMarche ?? SQRT_MARCHE;
      else if (pid === pidMarcheV8) s = 0n;
      else if (pidsEthUsdc.includes(pid)) s = o.desaccord && pid === pidsEthUsdc[0] ? SQRT_ETHUSDC * 2n : SQRT_ETHUSDC;
      return '0x' + mot(s) + mot(0) + mot(0) + mot(0);
    }
    if (to === H) {
      if (sel === S('estAdminDuBlock(address,address)')) return '0x' + mot(o.admin === false ? 0 : 1);
      if (sel === S('porteLeLabel(address)')) return '0x' + mot(1);
      if (sel === S('payee(bytes32)')) return '0x' + mot(o.payee ? 1 : 0);
      if (sel === S('inscrit(bytes32)')) return '0x' + adrMot(o.inscrit || ETH);
      if (sel === S('prixInscrit(bytes32)')) return '0x' + mot(o.prixInscrit || 0n);
      if (sel === S('createurs(bytes32)')) return '0x' + adrMot(o.createur || ETH) + mot(0) + mot(0);
      if (sel === S('DELAI_RETRAIT()')) return '0x' + mot(604800);
      if (sel === S('fraisVie()')) return '0x' + mot(300000000000000n);
      if (sel === S('fraisCreation()')) return '0x' + mot(700000000000000n);
    }
    if (to === PERMIT2.toLowerCase() && sel === S('allowance(address,address,address)')) return '0x' + mot(0) + mot(0) + mot(0);
    if (to === REGISTRE_ORACLE_COINBASE.toLowerCase() && sel === '0xd4197e82') return '0x' + mot(10n ** 18n) + mot(0);
    if (to === FEED && sel === '0x313ce567') return '0x' + mot(8);
    if (to === FEED && sel === '0xfeaf968c') {
      const maj = BigInt(Math.floor(MAINTENANT / 1000) - (o.refAgeS ?? 3600));
      return '0x' + mot(1) + mot(REF) + mot(maj) + mot(maj) + mot(1);
    }
    if (to.startsWith('0xb2')) {
      if (sel === '0xdc767007') return '0x' + mot(10n ** 18n);
      if (sel === '0x97a4064f') return '0x' + mot(0);
      if (sel === S('decimals()')) return '0x' + mot(to === UNIT ? 18 : 8);
      if (sel === S('symbol()') && to === UNIT) return '0x' + texteAbi('UNIT');
      if (sel === S('balanceOf(address)')) return '0x' + mot(to === UNIT ? (o.soldeUnit ?? 10n ** 24n) : (o.soldeDevise ?? 10n ** 8n));
      if (sel === S('allowance(address,address)')) return '0x' + mot(0);
    }
    journal.inattendus.push(to + ' ' + sel);
    throw new Error('unexpected call ' + to + ' ' + sel);
  };
  return { rpc, journal };
}
const plan = (o = {}, x = {}) => { const c = chaine(o); return planAjouterPaire({ rpc: c.rpc, compte: COMPTE, block: UNIT, devise: AAPL, montantDevise: 5000000n, maintenant: MAINTENANT, ...x }).then((r) => ({ r, j: c.journal })); };

/* ── drapeau et etats ── */
ok(AJOUTER_PAIRE_ACTIF === false, 'AJOUTER_PAIRE_ACTIF is OFF');
ok(JSON.stringify(ETATS_AJOUT) === JSON.stringify(['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE']), 'four states, the birth planner\'s');

/* ── le prix : arithmetique entiere, deux orientations ── */
const p0 = prixDeLaNouvellePaire({ sqrtBlocEth: SQRT_MARCHE, ethUsdE6: 2431542089n, refReponse: REF, refDecimales: 8, decDevise: 8, blockEst0: true });
const p1 = prixDeLaNouvellePaire({ sqrtBlocEth: SQRT_MARCHE, ethUsdE6: 2431542089n, refReponse: REF, refDecimales: 8, decDevise: 8, blockEst0: false });
const attendu = 1e-8 * 2431.542089 / 343.66499999; /* AAPLc par UNIT */
const vu0 = prixDepuisSqrt({ sqrtPriceX96: p0.sqrtCible, decDevise: 8, decBlock: 18, deviseEst0: false });
const vu1 = prixDepuisSqrt({ sqrtPriceX96: p1.sqrtCible, decDevise: 8, decBlock: 18, deviseEst0: true });
ok(Math.abs(vu0 / attendu - 1) < 1e-12 && Math.abs(vu1 / attendu - 1) < 1e-12, 'starting price = UNIT/ETH x ETH/USD / AAPLc/USD = ' + attendu.toExponential(6) + ' AAPLc per UNIT, block as currency0 AND as currency1 (' + vu0.toExponential(6) + ', ' + vu1.toExponential(6) + ')');
ok(p0.sqrtCible === 210742839469389866827n, 'same sqrtPriceX96 as the fork bench measured on chain (210742839469389866827)');
const produit = Number(p0.sqrtCible) * Number(p1.sqrtCible) / 2 ** 192;
ok(Math.abs(produit - 1) < 1e-12, 'the two orientations are exact reciprocals (sqrt0 x sqrt1 / 2^192 = ' + produit + ')');
ok(prixDeLaNouvellePaire({ sqrtBlocEth: 0n, ethUsdE6: 1n, refReponse: 1n, refDecimales: 8, decDevise: 8, blockEst0: true }) === null
  && prixDeLaNouvellePaire({ sqrtBlocEth: SQRT_MARCHE, ethUsdE6: 0n, refReponse: REF, refDecimales: 8, decDevise: 8, blockEst0: true }) === null
  && prixDeLaNouvellePaire({ sqrtBlocEth: SQRT_MARCHE, ethUsdE6: 2431542089n, refReponse: 0n, refDecimales: 8, decDevise: 8, blockEst0: true }) === null,
  'no price from a zero market, a zero ETH price or a zero stock price (null, never a guess)');
const b0 = blocsPourDevise({ montantDevise: 5000000n, sqrtPriceX96: p0.sqrtCible, blockEst0: true });
const b1 = blocsPourDevise({ montantDevise: 5000000n, sqrtPriceX96: p1.sqrtCible, blockEst0: false });
ok(Math.abs(Number(b0) / Number(b1) - 1) < 1e-12 && Math.abs(Number(b0) / (0.05 / attendu * 1e18) - 1) < 1e-9, 'blocks matching 0.05 AAPLc = ' + b0 + ' raw (both orientations agree)');

/* ── refus AVANT toute lecture ── */
const horsListe = ACTIONS_COINBASE.find((a) => plancher7030(a.adr) === null);
{ const { r, j } = await plan({}, { devise: horsListe.adr }); ok(r.etat === 'REFUSE' && !r.appels.length && j.appels === 0 && /fixed/.test(r.pourquoi), horsListe.symbole + ' (not in the hook list) -> REFUSE before any read: ' + r.pourquoi); }
{ const { r, j } = await plan({}, { devise: ETH }); ok(r.etat === 'REFUSE' && j.appels === 0, 'ETH -> REFUSE (already the birth pair)'); }
{ const { r } = await plan({}, { montantDevise: 0n }); ok(r.etat === 'REFUSE' && !r.appels.length, 'a zero deposit -> REFUSE'); }
{ const { r } = await plan({}, { montantDevise: 5000000 }); ok(r.etat === 'REFUSE', 'a deposit that is not raw bigint units -> REFUSE'); }
{ const { r } = await plan({}, { devise: UNIT }); ok(r.etat === 'REFUSE', 'the block against itself -> REFUSE'); }
{ const { r } = await plan({}, { chaine: 84532 }); ok(r.etat === 'REFUSE', 'not Base mainnet -> REFUSE'); }

/* ── le prix du block ne se lit pas : jamais devine ── */
{ const { r } = await plan({ sqrtMarche: 0n }); ok(r.etat === 'REFUSE' && !r.appels.length && /guess/.test(r.pourquoi), 'no ETH market on our birth hooks -> REFUSE, nothing offered: ' + r.pourquoi); }
{ const { r } = await plan({ plante: (m, p) => m === 'eth_call' && String(p[0].data).toLowerCase().endsWith(pidMarche7030) }); ok(r.etat === 'NON_MESURE' && !r.appels.length, 'the ETH market read fails -> NON_MESURE, nothing offered'); }
{ const { r } = await plan({ desaccord: true }); ok(r.etat === 'NON_MESURE' && !r.appels.length && /ETH price/.test(r.pourquoi), 'ETH/USD pools disagree -> NON_MESURE: ' + r.pourquoi); }
{ const { r } = await plan({ refAgeS: 3 * 86400 }); ok(r.etat === 'REFUSE' && !r.appels.length && /stale/.test(r.pourquoi), 'a stale Chainlink price on a weekday -> REFUSE: ' + r.pourquoi); }
const sansFeed = ACTIONS_COINBASE.find((a) => plancher7030(a.adr) !== null && !FEEDS_CHAINLINK.get(a.adr.toLowerCase()));
{ const { r } = await plan({}, { devise: sansFeed.adr }); ok(r.etat === 'REFUSE' && !r.appels.length && /reference price/.test(r.pourquoi), sansFeed.symbole + ' (accepted by the hook, no Chainlink feed) -> REFUSE, no guessed price: ' + r.pourquoi); }

/* ── droits, existence, fonds ── */
{ const { r } = await plan({ admin: false }); ok(r.etat === 'REFUSE' && /admin/.test(r.pourquoi), 'not the block admin -> REFUSE'); }
{ const { r } = await plan({ sqrtNouvelle: 123n << 96n }); ok(r.etat === 'REFUSE' && /already open/.test(r.pourquoi), 'pair already open -> REFUSE'); }
{ const { r } = await plan({ inscrit: AUTRE, payee: true, prixInscrit: 5n << 90n }); ok(r.etat === 'REFUSE' && /another admin/.test(r.pourquoi), 'registered by another admin -> REFUSE'); }
{ const { r } = await plan({ soldeDevise: 5000000n }); ok(r.etat === 'REFUSE' && /creator minimum/.test(r.pourquoi), 'not enough AAPLc for deposit + minimum -> REFUSE with the numbers: ' + r.pourquoi); }
{ const { r } = await plan({ soldeUnit: 10n ** 20n }); ok(r.etat === 'REFUSE' && /needs/.test(r.pourquoi), 'not enough blocks to match the deposit -> REFUSE: ' + r.pourquoi); }
{ const { r } = await plan({ soldeEth: 10n ** 14n }); ok(r.etat === 'REFUSE' && /0\.001 ETH/.test(r.pourquoi), 'less than 0.001 ETH -> REFUSE'); }

/* ── LE PLAN ── */
{
  const { r, j } = await plan();
  ok(r.etat === 'APPROBATIONS' && j.inattendus.length === 0, 'full plan: APPROBATIONS (' + r.pourquoi.slice(0, 80) + '…)');
  const noms = r.appels.map((a) => a.nom);
  ok(r.appels.length === 7, '7 calls: 2 Permit2 steps per token, the creator-minimum approval, the paid registration, open+deposit (' + noms.join(' | ') + ')');
  const iIns = r.appels.findIndex((a) => String(a.to).toLowerCase() === H), iTx = r.appels.length - 1;
  const ins = r.appels[iIns];
  ok(iIns >= 0 && iIns < iTx && ins.data.startsWith(S(SIG_INSCRIRE_CAUTION)) && !ins.data.startsWith(S(SIG_INSCRIRE_CAUTION_SEL)), 'registration = inscrireAvecCaution (3 arguments), BEFORE initialize');
  ok(BigInt(ins.value) === FRAIS_OUVERTURE_WEI && r.cout.fraisNaissanceWei === FRAIS_OUVERTURE_WEI, 'registration pays exactly 0.001 ETH (fraisVie + fraisCreation read on the hook)');
  const apMin = r.appels[iIns - 1];
  ok(String(apMin.to).toLowerCase() === AAPL && apMin.data.startsWith(S('approve(address,uint256)')) && apMin.data.slice(10, 74) === adrMot(H) && BigInt('0x' + apMin.data.slice(74)) === plancher7030(AAPL),
    'the creator-minimum approval is to the HOOK, for exactly the minimum ' + plancher7030(AAPL) + ' (max of $1 today and the hook floor)');
  ok(r.cout.caution.montant === plancher7030(AAPL) && BigInt('0x' + ins.data.slice(-64)) === plancher7030(AAPL), 'the minimum in the call = the minimum stated');
  const tx = r.appels[iTx];
  ok(String(tx.to).toLowerCase() === POSM && tx.data.startsWith(S('multicall(bytes[])')) && tx.data.includes(S('initializePool((address,address,uint24,int24,address),uint160)').slice(2) + adrMot(cleN.currency0))
    && tx.data.includes(mot(r.sqrtVise)) && BigInt(tx.value) === 0n, 'last call: PositionManager multicall(initializePool at sqrtVise, mint), no ETH');
  ok(tx.data.includes(adrMot('0x000000000000000000000000000000000000dEaD')), 'the position is minted to 0x…dEaD (permanent, like the birth)');
  ok(r.sqrtVise === p0.sqrtCible, 'initialize price = the market-derived price, to the unit');
  const permit = r.appels.filter((a) => String(a.to).toLowerCase() === PERMIT2.toLowerCase());
  ok(permit.length === 2 && permit.some((a) => /UNIT/.test(a.nom)) && permit.some((a) => /AAPLc/.test(a.nom)), 'each Permit2 step names its token');
  ok(r.appels.filter((a) => a.data.startsWith(S('approve(address,uint256)'))).every((a) => BigInt('0x' + a.data.slice(74)) < (1n << 159n)), 'no unlimited approval');
  ok(Array.isArray(j.simules) && j.simules.length === r.appels.length && j.simules.every((c, i) => c.to === r.appels[i].to && c.data === r.appels[i].data && c.from === COMPTE), 'the WHOLE batch was simulated, in order, from the creator');
  ok(r.cout.depotDevise > 4990000n && r.cout.depotDevise <= 5000000n && r.cout.depotBlock > 0n && r.cout.permanent === true, 'cost states the deposit placed for good: ' + r.cout.depotDevise + ' AAPLc raw + ' + r.cout.depotBlock + ' UNIT raw');
  ok(/0\.001 ETH/.test(r.pourquoi) && /creator minimum/.test(r.pourquoi) && /for good/.test(r.pourquoi) && /UNIT\/ETH, which stays/.test(r.pourquoi) && /gas is extra/.test(r.pourquoi), 'pourquoi says the real cost in plain English, and that UNIT/ETH stays');
}

/* ── la chaine refuserait le lot : rien n est offert ── */
{ const { r } = await plan({ simKo: 4 }); ok(r.etat === 'REFUSE' && !r.appels.length && /refuse/.test(r.pourquoi), 'simulation refuses step 5 -> REFUSE, no call offered: ' + r.pourquoi.slice(0, 90)); }
{ const { r } = await plan({ plante: (m) => m === 'eth_simulateV1' }); ok(r.etat === 'NON_MESURE' && !r.appels.length, 'simulation unavailable -> NON_MESURE, no call offered'); }

/* ── reprise : deja inscrite ET cautionnee par toi (lot coupe en deux) -> on termine AU prix inscrit, sans repayer ── */
{
  const X = p0.sqrtCible * 101n / 100n;
  const { r } = await plan({ payee: true, inscrit: COMPTE, prixInscrit: X, createur: COMPTE });
  ok(r.etat === 'APPROBATIONS' && r.sqrtVise === X && r.prix.repriseInscription === true, 'resume: initialize at the price ALREADY registered on the hook (' + X + '), not a recomputed one');
  ok(!r.appels.some((a) => String(a.to).toLowerCase() === H) && r.appels.every((a) => BigInt(a.value || '0x0') === 0n) && r.cout.fraisNaissanceWei === 0n && r.cout.caution.montant === 0n, 'resume: no second fee, no second minimum (' + r.appels.length + ' calls)');
}

console.log(ko ? 'KO ' + ko + '/' + n : 'ok ajouter-paire - ' + n + ' assertions');
process.exit(ko ? 1 : 0);
