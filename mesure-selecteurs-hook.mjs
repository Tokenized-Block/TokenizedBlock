/* v1-selecteurs-reels.mjs — QUELS SELECTEURS V1 DECLARE-T-IL VRAIMENT ?
 *
 * ⛔⛔ POURQUOI CE SCRIPT REMPLACE LE PRECEDENT. J ai sonde V1 avec une LISTE DE NOMS QUE J AI
 *     PROPOSES (`feeWallet()`, `du(address,address)`, `claim()`…) et conclu « V1 ne declare rien ».
 *     C ETAIT FAUX, et ma propre memoire m avait prevenu : V1 utilise **`FEE_WALLET()` EN
 *     MAJUSCULES** — casse differente de V2/V4, ou `feeWallet()` reverte. J ai donc interroge V1
 *     dans le vocabulaire de V2. Tester une allegation dans les mots de quelqu un d autre ne la
 *     teste pas.
 *   ⛔ LA CORRECTION SUPPRIME LA DEVINETTE : on EXTRAIT les constantes PUSH4 du bytecode. Un
 *     dispatcher Solidity compare les 4 premiers octets de la calldata a chaque selecteur public,
 *     et ces valeurs sont donc litteralement dans le code. On n a plus a deviner de noms.
 * ⛔ TEMOIN : `FEE_WALLET()` DOIT apparaitre dans l ensemble extrait — sinon l extraction rate des
 *   selecteurs et toute conclusion d absence serait fausse. C est le controle qui rend ce script
 *   utilisable.
 * ⛔ BORNE : un PUSH4 peut aussi etre une constante quelconque. La presence d un selecteur connu
 *   est donc une preuve ; l ensemble complet contient du bruit.
 * ⛔ LECTURE SEULE.
 */
import { selecteur as selP } from './keccak.js';
const sel = (s) => selP(s).replace(/^0x/, '');
const RPC = 'https://mainnet.base.org';
const V1 = '0xaa6d7bd9fc7d394bc717137936f2939834382044';
const V2 = '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044';

let id = 0;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function a(m, p) {
  for (let e = 0; e < 6; e += 1) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
    const j = await r.json().catch(() => null);
    if (j && j.result !== undefined) return { etat: 'OK', res: j.result };
    if (j && j.error && /rate limit|too many/i.test(String(j.error.message || ''))) { await dormir(900 * (e + 1)); continue; }
    if (j && j.error) return { etat: 'REVERT', pourquoi: String(j.error.message).slice(0, 60) };
  }
  return { etat: 'NON_MESURE' };
}

/** Les constantes PUSH4 d un bytecode, dans l ordre, sans doublon.
 * ⛔ ON AVANCE PAR OPCODE, pas par fenetre glissante : un PUSHn saute ses n octets de donnees,
 *   sinon on lirait des morceaux d adresses comme des selecteurs et l ensemble serait du bruit. */
function push4De(hex) {
  const o = [];
  const b = hex.replace(/^0x/, '');
  for (let i = 0; i + 2 <= b.length; ) {
    const op = parseInt(b.slice(i, i + 2), 16);
    if (op === 0x63) { o.push(b.slice(i + 2, i + 10)); i += 10; continue; }
    if (op >= 0x60 && op <= 0x7f) { i += 2 + (op - 0x5f) * 2; continue; }
    i += 2;
  }
  return [...new Set(o)].filter((x) => x.length === 8);
}

const c1 = await a('eth_getCode', [V1, 'latest']);
await dormir(500);
const c2 = await a('eth_getCode', [V2, 'latest']);
if (c1.etat !== 'OK' || c2.etat !== 'OK') { console.log('⛔ bytecode NON MESURE — je ne conclus pas'); process.exit(2); }

const s1 = push4De(c1.res), s2 = push4De(c2.res);
console.log('V1 : ' + ((c1.res.length - 2) / 2) + ' octets, ' + s1.length + ' constantes PUSH4');
console.log('V2 : ' + ((c2.res.length - 2) / 2) + ' octets, ' + s2.length + ' constantes PUSH4');

/* ⛔⛔ LE CONTROLE QUI REND CE SCRIPT UTILISABLE : `FEE_WALLET()` est MESUREE comme repondant sur
 *     V1 (elle rend a6cf). Si l extraction ne la trouve pas, elle rate des selecteurs. */
const temoin = sel('FEE_WALLET()');
const temoinOk = s1.includes(temoin);
console.log('\ncontrole : FEE_WALLET() = 0x' + temoin + ' dans V1 ? ' + (temoinOk ? 'OUI — extraction fiable' : '⛔ NON — extraction NON FIABLE, toute absence ci-dessous est sans valeur'));

/* ── on nomme ce qu on peut, en MAJUSCULES comme en minuscules ─────────────────────────────── */
const CANDIDATS = [];
for (const base of ['du', 'DU', 'reclamer', 'RECLAMER', 'claim', 'CLAIM', 'withdraw', 'WITHDRAW',
  'collect', 'COLLECT', 'retirer', 'RETIRER']) {
  CANDIDATS.push([base + '()', 'retrait'], [base + '(address)', 'retrait'], [base + '(address,address)', 'registre/retrait']);
}
for (const s of ['FEE_WALLET()', 'feeWallet()', 'HOOK_FEE()', 'hookFee()', 'FRAIS_VIE()', 'fraisVie()',
  'DIME()', 'dime()', 'OWNER()', 'owner()']) CANDIDATS.push([s, 'lecture']);
CANDIDATS.push(['walletDesFraisDuDepotV1(address)', 'NEGATIF — invente']);

console.log('\nsignature                                  V1        V2        role');
let collision = false;
for (const [sig, role] of CANDIDATS) {
  const x = sel(sig);
  const in1 = s1.includes(x), in2 = s2.includes(x);
  if (!in1 && !in2) continue;                       /* on n imprime que ce qui existe quelque part */
  if (/NEGATIF/.test(role) && (in1 || in2)) collision = true;
  console.log(sig.slice(0, 42).padEnd(43) + (in1 ? 'PRESENT' : 'absent').padEnd(10) + (in2 ? 'PRESENT' : 'absent').padEnd(10) + role);
}
const negatif = sel('walletDesFraisDuDepotV1(address)');
console.log('\ntemoin negatif 0x' + negatif + ' : ' + (collision ? '⛔ COLLISION' : 'absent des deux — la methode discrimine'));

/* ── et les selecteurs de V1 qu on n a pas su nommer ───────────────────────────────────────── */
const nommes = new Set(CANDIDATS.map(([s]) => sel(s)));
const inconnus = s1.filter((x) => !nommes.has(x));
console.log('\nselecteurs de V1 non nommes : ' + inconnus.length);
console.log('  ' + inconnus.slice(0, 40).map((x) => '0x' + x).join(' '));
/* ⛔ CE QUE CETTE LISTE EST : des constantes PUSH4, donc un MELANGE de selecteurs et de nombres
 *   quelconques. Elle dit ou chercher, elle ne prouve rien a elle seule. */
console.log('\n⛔ ces valeurs melangent selecteurs et constantes : elles disent OU chercher, elles ne');
console.log('prouvent rien seules. Et une fonction DECLAREE peut quand meme reverter.');
