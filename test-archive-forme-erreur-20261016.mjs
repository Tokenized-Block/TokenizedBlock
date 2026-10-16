/* test-archive-forme-erreur-20261016.mjs - L ERREUR D ARCHIVE NOMME SON APPELANT ET LA FORME DE L APPEL, SANS RIEN PUBLIER.
 * Prod 11-16/10 : 441 puis 175 erreurs/jour « invalid argument 0: hex string without 0x prefix », classe « autre », appelant inconnu
 *   (le code relu porte partout des 0x). Deviner coute plus que mesurer : la FORME des parametres de l appel fautif est gardee.
 * AFFIRME (EXECUTE, bloc archive extrait de serveur-web.js) : apres une erreur non relancee, archiveCompte.derniereErreurForme =
 *   { qui, methode, forme } ou `forme` ne contient AUCUNE valeur (une adresse 0x… devient « 0x42 », un hex sans 0x « hexSANS0x64 »,
 *   un decimal « dec7 ») ; elle survit a un redemarrage le meme jour ; une erreur relancee puis servie n ecrit rien.
 * NE PROUVE PAS : la cause en prod (c est justement ce que cette instrumentation va dire). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('const RPC_ARCHIVE = (() => {'), j = src.indexOf('let repliServeur = null;', i);
vu(i > 0 && j > i, 'bloc archive introuvable');
const CLE = 'k3yNEVERshownABCDEFGH1234', URL_CDP = 'https://api.developer.coinbase.com/rpc/v1/base/' + CLE;
const fabrique = (lire, fichiers = new Map()) => new Function('process', 'ESSAI_SRV', 'lecteurUrl', 'existsSync', 'join', 'readFileSync', 'writeFileSync', 'renameSync', 'AsyncLocalStorage',
  src.slice(i, j) + '\n; return { archiveCompte, lecteurArchive, consommateurArchive, formeParams };')(
  { env: { BASE_RPC_ARCHIVE: URL_CDP, BASE_RPC_ARCHIVE_MAX_JOUR: '50' } }, { actif: false }, () => lire,
  (p) => p === '/data' || fichiers.has(p), (...x) => x.join('/'), (p) => fichiers.get(p), (p, v) => fichiers.set(p, v), (a, b) => { fichiers.set(b, fichiers.get(a)); fichiers.delete(a); }, AsyncLocalStorage);
/* formeParams : la forme, jamais la valeur */
{
  const m = fabrique(async () => []);
  const f = m.formeParams([{ fromBlock: '0x320a207', toBlock: 'latest', address: '0x' + 'ab'.repeat(20), topics: ['0x' + 'cd'.repeat(32), null, 'ef'.repeat(32)] }, 52470279, '52470279']);
  vu(JSON.stringify(f) === JSON.stringify([{ fromBlock: '0x9', toBlock: 's6', address: '0x42', topics: ['0x66', 'null', 'hexSANS0x64'] }, 'num', 'dec8']), 'forme : 0x<n>, s<n>, hexSANS0x<n>, dec<n>, num - aucune valeur (' + JSON.stringify(f) + ')');
  vu(!JSON.stringify(f).includes('abab') && !JSON.stringify(f).includes('cdcd'), 'aucune adresse ni aucun sujet ne sort');
}
/* l erreur non relancee ecrit la forme avec son appelant ; une erreur relancee puis servie n ecrit rien */
{
  const disque = new Map();
  let essais = 0;
  const m = fabrique(async (methode, params) => { essais += 1; if (params[0] && params[0].fromBlock === 'sans0x') throw new Error('invalid argument 0: hex string without 0x prefix'); if (params[0] && params[0].fromBlock === 'lent' && essais < 2) throw new Error('429 rate limit'); return []; }, disque);
  const r = m.lecteurArchive('repli');
  await m.consommateurArchive.run('fond routeur', () => r('eth_getLogs', [{ fromBlock: 'lent', toBlock: '0x1' }]));
  vu(m.archiveCompte.derniereErreurForme === undefined, 'une erreur relancee puis servie n ecrit aucune forme');
  await assert.rejects(m.consommateurArchive.run('route /api/cle/:adr', () => r('eth_getLogs', [{ fromBlock: 'sans0x', toBlock: '0x1', address: '0x' + 'ab'.repeat(20) }])), /without 0x/);
  const f = m.archiveCompte.derniereErreurForme;
  vu(f && f.qui === 'route /api/cle/:adr' && f.methode === 'eth_getLogs' && JSON.stringify(f.forme) === JSON.stringify([{ fromBlock: 's6', toBlock: '0x3', address: '0x42' }]), 'l erreur nomme son appelant, sa methode et la forme de ses parametres (' + JSON.stringify(f) + ')');
  vu(m.archiveCompte.erreurs === 1 && m.archiveCompte.derniereErreur.includes('without 0x'), 'le compteur et le message restent ceux d avant');
  /* persistance : relue le meme jour par un nouveau bloc */
  const m2 = fabrique(async () => [], disque);
  vu(m2.archiveCompte.derniereErreurForme && m2.archiveCompte.derniereErreurForme.qui === 'route /api/cle/:adr', 'la forme survit a un redemarrage le meme jour');
}
console.log('ok archive-forme-erreur - ' + n + ' assertions ; NE PROUVE PAS la cause en prod');
