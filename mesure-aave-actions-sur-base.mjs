/* mesure-aave-actions-sur-base.mjs — LES ACTIONS TOKENISEES ONT-ELLES UNE PROFONDEUR REELLE ?
 *
 * ⛔⛔ POURQUOI CETTE SONDE EXISTE. Phil a envoye un lien Aave Pro (2026-09-26) : un « Hub » Base
 *     ou les actions tokenisees Coinbase servent de collateral. La PAGE annonce 1,85 M$ d actions
 *     deposees et 414 k$ d USDC emprunte. Mais UNE PAGE LUE DANS UN NAVIGATEUR N EST PAS UNE MESURE :
 *     j ai deja pris un cache pour une verification en ligne. Un chiffre affiche par le vendeur du
 *     produit se verifie sur la chaine, ou ne se cite pas.
 *
 * ⇒ CE QU ON VERIFIE. L identifiant du hub est `ODQ1Mzo6MHhhNGQ1...`, qui DECODE en
 *   « 8453::0xa4d5947Eb727A052bae69C593FfC84247EC9864E » — 8453 est Base. On demande donc a la
 *   chaine : ce contrat existe-t-il, et quelles reserves porte-t-il vraiment ?
 *   ⛔ L ADRESSE EST DECODEE, PAS RECOPIEE DE MEMOIRE : `base64 -d` sur l identifiant de l URL.
 *
 * ⛔ LE SELECTEUR EST CALCULE, JAMAIS DEVINE. Deviner `dime()` = `0x30793036` au lieu du vrai
 *   `0xfabd2365` m a coute une conclusion fausse le meme jour. Et il y a DEUX `selecteur` dans ce
 *   depot aux conventions OPPOSEES : celui de `keccak.js` rend AVEC `0x`, celui de `pool.js` SANS.
 *   On normalise explicitement.
 *
 * ⛔ CE QUE CETTE SONDE NE POURRA PAS DIRE : si c est un bon produit, ni s il faut y aller. Elle dit
 *   ce qui est DEPOSE. Un collateral immobilise n est pas un volume d echange, et une profondeur
 *   n est pas un revenu pour nous.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
/* ⛔ decode de `ODQ1Mzo6MHhhNGQ1OTQ3RWI3MjdBMDUyYmFlNjlDNTkzRmZDODQyNDdFQzk4NjRF` */
const ID_HUB = 'ODQ1Mzo6MHhhNGQ1OTQ3RWI3MjdBMDUyYmFlNjlDNTkzRmZDODQyNDdFQzk4NjRF';
const decode = Buffer.from(ID_HUB, 'base64').toString('utf8');
const [chaine, cible] = decode.split('::');

/* ⛔ `keccak.js` rend AVEC le prefixe, `pool.js` SANS. On force, on ne suppose pas. */
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };

const souffler = (ms = 140) => new Promise((r) => setTimeout(r, ms));
let appels = 0;
async function rpc(method, params, essais = 4) {
  for (let i = 0; i < essais; i++) {
    appels++;
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json().catch(() => ({ error: { message: 'reponse non JSON (HTTP ' + r.status + ')' } }));
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited|timeout/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(800 * (i + 1));
  }
}
const appel = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
/* ⛔ UN REVERT EST UNE REPONSE, PAS UN VIDE : on rend `null` ET on dit pourquoi. */
const essai = async (to, sig) => { try { await souffler(); return await appel(to, sel(sig)); } catch (e) { return { ko: e.message }; } };

const motAt = (hex, i) => '0x' + String(hex).slice(2).slice(i * 64, (i + 1) * 64);
const nombre = (h) => BigInt(h);
function chaineAbi(hex) {
  /* decodage d un `string` ABI : offset, longueur, octets */
  try {
    const d = String(hex).slice(2);
    const off = Number(BigInt('0x' + d.slice(0, 64)));
    const len = Number(BigInt('0x' + d.slice(off * 2, off * 2 + 64)));
    const oct = d.slice(off * 2 + 64, off * 2 + 64 + len * 2);
    return Buffer.from(oct, 'hex').toString('utf8');
  } catch (_) { return null; }
}
function tableauAdr(hex) {
  try {
    const d = String(hex).slice(2);
    const off = Number(BigInt('0x' + d.slice(0, 64)));
    const n = Number(BigInt('0x' + d.slice(off * 2, off * 2 + 64)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const m = d.slice(off * 2 + 64 + i * 64, off * 2 + 64 + (i + 1) * 64);
      out.push('0x' + m.slice(24));
    }
    return out;
  } catch (_) { return null; }
}

console.log('═══ LES ACTIONS TOKENISEES SUR BASE : CE QUE LA CHAINE DIT ═══\n');
console.log('  identifiant du hub (URL Aave Pro) : ' + ID_HUB);
console.log('  DECODE                            : ' + decode);
console.log('  chaine annoncee : ' + chaine + (chaine === '8453' ? '  ✅ Base' : '  ⚠️ PAS Base'));
console.log('  contrat cible   : ' + cible + '\n');
if (chaine !== '8453') {
  console.log('  ⛔ L identifiant ne designe pas Base : cette sonde lit Base, elle s arrete ici.');
  process.exit(2);
}

/* ── 1. le contrat existe-t-il ? ─────────────────────────────────────────────────────────────── */
const code = await rpc('eth_getCode', [cible, 'latest']);
console.log('── 1. le contrat ──');
console.log('  taille du bytecode : ' + ((String(code).length - 2) / 2) + ' octets');
if (!code || code === '0x') {
  /* ⛔ UN ZERO QUI NE PEUT PAS MONTER : pas de code = rien a interroger. Fait, pas panne. */
  console.log('  ⛔⛔ AUCUN CODE a cette adresse. Le lien designe quelque chose qui n est pas un');
  console.log('    contrat sur Base — la page peut afficher ce qu elle veut, il n y a rien a lire.');
  process.exit(1);
}
/* ⛔ marqueur B20 : `0xef` EXACTEMENT (regle du depot). Ici on VERIFIE que ce n en est pas un. */
console.log('  est-ce un B20 (`0xef` exactement) ? ' + (String(code).toLowerCase() === '0xef' ? '⚠️ OUI' : 'non'));

/* ── 2. est-ce un Pool Aave ? ────────────────────────────────────────────────────────────────── */
console.log('\n── 2. quelles fonctions repond-il ? (selecteurs CALCULES) ──');
const sondes = ['getReservesList()', 'ADDRESSES_PROVIDER()', 'POOL()', 'symbol()', 'name()', 'decimals()'];
const reponses = {};
for (const s of sondes) {
  const r = await essai(cible, s);
  reponses[s] = r;
  const vu = r && r.ko ? '⛔ REFUS : ' + String(r.ko).slice(0, 52) : (r === '0x' ? '(vide)' : 'OK  ' + String(r).slice(0, 26) + '…');
  console.log('  ' + sel(s) + '  ' + s.padEnd(22) + ' ' + vu);
}

/* ── 3. les reserves, si c en est un ─────────────────────────────────────────────────────────── */
const brutReserves = reponses['getReservesList()'];
console.log('\n── 3. les reserves ──');
if (!brutReserves || brutReserves.ko || brutReserves === '0x') {
  console.log('  ⛔ `getReservesList()` ne repond pas : ce contrat N EST PAS un Pool Aave.');
  console.log('    ⇒ L identifiant du hub designe donc autre chose (un registre, un hub, un proxy).');
  console.log('    ⚠️ CE QUE CA NE PROUVE PAS : que les chiffres de la page sont faux. Ca prouve que');
  console.log('      JE NE PEUX PAS LES VERIFIER PAR CETTE ADRESSE. « pas verifie » n est pas « faux ».');
} else {
  const liste = tableauAdr(brutReserves) || [];
  console.log('  ' + liste.length + ' reserve(s) declaree(s) par la chaine');
  /* ⛔ ON LIT LE SYMBOLE SUR CHAQUE JETON, on ne fait pas confiance a l ordre de la page. */
  for (const t of liste.slice(0, 12)) {
    const s = await essai(t, 'symbol()');
    const d = await essai(t, 'decimals()');
    const sym = s && !s.ko ? (chaineAbi(s) || '(illisible)') : '⛔ refus';
    const dec = d && !d.ko && d !== '0x' ? Number(nombre(motAt(d, 0))) : null;
    console.log('    ' + t + '  ' + String(sym).padEnd(10) + ' dec=' + (dec === null ? '?' : dec));
  }
  if (liste.length > 12) console.log('    … ' + (liste.length - 12) + ' de plus, non affichees');
}

console.log('\n── VERDICT ──');
console.log('  ⛔ CE QUE CETTE SONDE ETABLIT : ce que la CHAINE declare a cette adresse. Rien de plus.');
console.log('  ⛔ CE QU ELLE N ETABLIT PAS : les montants de la page Aave Pro. Les lire exigerait de');
console.log('    connaitre le Pool ET d appeler `getReserveData` par jeton — un cran de plus, qui n a');
console.log('    de sens que si l adresse ci-dessus est bien un Pool.');
console.log('  ⛔ ET SURTOUT : une profondeur de collateral n est PAS un revenu pour nous. 1,85 M$');
console.log('    immobilises chez Aave ne versent pas un centime a TBLOCK. C est un fait de marche,');
console.log('    pas une piste de revenu — ne pas confondre les deux.');
console.log('\n  Appels RPC : ' + appels);
