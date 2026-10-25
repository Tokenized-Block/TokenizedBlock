/* banc-liquidite-actions-fork-20261025.mjs — LA ROUTE NEUVE (routeur 0x9ee3…d418, factory 0x9cb2…7a76) PROUVEE SUR FORK : 10 USDC achetes
 * puis TOUT revendu, par les octets de liquidite-actions.js, sur chaque action dont le lieu 'aero-new' a une pool cotee.
 *
 * FORK SEULEMENT : FORK_URL (defaut http://127.0.0.1:8631) doit etre un anvil BASE :
 *   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/anvil --base --fork-url https://base-rpc.publicnode.com --chain-id 8453 --port 8631
 *   (un anvil ordinaire n execute pas les B20). Le banc REFUSE de tourner sans `anvil_nodeInfo.forkConfig`. Impersonation et
 *   anvil_setBalance sur le fork uniquement ; eth_sendTransaction depuis des comptes impersonnes — rien n est signe.
 * Entree : MESURE (defaut mesures/liquidite-actions-20261025.json). Sortie : mesures/liquidite-actions-fork-20261025.json.
 * Pour chaque action : devis du quoter patche AU BLOC DU FORK -> approve exact -> multicall ; on lit la sortie de la POOL (Transfer
 *   pool -> routeur), le recu du testeur, le frais recu, et l input EXECUTE (= octets du module) ; puis la vente de tout ce qui a ete recu. */
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
import { ROUTEUR_AERO_NOUVEAU, FACTORY_AERO_NOUVELLE, codeQuoteurNouvelle, overrideQuoteur, calldataEchangeNouvelle, calldataApproveNouvelle,
  dataDevisCL, jugerPool, REGLES } from './liquidite-actions.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur, topic } from './keccak.js';

const FORK = process.env.FORK_URL || 'http://127.0.0.1:8631';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b'; /* PoolManager v4 (lancer-pool.js) : la source des USDC sur le fork */
const TESTEUR = '0x1000000000000000000000000000000000000c0c';
const T_TRANSFER = topic('Transfer(address,address,uint256)');
const mesure = JSON.parse(fs.readFileSync(process.env.MESURE || 'mesures/liquidite-actions-20261025.json', 'utf8'));

let id = 1;
async function rpc(method, params = []) {
  const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; } return j.result;
}
const w = (a) => a.toLowerCase().slice(2).padStart(64, '0'), n = (x) => BigInt(x).toString(16).padStart(64, '0');
const mot = (h, i = 0) => BigInt('0x' + h.slice(2 + 64 * i, 66 + 64 * i));
const solde = async (t, a) => mot(await rpc('eth_call', [{ to: t, data: selecteur('balanceOf(address)') + w(a) }, 'latest']));
async function envoyer(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, to, data, value: '0x0', gas: '0x1e8480' }]);
  let r = null;
  for (let i = 0; i < 60 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((ok) => setTimeout(ok, 250)); }
  assert.ok(r, 'no receipt for ' + h);
  return { h, r };
}

const info = await rpc('anvil_nodeInfo').catch(() => null);
assert.ok(info && info.forkConfig, 'not an anvil fork: refusing to run');
assert.equal(await rpc('eth_chainId'), '0x2105');
const blocFork = parseInt(await rpc('eth_blockNumber'), 16);
assert.equal(await rpc('eth_getCode', [TESTEUR, 'latest']), '0x');
const codeQ = codeQuoteurNouvelle(await rpc('eth_getCode', [QUOTEUR_AERODROME_CL, 'latest']));
assert.ok(codeQ, 'the quoter code no longer has the measured shape');
const ov = overrideQuoteur(codeQ);
const factoryLue = '0x' + (await rpc('eth_call', [{ to: ROUTEUR_AERO_NOUVEAU, data: selecteur('factory()') }, 'latest'])).slice(26);
assert.equal(factoryLue, FACTORY_AERO_NOUVELLE, 'the router does not declare the newer factory');
for (const a of [PM, TESTEUR]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }
assert.ok((await solde(USDC, PM)) >= 1_000_000_000n, 'the USDC source holds less than 1000 USDC on this fork');
await envoyer(PM, USDC, selecteur('transfer(address,uint256)') + w(TESTEUR) + n(1000_000_000n));
const devis = async (tin, tout, montant, ts) => mot(await rpc('eth_call', [{ to: QUOTEUR_AERODROME_CL, data: dataDevisCL({ tokenIn: tin, tokenOut: tout, montant, tickSpacing: ts }) }, 'latest', ov]));
const slot0 = async (pool) => mot(await rpc('eth_call', [{ to: pool, data: selecteur('slot0()') }, 'latest']));

const SEULS = process.env.SYMS ? new Set(process.env.SYMS.split(',')) : null; /* rejouer quelques actions (une erreur 429 du noeud amont) */
const cibles = mesure.lignes.filter((l) => !SEULS || SEULS.has(l.sym)).map((l) => ({ l, v: l.venues.find((x) => x.venue === 'aero-new') })).filter((x) => x.v && x.v.pool && x.v.achat);
const resultats = [];
for (const { l, v } of cibles) {
  const a = l.adr, ts = v.tickSpacing, pool = v.pool;
  const ligne = { sym: l.sym, adr: a, pool, tickSpacing: ts, verdictMesure: { passe: v.passe, code: v.code } };
  try {
    const usdcPool = await solde(USDC, pool);
    const qAchat = await devis(USDC, a, 10_000_000n, ts);
    const sq = await slot0(pool), usdcEst0 = BigInt(USDC) < BigInt(a);
    const mid = usdcEst0 ? (10_000_000n * sq * sq) / (1n << 192n) : (10_000_000n * (1n << 192n)) / (sq * sq);
    const qVenteMemeEtat = await devis(a, USDC, qAchat, ts);
    const pFork = { usdcPool, achat: qAchat, ecartBps: Number(((mid - qAchat) * 10000n) / mid), venteMemeEtat: qVenteMemeEtat,
      perteBps: Number(((10_000_000n - qVenteMemeEtat) * 10000n) / 10_000_000n) };
    const jf = jugerPool(pFork, REGLES);
    Object.assign(ligne, { usdcPool: String(usdcPool), devisAchat: String(qAchat), ecartBps: pFork.ecartBps, perteMemeEtatBps: pFork.perteBps, reglesAuFork: jf });
    const bt = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
    const ap = calldataApproveNouvelle({ token: USDC, montant: 10_000_000n });
    assert.equal(ap.etat, 'PRET');
    await envoyer(TESTEUR, ap.to, ap.data);
    const achat = calldataEchangeNouvelle({ tokenIn: USDC, tokenOut: a, tickSpacing: ts, recipient: TESTEUR, amountIn: 10_000_000n,
      amountOutMinimum: (qAchat * 99n) / 100n, deadline: bt + 600, maintenant: bt, beneficiaireFrais: FEE_WALLET });
    assert.equal(achat.etat, 'PRET', achat.pourquoi);
    const avantJ = await solde(a, TESTEUR), avantF = await solde(a, FEE_WALLET), avantU = await solde(USDC, TESTEUR);
    const { h: hA, r: rA } = await envoyer(TESTEUR, achat.to, achat.data);
    const txA = await rpc('eth_getTransactionByHash', [hA]);
    ligne.achatStatus = rA.status; ligne.achatGaz = parseInt(rA.gasUsed, 16);
    ligne.octetsAchatIdentiques = txA.input.toLowerCase() === achat.data.toLowerCase() && txA.to.toLowerCase() === ROUTEUR_AERO_NOUVEAU;
    if (rA.status !== '0x1') { ligne.resultat = 'BUY_REVERTED'; resultats.push(ligne); console.log(l.sym, 'buy reverted'); continue; }
    const sortiePool = rA.logs.filter((g) => g.address.toLowerCase() === a && g.topics[0] === T_TRANSFER && ('0x' + g.topics[1].slice(26)) === pool && ('0x' + g.topics[2].slice(26)) === ROUTEUR_AERO_NOUVEAU)
      .reduce((s, g) => s + BigInt(g.data), 0n);
    const recu = (await solde(a, TESTEUR)) - avantJ, frais = (await solde(a, FEE_WALLET)) - avantF, paye = avantU - (await solde(USDC, TESTEUR));
    Object.assign(ligne, { paye: String(paye), sortiePool: String(sortiePool), recu: String(recu), fraisRecu: String(frais), devisEgalExecution: sortiePool === qAchat });
    /* VENTE de tout ce qui a ete recu */
    const qVente = await devis(a, USDC, recu, ts);
    const ap2 = calldataApproveNouvelle({ token: a, montant: recu });
    await envoyer(TESTEUR, ap2.to, ap2.data);
    const bt2 = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
    const vente = calldataEchangeNouvelle({ tokenIn: a, tokenOut: USDC, tickSpacing: ts, recipient: TESTEUR, amountIn: recu,
      amountOutMinimum: (qVente * 99n) / 100n, deadline: bt2 + 600, maintenant: bt2, beneficiaireFrais: FEE_WALLET });
    assert.equal(vente.etat, 'PRET', vente.pourquoi);
    const avantU2 = await solde(USDC, TESTEUR), avantFU = await solde(USDC, FEE_WALLET), avantA2 = await solde(a, TESTEUR);
    const { h: hV, r: rV } = await envoyer(TESTEUR, vente.to, vente.data);
    const txV = await rpc('eth_getTransactionByHash', [hV]);
    ligne.venteStatus = rV.status; ligne.venteGaz = parseInt(rV.gasUsed, 16);
    ligne.octetsVenteIdentiques = txV.input.toLowerCase() === vente.data.toLowerCase() && txV.to.toLowerCase() === ROUTEUR_AERO_NOUVEAU;
    if (rV.status !== '0x1') { ligne.resultat = 'SELL_REVERTED'; resultats.push(ligne); console.log(l.sym, 'sell reverted'); continue; }
    const sortiePoolV = rV.logs.filter((g) => g.address.toLowerCase() === USDC && g.topics[0] === T_TRANSFER && ('0x' + g.topics[1].slice(26)) === pool && ('0x' + g.topics[2].slice(26)) === ROUTEUR_AERO_NOUVEAU)
      .reduce((s, g) => s + BigInt(g.data), 0n);
    const rendu = (await solde(USDC, TESTEUR)) - avantU2;
    Object.assign(ligne, { devisVente: String(qVente), sortiePoolVente: String(sortiePoolV), devisVenteEgalExecution: sortiePoolV === qVente,
      renduUsdc: String(rendu), fraisVenteUsdc: String((await solde(USDC, FEE_WALLET)) - avantFU), venduTout: (avantA2 - (await solde(a, TESTEUR))) === recu,
      perteAllerRetourBps: Number(((10_000_000n - rendu) * 10000n) / 10_000_000n) });
    ligne.resultat = jf.passe ? 'PASSES_RULES' : 'FAILS_RULES:' + jf.code;
    resultats.push(ligne);
    console.log(l.sym.padEnd(7), ligne.resultat.padEnd(26), 'ts', ts, '$' + (Number(usdcPool) / 1e6).toFixed(0), 'gap', pFork.ecartBps, 'bps · same-state rt', pFork.perteBps,
      'bps · quote==exec', ligne.devisEgalExecution, ligne.devisVenteEgalExecution, '· back', (Number(rendu) / 1e6).toFixed(4), 'USDC (', ligne.perteAllerRetourBps, 'bps) · bytes', ligne.octetsAchatIdentiques && ligne.octetsVenteIdentiques);
  } catch (err) { ligne.resultat = 'ERROR'; ligne.erreur = String(err.message || err).slice(0, 200); resultats.push(ligne); console.log(l.sym, 'ERROR', ligne.erreur); }
}
fs.writeFileSync(process.env.SORTIE || 'mesures/liquidite-actions-fork-20261025.json', JSON.stringify({ blocFork, blocMesure: mesure.bloc, lu: new Date().toISOString(), routeur: ROUTEUR_AERO_NOUVEAU, resultats }, null, 1));
const executes = resultats.filter((r) => r.achatStatus === '0x1' && r.venteStatus === '0x1');
console.log('fork block', blocFork, '·', cibles.length, 'aero-new pools ·', executes.length, 'bought AND sold ·', resultats.filter((r) => r.resultat === 'PASSES_RULES').length, 'pass the rules');
/* ⛔ les octets executes sont ceux du module, et le devis patche est la sortie executee, partout ou ca a ete execute */
assert.ok(executes.every((r) => r.octetsAchatIdentiques && r.octetsVenteIdentiques), 'executed bytes differ from the module');
/* ⛔ 2026-10-25 (1er passage) : SNDK a rendu 804 938 pour un devis de 804 955 (-2,1 bps), un bloc plus tard (l approbation entre les deux) ;
 *   les 55 autres jambes d achat = devis au wei pres. La borne est donc : execute >= devis - 10 bps, et le compte des egalites exactes est dit. */
const pres = (devis, exe) => BigInt(exe) * 10000n >= BigInt(devis) * 9990n;
console.log('quote == executed, exactly:', executes.filter((r) => r.devisEgalExecution).length, '/', executes.length, 'buys,', executes.filter((r) => r.devisVenteEgalExecution).length, '/', executes.length, 'sells');
assert.ok(executes.every((r) => pres(r.devisAchat, r.sortiePool) && pres(r.devisVente, r.sortiePoolVente)), 'an executed pool output is more than 10 bps under its patched quote');
assert.ok(executes.every((r) => r.venduTout && BigInt(r.fraisRecu) > 0n && BigInt(r.fraisVenteUsdc) > 0n), 'a leg did not sell all, or took no fee');
assert.equal(resultats.filter((r) => r.resultat === 'ERROR' || /REVERTED/.test(r.resultat)).length, 0, 'a leg errored or reverted');
