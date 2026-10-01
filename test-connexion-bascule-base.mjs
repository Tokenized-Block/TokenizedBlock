/* test-connexion-bascule-base.mjs — A LA CONNEXION, UN WALLET SUR ETHEREUM EST BASCULE SUR BASE (8453).
 *
 * ⛔⛔ LE SIGNALEMENT (Raksha, 2026-10-01) : Rabby se connecte sur Ethereum par defaut. Mesure au
 *     navigateur contre la prod (provider simule, chaine 0x1) : `connecter()` demande deja
 *     `wallet_switchEthereumChain 0x2105`, puis `wallet_addEthereumChain` sur un 4902 de premier niveau.
 *     LES TROUS : un 4902 EMBALLE dans `data.originalError` (MetaMask mobile, -32603) n ajoutait pas le
 *     reseau ; une demande deja en cours (-32002) juste apres la popup echouait sans reessai.
 * ⛔ CE FICHIER EXECUTE LE VRAI `basculerChaine` extrait d app.html depouille de ses commentaires.
 * ⛔⛔ TEMOINS : refus utilisateur 4001 -> false, SANS reessai NI ajout (il a dit non) ; mutation qui retire
 *   la lecture de `originalError` -> le cas emballe DOIT echouer (voir le commit).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const d = nu.indexOf('async function basculerChaine(id) {');
const f = nu.indexOf('const CLE_INTENT_RESUME', d);
assert.ok(d > 0 && f > d, 'basculerChaine introuvable');
const source = nu.slice(d, f);
const RESEAUX = { 8453: { nom: 'Base mainnet', explorateur: 'https://basescan.org' } };

function wallet(mode) {
  const appels = []; let chaine = '0x1'; let switchs = 0;
  const eth = { request: async ({ method, params }) => {
    appels.push(method + (params && params[0] && params[0].chainId ? ' ' + params[0].chainId : ''));
    if (method === 'eth_chainId') return chaine;
    if (method === 'wallet_switchEthereumChain') {
      switchs += 1;
      if (mode === '4902') throw Object.assign(new Error('Unrecognized chain ID "0x2105"'), { code: 4902 });
      if (mode === 'emballe') throw Object.assign(new Error('Internal JSON-RPC error.'), { code: -32603, data: { originalError: { code: 4902, message: 'Unrecognized' } } });
      if (mode === 'occupe' && switchs === 1) throw Object.assign(new Error('Request already pending'), { code: -32002 });
      if (mode === 'refus') throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
      chaine = params[0].chainId; return null;
    }
    if (method === 'wallet_addEthereumChain') { chaine = params[0].chainId; return null; }
    throw new Error('inattendu ' + method);
  } };
  return { eth, appels };
}
async function basculer(mode) {
  const w = wallet(mode);
  const fn = new Function('window', 'RESEAUX', source + '\nreturn basculerChaine(8453);');
  const ok = await fn({ ethereum: w.eth }, RESEAUX);
  return { ok, appels: w.appels.filter((x) => x !== 'eth_chainId') };
}

await cas('wallet sur Ethereum : wallet_switchEthereumChain 0x2105 demande, true', async () => {
  const r = await basculer('ok');
  assert.equal(r.ok, true); assert.deepEqual(r.appels, ['wallet_switchEthereumChain 0x2105']);
});
await cas('4902 de premier niveau : repli wallet_addEthereumChain 0x2105', async () => {
  const r = await basculer('4902');
  assert.equal(r.ok, true); assert.deepEqual(r.appels, ['wallet_switchEthereumChain 0x2105', 'wallet_addEthereumChain 0x2105']);
});
await cas('⛔⛔⛔ 4902 EMBALLE (-32603, data.originalError.code 4902) : repli wallet_addEthereumChain', async () => {
  const r = await basculer('emballe');
  assert.equal(r.ok, true, 'le reseau n a pas ete ajoute : ' + JSON.stringify(r.appels));
  assert.deepEqual(r.appels, ['wallet_switchEthereumChain 0x2105', 'wallet_addEthereumChain 0x2105']);
});
await cas('⛔⛔ -32002 (demande deja en cours) : UN reessai, puis true', async () => {
  const r = await basculer('occupe');
  assert.equal(r.ok, true); assert.deepEqual(r.appels, ['wallet_switchEthereumChain 0x2105', 'wallet_switchEthereumChain 0x2105']);
});
await cas('TEMOIN — REFUS 4001 : false, sans reessai ni ajout de reseau', async () => {
  const r = await basculer('refus');
  assert.equal(r.ok, false); assert.deepEqual(r.appels, ['wallet_switchEthereumChain 0x2105']);
});
await cas('connecter() bascule le wallet quand sa chaine differe (appel de code, pas commentaire)', async () => {
  const c = nu.slice(nu.indexOf('async function connecter() {'), nu.indexOf('let lectureCreations = null;'));
  assert.match(c, /chaineWallet !== CHAINE && await basculerChaine\(CHAINE\)/);
});
console.log('test-connexion-bascule-base :', n, 'cas OK');
