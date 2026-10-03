/* banc-memestock-tiers-fork-20261003.mjs — UN MEMESTOCK TIERS (SI, cote en NVDAc, hook tiers) S ACHETE ET SE VEND PAR NOS
 * RAILS, ET a6cf RECOIT EXACTEMENT UN FRAIS DE 0,5 % EN NVDAc PAR SWAP (decision de Phil, 2026-10-03).
 * ⛔ RIEN N EST SIGNE SUR MAINNET : fork local base-anvil (PORT_FORK, defaut 8548), compte USURPE = la pool Aerodrome
 *   NVDAc/USDC de la table mesuree (detient du NVDAc), jamais a6cf.
 * ⛔ LE FRAIS SE VERIFIE SUR LA TRANSACTION : soldes avant/apres ET logs Transfer du recu, pas sur un evenement isole.
 * Usage : node banc-memestock-tiers-fork-20261003.mjs   (sans fork : NON MESURE, exit 1 — jamais vert par defaut) */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const E = await imp('echange.js');
const M = await imp('marche.js');
const T = await imp('pools-actions-aerodrome.js');
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

/* les faits, lus : la cle de SI (resolue par /api/cle de la prod, 2026-10-03 — Initialize au bloc 51 964 260) */
const SI = '0xb2000000000000000000001eb03f58a18f2add01';
const NV = '0xb20000000000000000000078ee7ce2fe4908108c';
const CLE_SI = { currency0: SI, currency1: NV, fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' };
ok(T.POOLS_ACTIONS_AERODROME.get(NV) && T.POOLS_ACTIONS_AERODROME.get(NV).symbole === 'NVDAc', 'NV est NVDAc dans la table mesuree');
const ACHETEUR = T.POOLS_ACTIONS_AERODROME.get(NV).pool; /* detient du NVDAc ; un contrat, usurpe sur le fork seulement */
const pad = (a) => bas(a).slice(2).padStart(64, '0');
const solde = async (jeton, qui) => BigInt(await appel('eth_call', [{ to: jeton, data: selecteur('balanceOf(address)') + pad(qui) }, 'latest']));
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const transfertsVers = (recu, qui) => recu.logs.filter((l) => l.topics[0] === TOPIC_TRANSFER && bas('0x' + l.topics[2].slice(26)) === bas(qui));
const envoyer = async (tx) => {
  const h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: tx.to, data: tx.data, value: tx.value || '0x0' }]);
  let r = null;
  for (let i = 0; i < 40 && !r; i += 1) { r = await appel('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
await appel('anvil_impersonateAccount', [ACHETEUR]);
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
const marche = await M.vieDuBlock({ rpc, stateView: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71', jeton: SI, clesExactes: [CLE_SI] });
ok(marche.etat === 'LUE' && bas(marche.cle.hooks) === bas(CLE_SI.hooks), 'marche de SI lu sur le fork, sur sa vraie cle (hook tiers)');
const horloge = async () => Number(BigInt((await appel('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000;
const fraisOk = new Set([bas(USDC_BASE), NV]); /* ce que l app met apres avoir LU le prix et la liquidite de NVDAc */
const planifier = async (sens, montant) => {
  for (let tour = 0; tour < 3; tour += 1) {
    const p = await E.planEchange({ rpc, chaine: 8453, jeton: SI, compte: ACHETEUR, sens, montant, marcheLu: marche, fraisDevisesOk: fraisOk, maintenant: await horloge() });
    if (p.etat !== 'APPROBATIONS') return p;
    for (const e of p.etapes) { const r = await envoyer(e); if (!r || r.status !== '0x1') return { etat: 'ECHEC', pourquoi: 'approval ' + e.nom }; }
  }
  return { etat: 'ECHEC', pourquoi: 'approvals loop' };
};

console.log('=== 1. ACHAT : 0,1 NVDAc -> SI ===');
const MONTANT = 10000000n; /* 0,1 NVDAc, 8 decimales */
const av = { nvA: await solde(NV, ACHETEUR), siA: await solde(SI, ACHETEUR), nvF: await solde(NV, FEE_WALLET), siF: await solde(SI, FEE_WALLET),
  ethF: BigInt(await appel('eth_getBalance', [FEE_WALLET, 'latest'])) };
const pA = await planifier('ACHAT', MONTANT);
if (ok(pA.etat === 'PRET', '1. plan PRET (' + pA.etat + ' ' + (pA.pourquoi || '') + ')')) {
  ok(BigInt(pA.resume.fraisBps) === 50n && pA.resume.beneficiaireFrais === FEE_WALLET && BigInt(pA.resume.frais) === MONTANT * 50n / 10000n,
    '1b. resume : 50 bps, vers a6cf, frais = 0,5 % du montant (' + pA.resume.frais + ')');
  const r = await envoyer(pA.tx);
  ok(r && r.status === '0x1', '1c. la transaction passe (status ' + (r && r.status) + ')');
  const ap = { nvA: await solde(NV, ACHETEUR), siA: await solde(SI, ACHETEUR), nvF: await solde(NV, FEE_WALLET), siF: await solde(SI, FEE_WALLET),
    ethF: BigInt(await appel('eth_getBalance', [FEE_WALLET, 'latest'])) };
  console.log('  acheteur NVDAc ' + av.nvA + ' -> ' + ap.nvA + '  SI ' + av.siA + ' -> ' + ap.siA + ' | a6cf NVDAc ' + av.nvF + ' -> ' + ap.nvF);
  ok(av.nvA - ap.nvA === MONTANT, '1d. NVDAc depense = exactement le montant');
  ok(ap.siA - av.siA >= BigInt(pA.resume.recoitAuMoins) && ap.siA > av.siA, '1e. SI recu >= minimum annonce (' + (ap.siA - av.siA) + ')');
  ok(ap.nvF - av.nvF === BigInt(pA.resume.frais), '1f. a6cf NVDAc += le frais exact (' + (ap.nvF - av.nvF) + ')');
  ok(ap.siF === av.siF && ap.ethF === av.ethF, '1g. a6cf ne recoit ni SI ni ETH');
  const vers = transfertsVers(r, FEE_WALLET);
  ok(vers.length === 1 && bas(vers[0].address) === NV, '1h. sur le RECU : un seul Transfer vers a6cf, en NVDAc (' + vers.length + ')');
}

console.log('=== 2. VENTE : la moitie du SI recu -> NVDAc ===');
const siDispo = (await solde(SI, ACHETEUR)) - av.siA;
const aVendre = siDispo / 2n;
const av2 = { nvA: await solde(NV, ACHETEUR), nvF: await solde(NV, FEE_WALLET), siF: await solde(SI, FEE_WALLET) };
const pV = await planifier('VENTE', aVendre);
if (ok(pV.etat === 'PRET' && aVendre > 0n, '2. plan PRET (' + pV.etat + ' ' + (pV.pourquoi || '') + ')')) {
  ok(BigInt(pV.resume.fraisBps) === 50n && pV.resume.beneficiaireFrais === FEE_WALLET, '2b. resume : 50 bps vers a6cf');
  const r = await envoyer(pV.tx);
  ok(r && r.status === '0x1', '2c. la transaction passe (status ' + (r && r.status) + ')');
  const nvRecu = (await solde(NV, ACHETEUR)) - av2.nvA, frais = (await solde(NV, FEE_WALLET)) - av2.nvF;
  console.log('  acheteur recoit ' + nvRecu + ' NVDAc ; a6cf ' + frais + ' NVDAc');
  const brut = nvRecu + frais;
  ok(frais > 0n && frais === brut * 50n / 10000n, '2d. a6cf = exactement 0,5 % de la sortie brute (' + frais + ' / ' + brut + ')');
  ok(nvRecu >= BigInt(pV.resume.recoitAuMoins), '2e. le vendeur recoit au moins le minimum annonce');
  ok((await solde(SI, FEE_WALLET)) === av2.siF, '2f. a6cf ne recoit jamais de SI (le block)');
  const vers = transfertsVers(r, FEE_WALLET);
  ok(vers.length === 1 && bas(vers[0].address) === NV, '2g. sur le RECU : un seul Transfer vers a6cf, en NVDAc (' + vers.length + ')');
}
await appel('anvil_stopImpersonatingAccount', [ACHETEUR]);
fin();
