/* banc-liquidite-plan-fork-20261025.mjs — LE CHEMIN DU SERVEUR, DE BOUT EN BOUT SUR FORK : planRail (rails-api.js) avec un verdict
 * 'aero-new' meilleur -> APPROBATIONS -> l approbation envoyee -> planRail de nouveau -> PRET (simule par le planificateur) -> envoye.
 * Achat de 10 USDC puis vente de tout ce qui a ete recu, sur les actions SYMS (defaut CRWVc,NFLXc,AVGOc). Meme garde que le banc des lieux :
 * FORK_URL doit etre un anvil BASE (anvil_nodeInfo.forkConfig), impersonation sur le fork seulement, rien de signe.
 * Le verdict injecte est relu de mesures/liquidite-actions-20261025.json (sa pool, son espacement) : c est la forme que sert le serveur. */
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
import { planRail } from './rails-api.js';
import { ROUTEUR_AERO_NOUVEAU } from './liquidite-actions.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';

const FORK = process.env.FORK_URL || 'http://127.0.0.1:8631';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TESTEUR = '0x1000000000000000000000000000000000000d0d';
const SYMS = (process.env.SYMS || 'CRWVc,NFLXc,AVGOc').split(',');
const mesure = JSON.parse(fs.readFileSync(process.env.MESURE || 'mesures/liquidite-actions-20261025.json', 'utf8'));
let id = 1;
async function rpc(method, params = []) {
  const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; } return j.result;
}
const w = (a) => a.toLowerCase().slice(2).padStart(64, '0'), n = (x) => BigInt(x).toString(16).padStart(64, '0');
const solde = async (t, a) => BigInt('0x' + (await rpc('eth_call', [{ to: t, data: selecteur('balanceOf(address)') + w(a) }, 'latest'])).slice(2, 66));
async function envoyer(from, c) {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x1e8480' }]);
  let r = null; for (let i = 0; i < 60 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((ok) => setTimeout(ok, 250)); }
  assert.ok(r, 'no receipt'); return r;
}
const info = await rpc('anvil_nodeInfo').catch(() => null);
assert.ok(info && info.forkConfig, 'not an anvil fork: refusing to run');
assert.equal(await rpc('eth_chainId'), '0x2105');
for (const a of [PM, TESTEUR]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }
await envoyer(PM, { to: USDC, data: selecteur('transfer(address,uint256)') + w(TESTEUR) + n(100_000_000n) });
/* l heure du plan = celle du fork (le deadline est juge contre elle) */
const maintenant = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16) * 1000;
const res = [];
for (const sym of SYMS) {
  const l = mesure.lignes.find((x) => x.sym === sym); assert.ok(l, sym + ' not in the measure');
  const v = (l.regles || l.venues).find((x) => x.venue === 'aero-new'); assert.ok(v && v.pool, sym + ' has no aero-new pool'); /* `regles` : mesure du serveur (2026-10-25) */
  const verdict = { achetable: false, meilleure: 'aero-new', venues: { 'aero-new': { ...v, passe: true } } };
  const deps = async () => ({ rpc, chaine: 8453, maintenant: await maintenant(), venueAction: () => verdict });
  const etapes = [];
  const jambe = async (de, vers, montant) => {
    let p = await planRail({ de, vers, montant: String(montant), compte: TESTEUR }, await deps());
    etapes.push(p.etat);
    if (p.etat === 'APPROBATIONS') {
      assert.equal(p.via, 'planVenueNeuve'); assert.equal(p.aSigner.length, 1);
      assert.equal((await envoyer(TESTEUR, p.aSigner[0])).status, '0x1');
      p = await planRail({ de, vers, montant: String(montant), compte: TESTEUR }, await deps());
      etapes.push(p.etat);
    }
    assert.equal(p.etat, 'PRET', sym + ' ' + p.pourquoi); assert.equal(p.via, 'planVenueNeuve'); assert.equal(p.aSigner[0].to, ROUTEUR_AERO_NOUVEAU);
    const avant = await solde(vers, TESTEUR), avantF = await solde(vers, FEE_WALLET);
    const r = await envoyer(TESTEUR, p.aSigner[0]);
    assert.equal(r.status, '0x1', sym + ' swap reverted');
    const recu = (await solde(vers, TESTEUR)) - avant, frais = (await solde(vers, FEE_WALLET)) - avantF;
    assert.ok(recu >= BigInt(p.resume.recoitAuMoins), sym + ' received less than the minimum shown');
    assert.ok(frais > 0n, sym + ' no fee');
    return { recu, frais, auMoins: p.resume.recoitAuMoins, quote: p.resume.quote, gaz: parseInt(r.gasUsed, 16) };
  };
  const a = await jambe(USDC, l.adr, 10_000_000n);
  const vt = await jambe(l.adr, USDC, a.recu);
  res.push({ sym, etapes, achat: { recu: String(a.recu), auMoins: a.auMoins, frais: String(a.frais) }, vente: { recuUsdc: String(vt.recu), auMoins: vt.auMoins, frais: String(vt.frais) } });
  console.log(sym.padEnd(7), etapes.join('>'), '· bought', String(a.recu), '(min', a.auMoins + ')', '· sold back for', (Number(vt.recu) / 1e6).toFixed(4), 'USDC (min', (Number(vt.auMoins) / 1e6).toFixed(4) + ')');
}
fs.writeFileSync(process.env.SORTIE || 'mesures/liquidite-plan-fork-20261025.json', JSON.stringify({ blocFork: parseInt(await rpc('eth_blockNumber'), 16), lu: new Date().toISOString(), res }, null, 1));
console.log('planRail on fork:', res.length, 'stocks bought then sold through the server path');
