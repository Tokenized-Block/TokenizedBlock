/* test-createur-du-block-20261017.mjs - LE CREATEUR D UN BLOCK EST LU SUR NOS HOOKS, ET SEULEMENT SUR EUX.
 * AFFIRME (EXECUTE : la fonction createurDuBlock extraite de serveur-web.js) : (1) une pool 7030 rend son createur par createurs(bytes32) ;
 *   (2) une pool d un hook ETRANGER sur notre block n est JAMAIS interrogee (sinon un hook menteur se ferait devoir 30 %) ; (3) un ancien
 *   hook (V2) repond par createurDe(bytes32) quand createurs revert ; (4) rien de lisible -> null ; (5) TEMOIN_CHAINE=1 : sur Base reel,
 *   UNIT (cles lues en prod via /api/cle) rend 0x31e0… (mesure du 2026-10-17).
 * NE PROUVE PAS : qu un frais reel soit attribue (aucun frais externe vu a ce jour). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { selecteur } from './keccak.js';
import { HOOK_7030 } from './tokenomics.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('const SEL_CREATEURS = ');
const k = src.indexOf('async function createurDuBlock(', i), fin = /\r?\n\}\r?\n/.exec(src.slice(k));
const j = fin ? k + fin.index + fin[0].length : -1; /* le fichier peut etre en CRLF */
vu(i > 0 && j > i, 'createurDuBlock introuvable');
/* 2026-10-26 : createurDuBlock unit les cles du cache et celles de la profondeur (entreeComplete / unionCles, extraits du MEME fichier) */
const h0 = src.indexOf('const estCleIndice = '), h1 = src.indexOf('/** les cles trouvees par profondeur rejoignent', h0);
const aides = h0 > 0 && h1 > h0 ? src.slice(h0, h1) : '';
vu(aides.includes('function unionCles('), 'aides des cles (entreeComplete, unionCles) introuvables');
const V2 = '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044', ETRANGER = '0x' + 'ee'.repeat(20);
const fabrique = ({ cles = [], scan = [], rpc }) => new Function('selecteurSrv', 'clesCache', 'resoudreClePool', 'fraisScan', 'HOOKS_FRAIS', 'HOOK_7030', 'rpcActivite',
  aides + '\n' + src.slice(i, j) + '\nreturn createurDuBlock;')(selecteur, new Map(), async () => ({ ok: true, cles }), { pools: scan },
  [{ adr: V2 }], HOOK_7030, rpc);
const B = '0xb2000000000000000000007afa7ed748b0874f27', CREA = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', ATTAQUANT = '0x' + 'aa'.repeat(20);
const mot = (a) => '0x' + a.slice(2).padStart(64, '0');
const S = (f) => String(selecteur(f)).replace(/^0x/, '');
const appels = [];
const rpc = async (m, [{ to, data }]) => {
  appels.push(to.toLowerCase());
  if (to.toLowerCase() === ETRANGER) return mot(ATTAQUANT) + '0'.repeat(64);
  if (to.toLowerCase() === HOOK_7030.toLowerCase() && data.startsWith('0x' + S('createurs(bytes32)'))) return mot(CREA) + '0'.repeat(64);
  if (to.toLowerCase() === V2 && data.startsWith('0x' + S('createurDe(bytes32)'))) return mot('0x' + '33'.repeat(20));
  throw new Error('execution reverted');
};
const P = (h, k) => ({ poolId: '0x' + k.repeat(32), hooks: h });
vu(await fabrique({ cles: [P(HOOK_7030, 'ab')], rpc })(B) === CREA, 'pool 7030 : createurs(bytes32) rend le createur');
appels.length = 0;
const r2 = await fabrique({ cles: [P(ETRANGER, 'cd'), P(HOOK_7030, 'ab')], rpc })(B);
vu(r2 === CREA && !appels.includes(ETRANGER), 'hook ETRANGER sur notre block : jamais interroge (' + r2 + ')');
vu(await fabrique({ cles: [P(ETRANGER, 'cd')], rpc })(B) === null, 'seulement un hook etranger -> null, jamais l attaquant');
vu(await fabrique({ cles: [P(V2, 'ef')], rpc })(B) === '0x' + '33'.repeat(20), 'ancien hook V2 : createurDe en repli');
vu(await fabrique({ scan: [{ hook: V2, id: '0x' + '12'.repeat(32), c0: '0x0000000000000000000000000000000000000000', c1: B }], rpc })(B) === '0x' + '33'.repeat(20), 'balayage fraisScan en complement');
vu(await fabrique({ scan: [{ hook: ETRANGER, id: '0x' + '12'.repeat(32), c0: B, c1: B }], rpc })(B) === null, 'balayage : hook etranger ignore aussi');
vu(await fabrique({ cles: [], rpc })(B) === null, 'rien de lisible -> null');
if (process.env.TEMOIN_CHAINE === '1') {
  const prod = await fetch('https://tokenizedblock.space/api/cle/' + B, { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
  const vrai = async (m, p) => { const r = await fetch('https://base.drpc.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
  const c = await fabrique({ cles: prod.cles, rpc: vrai })(B);
  vu(c === CREA, 'TEMOIN CHAINE : UNIT sur Base reel -> ' + c);
}
console.log('ok createur-du-block - ' + n + ' assertions' + (process.env.TEMOIN_CHAINE === '1' ? ' (dont temoin chaine reel)' : ' ; temoin chaine : TEMOIN_CHAINE=1'));
