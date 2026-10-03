/* banc-memestock-tiers-fork-20261003.mjs — LES BLOCKS TIERS COTES DANS UNE DEVISE CONNUE (action Coinbase, USDC, OUSD) SUR
 * UN HOOK TIERS S ACHETENT ET SE VENDENT PAR NOS RAILS, ET a6cf RECOIT EXACTEMENT UN FRAIS DE 0,5 % DANS LA DEVISE PAR SWAP
 * (decision de Phil, 2026-10-03 : 0,5 %, un seul frais, « l appliquer de partout »).
 * Cas (cles resolues par /api/cle de la prod le 2026-10-03, hooks TIERS) :
 *   SI / NVDAc (hook 0x1f91…2acc)  ·  COBALT / USDC (hook 0x1f91…2acc)  ·  OCTO / OUSD (hook 0x84bb…2088, LP 1 %)
 * ⛔ RIEN N EST SIGNE SUR MAINNET : fork local base-anvil (PORT_FORK, defaut 8548). L acheteur est un compte VIDE
 *   (0x1111…1111) finance par un transfert USURPE depuis le PoolManager v4 (qui detient les reserves) — jamais a6cf.
 * ⛔ LE FRAIS SE VERIFIE SUR LA TRANSACTION : soldes avant/apres ET logs Transfer du recu, pas sur un evenement isole.
 * Usage : node banc-memestock-tiers-fork-20261003.mjs   (sans fork : NON MESURE, exit 1 — jamais vert par defaut) */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const E = await imp('echange.js');
const M = await imp('marche.js');
const P = await imp('paires.js');
const { selecteur } = await imp('keccak.js');
const { FEE_WALLET, USDC_BASE } = await imp('frais-creation.js');
const URL_FORK = 'http://127.0.0.1:' + (process.env.PORT_FORK || '8548');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return !!c; };
const bas = (a) => String(a || '').toLowerCase();
let id = 0;
const appel = async (method, params) => {
  const j = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (j.error) throw new Error(j.error.message);
  return j.result;
};
const rpc = appel;
const fin = () => { console.log(n + ' assertions, ' + ko + ' KO'); process.exitCode = ko ? 1 : 0; };
try { await appel('eth_blockNumber', []); } catch (e) { ok(false, 'NON MESURE : aucun fork Base sur ' + URL_FORK + ' (base-anvil --base)'); fin(); process.exit(); }

/* ⛔ R10 (pool-sans-hook.js) : un B20 n est libere que si les sources TB sont LUES. Le banc les charge depuis la PROD (lecture
 *   seule, les memes routes que l app : /api/blocks-routeur et /api/nos-blocks) ; sources non lues = tout le banc est NON MESURE. */
const IR = await imp('index-routeur.js');
{
  const lire = async (chemin) => fetch('https://tokenizedblock.space' + chemin, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(60000) }).then((x) => x.json());
  let r1 = null, r2 = null;
  try { r1 = await lire('/api/blocks-routeur'); r2 = await lire('/api/nos-blocks'); } catch (e) { console.log('sources TB illisibles : ' + e.message); }
  if (r1) IR.chargerIndexRouteur(r1); if (r2) IR.chargerNosBlocksTb(r2);
  if (!ok(IR.sourcesTbLues() === true, 'sources TB lues depuis la prod (routeur ' + JSON.stringify(IR.etatIndexRouteur()).slice(0, 120) + ')')) { fin(); process.exit(); }
}
const PM = '0x498581fF718922c3f8e6A244956aF099B2652b2b'; /* PoolManager v4 : detient les reserves, usurpe pour FINANCER seulement */
const ACHETEUR = '0x' + '1'.repeat(40);
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const NV = bas(P.ACTIONS_COINBASE.find((x) => x.symbole === 'NVDAc').adr);
const OUSD = bas(P.DEVISES_BASE.find((x) => x.symbole === 'OUSD').adr);
const USDC = bas(USDC_BASE);
const H1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
const CAS = [
  { nom: 'SI / NVDAc', block: '0xb2000000000000000000001eb03f58a18f2add01', devise: NV, sym: 'NVDAc', montant: 10000000n,
    cle: { currency0: '0xb2000000000000000000001eb03f58a18f2add01', currency1: NV, fee: 0, tickSpacing: 200, hooks: H1 } },
  { nom: 'COBALT / USDC', block: '0xb2000000000000000000001e64366bcdf40ca001', devise: USDC, sym: 'USDC', montant: 1000000n,
    cle: { currency0: USDC, currency1: '0xb2000000000000000000001e64366bcdf40ca001', fee: 0, tickSpacing: 200, hooks: H1 } },
  /* FIRSTOUSD : Initialize au bloc 52 004 8xx (scan mainnet currency0 = OUSD), AVANT le bloc du fork (52 024 517) ; OCTO (prod,
   * meme hook) est ne apres le fork et n y existe pas — un block absent du fork n est pas un refus de la regle. */
  { nom: 'FIRSTOUSD / OUSD', block: '0xb2000000000000000000005bc17d64a375272b20', devise: OUSD, sym: 'OUSD', montant: 1000000n,
    cle: { currency0: OUSD, currency1: '0xb2000000000000000000005bc17d64a375272b20', fee: 10000, tickSpacing: 200, hooks: '0x84bbab8cac69bf6711ba81f9915dc346f4cf2088' } },
];
/* R10 (Phil, 2026-10-03) : un block tiers cote en ETH sur un PETIT hook tiers (COFFR, hook 0x6b8f…60cc, 4 166 o, LP 1 %, ne au
 * bloc 51 917 954 — avant le fork) : notre 0,5 % en ETH par le routeur. ETH : solde par eth_getBalance, value dans la tx. */
const ETH = '0x0000000000000000000000000000000000000000';
CAS.push({ nom: 'COFFR / ETH', block: '0xb200000000000000000000b1c85db99d1de6ef2a', devise: ETH, sym: 'ETH', montant: 10n ** 15n,
  cle: { currency0: ETH, currency1: '0xb200000000000000000000b1c85db99d1de6ef2a', fee: 10000, tickSpacing: 200, hooks: '0x6b8f68cb3fb799c72d14de7d45332d8a65df60cc' } });
const pad = (a) => bas(a).slice(2).padStart(64, '0');
const solde = async (jeton, qui) => (bas(jeton) === ETH ? BigInt(await appel('eth_getBalance', [qui, 'latest']))
  : BigInt(await appel('eth_call', [{ to: jeton, data: selecteur('balanceOf(address)') + pad(qui) }, 'latest'])));
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const transfertsVers = (recu, qui) => recu.logs.filter((l) => l.topics[0] === TOPIC_TRANSFER && bas('0x' + l.topics[2].slice(26)) === bas(qui));
const envoyer = async (de, tx) => {
  const h = await appel('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data, value: tx.value || '0x0' }]);
  let r = null;
  for (let i = 0; i < 40 && !r; i += 1) { r = await appel('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const horloge = async () => Number(BigInt((await appel('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000;
const fraisOk = new Set([USDC, NV, OUSD]); /* ce que l app met apres avoir LU prix + liquidite de ces devises */
const encoderTransfer = (a, m) => selecteur('transfer(address,uint256)') + pad(a) + m.toString(16).padStart(64, '0');
await appel('anvil_impersonateAccount', [PM]);
await appel('anvil_impersonateAccount', [ACHETEUR]);
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
await appel('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);

for (const c of CAS) {
  console.log('=== ' + c.nom + ' ===');
  const enEth = bas(c.devise) === ETH;
  const gaz = (r) => (r && enEth ? BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice) : 0n);
  if (!enEth) {
    const rF = await envoyer(PM, { to: c.devise, data: encoderTransfer(ACHETEUR, c.montant * 10n) });
    if (!ok(rF && rF.status === '0x1' && (await solde(c.devise, ACHETEUR)) >= c.montant * 10n, c.nom + ' : acheteur finance en ' + c.sym + ' depuis le PoolManager (fork)')) continue;
  }
  const marche = await M.vieDuBlock({ rpc, stateView: SV, jeton: c.block, clesExactes: [c.cle] });
  if (!ok(marche.etat === 'LUE' && bas(marche.cle.hooks) === bas(c.cle.hooks), c.nom + ' : marche lu sur sa vraie cle, hook tiers (' + marche.etat + ' ' + (marche.pourquoi || '') + ')')) continue;
  /* le gaz des APPROBATIONS (vente : Permit2 sur le block, puis le routeur) sort aussi du solde ETH du vendeur : compte a part */
  let gazApprobations = 0n;
  const planifier = async (sens, montant) => {
    gazApprobations = 0n;
    for (let tour = 0; tour < 3; tour += 1) {
      const p = await E.planEchange({ rpc, chaine: 8453, jeton: c.block, compte: ACHETEUR, sens, montant, marcheLu: marche, fraisDevisesOk: fraisOk, maintenant: await horloge() });
      if (p.etat !== 'APPROBATIONS') return p;
      for (const e of p.etapes) { const r = await envoyer(ACHETEUR, e); if (!r || r.status !== '0x1') return { etat: 'ECHEC', pourquoi: 'approval ' + e.nom }; gazApprobations += gaz(r); }
    }
    return { etat: 'ECHEC', pourquoi: 'approvals loop' };
  };
  /* 1. ACHAT */
  const av = { dA: await solde(c.devise, ACHETEUR), bA: await solde(c.block, ACHETEUR), dF: await solde(c.devise, FEE_WALLET), bF: await solde(c.block, FEE_WALLET),
    ethF: BigInt(await appel('eth_getBalance', [FEE_WALLET, 'latest'])) };
  const pA = await planifier('ACHAT', c.montant);
  if (ok(pA.etat === 'PRET', '1. achat : plan PRET (' + pA.etat + ' ' + (pA.pourquoi || '') + ')')) {
    ok(BigInt(pA.resume.fraisBps) === 50n && pA.resume.beneficiaireFrais === FEE_WALLET && BigInt(pA.resume.frais) === c.montant * 50n / 10000n,
      '1b. resume : 50 bps, vers a6cf, frais = 0,5 % du montant (' + pA.resume.frais + ' ' + c.sym + ')');
    const r = await envoyer(ACHETEUR, pA.tx);
    ok(r && r.status === '0x1', '1c. la transaction passe (status ' + (r && r.status) + ')');
    const ap = { dA: await solde(c.devise, ACHETEUR), bA: await solde(c.block, ACHETEUR), dF: await solde(c.devise, FEE_WALLET), bF: await solde(c.block, FEE_WALLET),
      ethF: BigInt(await appel('eth_getBalance', [FEE_WALLET, 'latest'])) };
    console.log('  acheteur ' + c.sym + ' ' + av.dA + ' -> ' + ap.dA + '  block ' + av.bA + ' -> ' + ap.bA + ' | a6cf ' + c.sym + ' ' + av.dF + ' -> ' + ap.dF);
    ok(av.dA - ap.dA === c.montant + gaz(r), '1d. ' + c.sym + ' depense = exactement le montant' + (enEth ? ' + le gaz' : ''));
    ok(ap.bA - av.bA >= BigInt(pA.resume.recoitAuMoins) && ap.bA > av.bA, '1e. block recu >= minimum annonce (' + (ap.bA - av.bA) + ')');
    ok(ap.dF - av.dF === BigInt(pA.resume.frais), '1f. a6cf ' + c.sym + ' += le frais exact (' + (ap.dF - av.dF) + ')');
    ok(ap.bF === av.bF && (enEth || ap.ethF === av.ethF), '1g. a6cf ne recoit pas le block' + (enEth ? '' : ' ni de l ETH'));
    const vers = r ? transfertsVers(r, FEE_WALLET) : [];
    ok(enEth ? vers.length === 0 : (vers.length === 1 && bas(vers[0].address) === c.devise),
      '1h. sur le RECU : ' + (enEth ? 'aucun Transfer ERC-20 vers a6cf (le frais est en ETH natif, 1f)' : 'un seul Transfer vers a6cf, en ' + c.sym) + ' (' + vers.length + ')');
  }
  /* 2. VENTE de la moitie */
  const aVendre = ((await solde(c.block, ACHETEUR)) - av.bA) / 2n;
  const av2 = { dA: await solde(c.devise, ACHETEUR), dF: await solde(c.devise, FEE_WALLET), bF: await solde(c.block, FEE_WALLET) };
  const pV = await planifier('VENTE', aVendre);
  if (ok(pV.etat === 'PRET' && aVendre > 0n, '2. vente : plan PRET (' + pV.etat + ' ' + (pV.pourquoi || '') + ')')) {
    ok(BigInt(pV.resume.fraisBps) === 50n && pV.resume.beneficiaireFrais === FEE_WALLET, '2b. resume : 50 bps vers a6cf');
    const r = await envoyer(ACHETEUR, pV.tx);
    ok(r && r.status === '0x1', '2c. la transaction passe (status ' + (r && r.status) + ')');
    const recu = (await solde(c.devise, ACHETEUR)) - av2.dA + gaz(r) + gazApprobations, frais = (await solde(c.devise, FEE_WALLET)) - av2.dF;
    console.log('  vendeur recoit ' + recu + ' ' + c.sym + ' ; a6cf ' + frais + ' ' + c.sym);
    const brut = recu + frais;
    ok(frais > 0n && frais === brut * 50n / 10000n, '2d. a6cf = exactement 0,5 % de la sortie brute (' + frais + ' / ' + brut + ')');
    ok(recu >= BigInt(pV.resume.recoitAuMoins), '2e. le vendeur recoit au moins le minimum annonce');
    ok((await solde(c.block, FEE_WALLET)) === av2.bF, '2f. a6cf ne recoit jamais le block');
    const vers = r ? transfertsVers(r, FEE_WALLET) : [];
    ok(enEth ? vers.length === 0 : (vers.length === 1 && bas(vers[0].address) === c.devise),
      '2g. sur le RECU : ' + (enEth ? 'aucun Transfer ERC-20 vers a6cf (frais en ETH natif, 2d)' : 'un seul Transfer vers a6cf, en ' + c.sym) + ' (' + vers.length + ')');
  }
}
/* 3. TEMOIN : une devise de cotation INCONNUE (ni devise de base, ni action) reste refusee, hook tiers ou pas */
{
  const inconnue = '0x' + '7'.repeat(40), bloc = '0xb200000000000000000000' + '9'.repeat(18);
  const cle = { currency0: inconnue, currency1: bloc, fee: 0, tickSpacing: 200, hooks: H1 };
  const p = await E.planEchange({ rpc, chaine: 8453, jeton: bloc, compte: ACHETEUR, sens: 'ACHAT', montant: 10n ** 6n,
    marcheLu: { etat: 'LUE', cle, paire: null, decimales: 18 }, fraisDevisesOk: fraisOk, maintenant: await horloge() });
  ok(p.etat === 'REFUSE' && /not a TokenizedBlock market/.test(p.pourquoi), '3. TEMOIN : cotation inconnue sur hook tiers -> refuse (' + p.etat + ' ' + (p.pourquoi || '') + ')');
}
await appel('anvil_stopImpersonatingAccount', [ACHETEUR]);
await appel('anvil_stopImpersonatingAccount', [PM]);
fin();
