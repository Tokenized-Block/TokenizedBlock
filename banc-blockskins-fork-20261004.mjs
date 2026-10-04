/* banc-blockskins-fork-20261004.mjs — LE CONTRAT BlockSkins DEPLOYE SUR UN FORK DE BASE, CONTRE LES VRAIS JETONS.
 *
 * POURQUOI. Les tests Foundry (contracts/test/BlockSkins.t.sol) tournent contre des jetons d essai. Trois choses ne s y voient pas :
 *   1. le VRAI USDC de Base (proxy, 6 decimales) accepte-t-il nos appels bas niveau (transferFrom / transfer / balanceOf) ?
 *   2. une VRAIE action tokenisee B20 (jeton natif, adresse 0xb2…) passe-t-elle le controle `code.length != 0` et le controle
 *      « recu == demande » ? — Foundry ne sait pas executer un B20 (OpcodeNotFound hors base-anvil) ;
 *   3. le VRAI wallet des frais est un smart wallet : recoit-il l ETH dans les 50 000 gaz que le contrat lui donne, ou est-il
 *      credite (retrait a faire) ?
 * CE QUE LE BANC FAIT : deploie le bytecode compile par forge (contracts/out) depuis un compte impersonne, puis joue un mint, une
 *   vente en ETH, une vente validee en USDC executee par un agent, une enchere en action tokenisee. Tout se juge sur les SOLDES
 *   lus avant/apres et le status des recus, jamais sur un evenement.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle) — ne prouve ni un vrai wallet, ni l interface, ni le deploiement
 *   reel (que seul Phil signe). Les jetons d essai sont pris a des pools du fork par transfert impersonne.
 * Usage : (cd contracts && forge build) ; base-anvil --fork-url <rpc Base> --port 8549 ; node banc-blockskins-fork-20261004.mjs */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const brut = async (method, params) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase(), ETH = '0x0000000000000000000000000000000000000000';
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lire = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const lireU = async (to, sig, args = '') => BigInt(await lire(to, sig, args));
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : lireU(jeton, 'balanceOf(address)', adrMot(qui)));
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* reverterait : on l envoie pour LIRE le status 0 */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', value: tx.value || '0x0', gas: hex(gas) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status, contrat: r.contractAddress, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0'), gasUsed: BigInt(r.gasUsed) }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const compteNeuf = async (graine) => {
  const a = '0x' + (graine + String(Date.now())).replace(/[^0-9a-f]/g, 'a').padEnd(40, 'd').slice(0, 40);
  await rpc('anvil_impersonateAccount', [a]);
  await rpc('anvil_setBalance', [a, hex(10n ** 18n)]);
  return a;
};
const donner = async (jeton, source, a, montant) => {
  await rpc('anvil_impersonateAccount', [source]);
  await rpc('anvil_setBalance', [source, hex(10n ** 18n)]);
  return envoyer(source, { to: jeton, data: selecteur('transfer(address,uint256)') + adrMot(a) + mot(montant) });
};

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);
const artefact = JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out/BlockSkins.sol/BlockSkins.json'), 'utf8'));
/* ⛔ CE QUI EST DEPLOYE ICI EST CE QUE PHIL SIGNERA : la donnee figee dans blockskins-deploiement.js (generee par
 *   contracts/preparer-deploiement-blockskins.mjs), pas un bytecode recompose a cote. On verifie qu elle est bien le bytecode compile
 *   + les deux arguments du depot, et que son empreinte est celle qu elle annonce. */
const { BLOCKSKINS_DEPLOIEMENT: DEP } = await import('./blockskins-deploiement.js');
const creation = DEP.creation;
ok(creation === String(artefact.bytecode.object) + adrMot(USDC) + adrMot(FRAIS), 'la donnee de deploiement figee = le bytecode compile + (USDC, wallet des frais) du depot');
ok(crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex') === DEP.sha256Creation && DEP.adresse === null,
  'son empreinte sha256 est celle qu elle annonce (' + DEP.sha256Creation.slice(0, 12) + '…) ; aucune adresse deployee n est declaree');
const table = [...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => ({ adr: adr.toLowerCase(), ...t }));
const NV = table.find((t) => t.symbole === 'NVDAc'), AUTRE = table.find((t) => t.symbole !== 'NVDAc');
const codeFrais = await rpc('eth_getCode', [FRAIS, 'latest']), codeAction = await rpc('eth_getCode', [NV.adr, 'latest']);
console.log('wallet des frais : ' + (codeFrais.length > 2 ? 'un CONTRAT (' + (codeFrais.length - 2) / 2 + ' octets de code)' : 'un compte simple') + ' · ' + NV.symbole + ' : ' + (codeAction.length - 2) / 2 + ' octet(s) de code (' + codeAction.slice(0, 12) + '…)');

const instantane = await rpc('evm_snapshot', []);
try {
  const phil = await compteNeuf('de9107e4'), alice = await compteNeuf('a11ce'), bob = await compteNeuf('b0b'), carol = await compteNeuf('ca401'), agent = await compteNeuf('a6e47');
  /* ── deploiement ── */
  const d = await envoyer(phil, { data: creation });
  if (!ok(d.status === '0x1' && /^0x[0-9a-f]{40}$/i.test(String(d.contrat)), 'le contrat se deploie (gaz ' + d.gasUsed + ')')) throw new Error('deploy failed');
  const S = d.contrat.toLowerCase();
  const taille = ((await rpc('eth_getCode', [S, 'latest'])).length - 2) / 2;
  ok(taille > 0 && taille <= 24576, 'code deploye : ' + taille + ' octets (limite EIP-170 : 24 576)');
  ok(('0x' + (await lire(S, 'USDC()')).slice(-40)) === USDC && ('0x' + (await lire(S, 'FEE_WALLET()')).slice(-40)) === FRAIS && ('0x' + (await lire(S, 'owner()')).slice(-40)) === phil,
    'il lit le vrai USDC, le wallet des frais du depot, et son owner est le deployeur');
  for (const a of [alice, bob, carol]) await donner(USDC, AUTRE.pool, a, 60n * 10n ** 6n);
  const approuver = (qui, jeton, montant) => envoyer(qui, { to: jeton, data: selecteur('approve(address,uint256)') + adrMot(S) + mot(montant) });
  /* la recette passe par packRecipe DU CONTRAT (aucun empaquetage recopie ici) */
  const teintes = [210, 267, 263, 92, 120, 300, 200];
  const recette = BigInt(await lire(S, 'packRecipe(uint16[7])', teintes.map(mot).join('')));
  const mint = (qui) => envoyer(qui, { to: S, data: selecteur('mint(address,uint64)') + adrMot(NV.adr) + mot(recette) });

  /* ── 1. MINT : 1 USDC au wallet des frais ── */
  console.log('— mint');
  let fA = await solde(USDC, FRAIS), aA = await solde(USDC, alice);
  await approuver(alice, USDC, 2n * 10n ** 6n);
  const m1 = await mint(alice), m2 = await mint(alice);
  ok(m1.status === '0x1' && m2.status === '0x1', 'deux mints confirmes (gaz ' + m1.gasUsed + ')');
  ok(await solde(USDC, FRAIS) - fA === 2000000n && aA - await solde(USDC, alice) === 2000000n && await solde(USDC, S) === 0n,
    'le wallet des frais recoit EXACTEMENT 1 USDC par mint (vrai USDC), l acheteur en perd autant, le contrat ne garde rien');
  ok(('0x' + (await lire(S, 'ownerOf(uint256)', mot(1))).slice(-40)) === alice, 'le NFT n°1 est a l acheteur');
  const sansSou = await compteNeuf('5a55');
  const m0 = await mint(sansSou);
  ok(m0.status === '0x0' && await lireU(S, 'totalSupply()') === 2n, 'temoin : sans USDC ni autorisation, le mint REVERTE et rien n est cree');

  /* ── 2. VENTE EN ETH : 10 % au wallet des frais, DIRECTEMENT ── */
  console.log('— vente a prix fixe en ETH');
  const PRIX = 10n ** 16n;
  await envoyer(alice, { to: S, data: selecteur('list(uint256,address,uint256)') + mot(1) + adrMot(ETH) + mot(PRIX) });
  fA = await solde(ETH, FRAIS); aA = await solde(ETH, alice);
  const b1 = await envoyer(bob, { to: S, data: selecteur('buy(uint256)') + mot(1), value: hex(PRIX) });
  ok(b1.status === '0x1' && ('0x' + (await lire(S, 'ownerOf(uint256)', mot(1))).slice(-40)) === bob, 'achat confirme : le NFT est a l acheteur');
  const credite = await lireU(S, 'pending(address,address)', adrMot(ETH) + adrMot(FRAIS));
  ok(await solde(ETH, FRAIS) - fA === PRIX / 10n && credite === 0n, 'le wallet des frais (smart wallet) recoit 10 % en ETH DIRECTEMENT, dans les 50 000 gaz donnes — rien n est mis en attente (credite : ' + credite + ')');
  ok(await solde(ETH, alice) - aA === PRIX - PRIX / 10n && await solde(ETH, S) === 0n, 'la vendeuse recoit 90 %, le contrat ne garde rien');

  /* ── 3. LES DEUX COCHENT, UN AGENT EXECUTE (USDC) ── */
  console.log('— vente validee, executee par un agent');
  const PU = 20n * 10n ** 6n;
  await envoyer(alice, { to: S, data: selecteur('list(uint256,address,uint256)') + mot(2) + adrMot(USDC) + mot(PU) });
  await approuver(carol, USDC, PU);
  const v1 = await envoyer(carol, { to: S, data: selecteur('validateBuy(uint256)') + mot(2) });
  fA = await solde(USDC, FRAIS); aA = await solde(USDC, alice); const gA = await solde(USDC, agent);
  const x1 = await envoyer(agent, { to: S, data: selecteur('executeValidated(uint256,address)') + mot(2) + adrMot(carol) });
  ok(v1.status === '0x1' && x1.status === '0x1' && ('0x' + (await lire(S, 'ownerOf(uint256)', mot(2))).slice(-40)) === carol, 'l agent execute : le NFT va a l acheteuse qui avait valide');
  ok(await solde(USDC, FRAIS) - fA === PU / 10n && await solde(USDC, alice) - aA === PU - PU / 10n && await solde(USDC, agent) === gA && await solde(USDC, S) === 0n,
    '10 % au wallet des frais, 90 % a la vendeuse, RIEN a l agent, rien dans le contrat (vrai USDC)');
  const x2 = await envoyer(agent, { to: S, data: selecteur('executeValidated(uint256,address)') + mot(1) + adrMot(carol) });
  ok(x2.status === '0x0', 'temoin : sans mise en vente ni validation, l agent ne peut rien executer (revert)');

  /* ── 4. ENCHERE EN ACTION TOKENISEE (vrai B20) ── */
  console.log('— enchere en ' + NV.symbole);
  const refus = await envoyer(carol, { to: S, data: selecteur('startAuction(uint256,address,uint256,uint256)') + mot(2) + adrMot(NV.adr) + mot(1000) + mot(3600) });
  ok(refus.status === '0x0', 'temoin : tant que l owner n a pas admis ' + NV.symbole + ', une enchere dans cette devise REVERTE');
  const adm = await envoyer(phil, { to: S, data: selecteur('setCurrency(address,bool)') + adrMot(NV.adr) + mot(1) });
  const horsOwner = await envoyer(bob, { to: S, data: selecteur('setCurrency(address,bool)') + adrMot(AUTRE.adr) + mot(1) });
  ok(adm.status === '0x1' && horsOwner.status === '0x0', 'seul l owner admet une devise');
  const MISE1 = 100000n, MISE2 = 105000n; /* 8 decimales : 0,001 et 0,00105 action */
  await donner(NV.adr, NV.pool, alice, MISE1); await donner(NV.adr, NV.pool, bob, MISE2);
  ok(await solde(NV.adr, alice) === MISE1 && await solde(NV.adr, bob) === MISE2, 'les deux encherisseurs detiennent du vrai ' + NV.symbole);
  const sa = await envoyer(carol, { to: S, data: selecteur('startAuction(uint256,address,uint256,uint256)') + mot(2) + adrMot(NV.adr) + mot(1000) + mot(3600) });
  await approuver(alice, NV.adr, MISE1); await approuver(bob, NV.adr, MISE2);
  const e1 = await envoyer(alice, { to: S, data: selecteur('bid(uint256,uint256)') + mot(2) + mot(MISE1) });
  ok(sa.status === '0x1' && e1.status === '0x1' && await solde(NV.adr, S) === MISE1, 'une enchere en ' + NV.symbole + ' passe : le B20 franchit `code.length != 0` et « recu == demande » (le contrat tient ' + MISE1 + ')');
  const trop = await envoyer(bob, { to: S, data: selecteur('bid(uint256,uint256)') + mot(2) + mot(MISE1 + 1n) });
  const e2 = await envoyer(bob, { to: S, data: selecteur('bid(uint256,uint256)') + mot(2) + mot(MISE2) });
  ok(trop.status === '0x0' && e2.status === '0x1', 'une surenchere de moins de 5 % REVERTE ; a +5 % elle passe');
  const tot = await envoyer(agent, { to: S, data: selecteur('settle(uint256)') + mot(2) });
  ok(tot.status === '0x0', 'temoin : regler avant la fin REVERTE');
  await rpc('evm_increaseTime', [3601]); await rpc('evm_mine', []);
  fA = await solde(NV.adr, FRAIS); const cA = await solde(NV.adr, carol);
  const reg = await envoyer(agent, { to: S, data: selecteur('settle(uint256)') + mot(2) });
  ok(reg.status === '0x1' && ('0x' + (await lire(S, 'ownerOf(uint256)', mot(2))).slice(-40)) === bob, 'apres la fin, n importe qui regle : le NFT va au meilleur encherisseur');
  ok(await solde(NV.adr, FRAIS) - fA === MISE2 / 10n && await solde(NV.adr, carol) - cA === MISE2 - MISE2 / 10n, 'le wallet des frais recoit 10 % EN ' + NV.symbole + ' (' + (MISE2 / 10n) + '), la vendeuse 90 %');
  const r1 = await envoyer(alice, { to: S, data: selecteur('withdraw(address)') + adrMot(NV.adr) });
  ok(r1.status === '0x1' && await solde(NV.adr, alice) === MISE1 && await solde(NV.adr, S) === 0n, 'l encherisseuse depassee retire sa mise en entier ; le contrat ne tient plus rien');

  /* ── 5. la lecture unique de l app ── */
  const uri = await lire(S, 'tokenURI(uint256)', mot(1));
  const texte = Buffer.from(uri.slice(2 + 128, 2 + 128 + Number(BigInt('0x' + uri.slice(66, 130))) * 2), 'hex').toString('utf8');
  let meta = null; try { meta = JSON.parse(texte.replace(/^data:application\/json;utf8,/, '')); } catch (_) { meta = null; }
  ok(!!meta && meta.block === NV.adr && JSON.stringify(meta.hues) === JSON.stringify(teintes), 'tokenURI est un JSON lisible : le block habille et ses sept teintes (' + (meta ? meta.hues.join(',') : 'illisible') + ')');
  const page = await lire(S, 'skinsPage(uint256,uint256)', mot(1) + mot(10));
  ok(Number(BigInt('0x' + page.slice(66, 130))) === 2, 'skinsPage rend les 2 skins en une lecture');
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
