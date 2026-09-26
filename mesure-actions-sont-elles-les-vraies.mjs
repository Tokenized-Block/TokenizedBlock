/* mesure-actions-sont-elles-les-vraies.mjs — NOS 13 « ACTIONS COINBASE » SONT-ELLES LES VRAIES ?
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE SONDE. `paires.js` declare treize actions tokenisees, et LES TREIZE
 *     commencent par `0xb2000000000000000000…`. Or ce prefixe est celui de NOTRE famille B20, et il
 *     est IMITABLE : CREATE2 permet de fabriquer une adresse qui commence par ce que l on veut.
 *     Pendant ce temps, Aave Pro annonce un marche reel sur Base avec 1,85 M$ d actions tokenisees
 *     en collateral. Si nos adresses ne sont pas celles-la, l application paire les blocks avec des
 *     HOMONYMES, et le vrai marche est ailleurs.
 *   ⚠️ MAIS L INVERSE EST AUSSI POSSIBLE, et c est pour ca qu on mesure au lieu d accuser : Coinbase
 *     peut parfaitement emettre ces actions EN B20, auquel cas le prefixe est normal et les adresses
 *     sont bonnes. Les deux lectures sont credibles ; seule la chaine tranche.
 *
 * COMMENT ON TRANCHE, ET CE QUE CHAQUE REPONSE VEUT DIRE :
 *   1. `eth_getCode`. Un B20 natif rend EXACTEMENT `0xef` — la regle du depot est « exactement »,
 *      pas « commence par ». Un ERC-20 ordinaire rend des milliers d octets.
 *   2. `symbol()` et `name()`. Un jeton qui ne sait pas dire son nom n est pas exploitable par
 *      l interface, quel que soit son prefixe.
 *   3. `totalSupply()`. Une supply de zero a une adresse qui porte un symbole d action est un
 *      signal fort : le symbole est pose, l actif n existe pas.
 *
 * ⛔ CE QUE CETTE SONDE NE POURRA PAS DIRE : laquelle est « l officielle ». Il n existe pas de
 *   fonction `estVraimentDeCoinbase()`. Elle dit ce qui EXISTE a ces adresses ; nommer l emetteur
 *   demande une source hors chaine, et je ne la fabriquerai pas.
 * ⛔ ET ELLE NE COMPLETE AUCUNE ADRESSE DE MEMOIRE : les treize sont LUES dans `paires.js`.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { ACTIONS_COINBASE } from './paires.js';
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
/* ⛔ `keccak.js` rend AVEC le prefixe, `pool.js` SANS. Deux homonymes aux conventions opposees. */
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };

const souffler = (ms = 190) => new Promise((r) => setTimeout(r, ms));
let appels = 0;
async function rpc(method, params, essais = 5) {
  for (let i = 0; i < essais; i++) {
    appels++;
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json().catch(() => ({ error: { message: 'reponse non JSON (HTTP ' + r.status + ')' } }));
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited|timeout/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(900 * (i + 1));
  }
}
/* ⛔ UN REFUS EST UNE REPONSE, PAS UN VIDE : on distingue « a revert » de « n a pas ete lu ». */
async function essai(to, sig) {
  try { await souffler(); return { ok: await rpc('eth_call', [{ to, data: sel(sig) }, 'latest']) }; }
  catch (e) { return { ko: String(e.message || e) }; }
}
function chaineAbi(hex) {
  try {
    const d = String(hex).slice(2);
    const off = Number(BigInt('0x' + d.slice(0, 64)));
    const len = Number(BigInt('0x' + d.slice(off * 2, off * 2 + 64)));
    return Buffer.from(d.slice(off * 2 + 64, off * 2 + 64 + len * 2), 'hex').toString('utf8');
  } catch (_) { return null; }
}

console.log('═══ NOS « ACTIONS COINBASE » : QU Y A-T-IL VRAIMENT A CES ADRESSES ? ═══\n');
console.log('  ' + ACTIONS_COINBASE.length + ' adresses, LUES dans paires.js (aucune recopiee de memoire)\n');
console.log('  symbole  declare | sur la chaine     code        supply');
console.log('  ------------------------------------------------------------------------------');

let b20 = 0, erc20 = 0, vides = 0, muets = 0, nonLus = 0, dAccord = 0, desaccord = 0, zeros = 0;
const soucis = [];
for (const a of ACTIONS_COINBASE) {
  let code;
  try { await souffler(); code = await rpc('eth_getCode', [a.adr, 'latest']); }
  catch (e) { console.log('  ' + a.symbole.padEnd(8) + ' ⛔ code NON LU : ' + String(e.message).slice(0, 40)); nonLus++; continue; }
  const taille = (String(code).length - 2) / 2;
  const estB20 = String(code).toLowerCase() === '0xef';   /* ⛔ EXACTEMENT, pas « commence par » */
  if (taille === 0) { vides++; soucis.push(a.symbole + ' : AUCUN CODE'); }
  else if (estB20) b20++; else erc20++;

  const s = await essai(a.adr, 'symbol()');
  const t = await essai(a.adr, 'totalSupply()');
  let sym = '—';
  if (s.ko) { sym = '⛔ refus'; muets++; }
  else if (s.ok && s.ok !== '0x') { sym = chaineAbi(s.ok) || '(illisible)'; }
  else { sym = '(vide)'; muets++; }
  /* ⛔⛔ PREMIERE VERSION : FAUSSE, ET ELLE MASQUAIT LE CAS LE PLUS GRAVE. Elle faisait
   *     `Number(supply) / 1e18` en SUPPOSANT 18 decimales, et affichait « 0.000 » pour trois
   *     jetons. Or « la supply est nulle » et « mon affichage l a ecrasee » sont deux faits
   *     opposes : le premier veut dire qu on propose de se pairer a du VIDE. Un chiffre juste mais
   *     illisible n avertit pas. ⇒ on LIT `decimals()` et on distingue explicitement le zero. */
  const dOk = await essai(a.adr, 'decimals()');
  let dec = null;
  if (dOk.ok && dOk.ok !== '0x') { try { dec = Number(BigInt(dOk.ok)); } catch (_) {} }
  let sup = '—', supBrute = null;
  if (t.ok && t.ok !== '0x') {
    try {
      supBrute = BigInt(t.ok);
      if (supBrute === 0n) { sup = 'ZERO'; zeros++; soucis.push(a.symbole + ' : supply ZERO — se pairer a du vide'); }
      else if (dec === null) sup = supBrute.toString() + ' (dec ?)';
      else {
        /* ⛔ division ENTIERE en BigInt : `Number(BigInt)` sur une grande supply perd des chiffres. */
        const ent = supBrute / (10n ** BigInt(dec));
        const frac = supBrute % (10n ** BigInt(dec));
        sup = ent.toString() + (frac > 0n ? ',' + String(frac).padStart(dec, '0').slice(0, 2) : '');
      }
    } catch (_) { sup = '?'; }
  } else if (t.ko) sup = 'refus';

  /* ⛔⛔ LE CONTROLE QUI COMPTE : le symbole DECLARE chez nous correspond-il a celui de la CHAINE ?
   *     Un desaccord veut dire que l interface annonce Tesla la ou la chaine dit autre chose. */
  const accord = sym === a.symbole;
  if (sym !== '⛔ refus' && sym !== '(vide)' && sym !== '(illisible)') { accord ? dAccord++ : desaccord++; }
  if (!accord && sym !== '⛔ refus' && sym !== '(vide)') soucis.push(a.symbole + ' : la chaine dit « ' + sym + ' »');

  console.log('  ' + a.symbole.padEnd(8) + ' | ' + String(sym).padEnd(16)
    + ' ' + (taille === 0 ? 'AUCUN   ' : estB20 ? '0xef(B20)' : String(taille) + ' o').padEnd(10)
    + ' ' + sup + (accord ? '' : '   ⚠️'));
}

console.log('\n── VERDICT ──');
console.log('  B20 natifs (`0xef` exactement) : ' + b20);
console.log('  contrats ERC-20 ordinaires     : ' + erc20);
console.log('  adresses SANS AUCUN CODE       : ' + vides);
console.log('  qui ne savent pas dire leur symbole : ' + muets);
console.log('  symbole de la chaine == symbole declare : ' + dAccord + '  ·  EN DESACCORD : ' + desaccord);
if (nonLus) console.log('  ⛔ ' + nonLus + ' adresse(s) NON LUE(S) : « pas regarde » n est pas « rien trouve ».');

if (vides === ACTIONS_COINBASE.length) {
  /* ⛔⛔ UN ZERO QUI PEUT MONTER : il suffirait qu une seule adresse porte du code. Celui-ci dit
   *     donc quelque chose de reel. */
  console.log('\n  ⛔⛔ AUCUNE des ' + ACTIONS_COINBASE.length + ' adresses ne porte de code. Ce ne sont pas');
  console.log('    des jetons : l interface propose de se pairer a des adresses VIDES.');
} else if (desaccord > 0) {
  console.log('\n  ⛔⛔ ' + desaccord + ' adresse(s) portent un symbole DIFFERENT de celui que nous annoncons.');
  console.log('    L interface nommerait donc une action et en designerait une autre.');
} else if (b20 > 0 && erc20 === 0) {
  console.log('\n  ✅ Toutes celles qui existent sont des B20 natifs, et les symboles concordent.');
  console.log('    ⇒ Le prefixe `0xb2…` n etait donc PAS un signe d imitation ici : c est la forme');
  console.log('      normale de ces actifs. Ma suspicion de depart etait infondee, et je le dis.');
  console.log('    ⛔ MAIS « le symbole concorde » N EST PAS « c est l officielle de Coinbase » : aucune');
  console.log('      fonction on-chain ne dit qui a emis. Nommer l emetteur exige une source hors');
  console.log('      chaine que je ne fabriquerai pas.');
}
if (soucis.length) {
  console.log('\n  a regarder :');
  for (const s of soucis.slice(0, 14)) console.log('    · ' + s);
}
console.log('\n  Appels RPC : ' + appels);
