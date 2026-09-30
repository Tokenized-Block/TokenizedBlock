/* mesure-routeur-multi-sauts.mjs — LE ROUTEUR AERODROME SAIT-IL FAIRE PLUSIEURS SAUTS, ET GARDER
 * NOTRE FRAIS AU BOUT ?
 *
 * ⛔⛔ LE BUG QUE CE FICHIER INSTRUMENTE, ET IL DURE DEPUIS DES JOURS : un block cote en action
 *     tokenisee (DGUY/AMZNc par exemple) n est PAS achetable par un visiteur qui tient de l ETH.
 *     Il faudrait ETH -> USDC -> AMZNc -> DGUY. Notre Buy ne sait faire qu UN saut, donc il
 *     attendait puis rendait « create another block ». J ai MASQUE le bouton sur ces marches — c est
 *     honnete, ce n est pas une solution. Le concurrent le fait en UNE transaction et affiche meme
 *     la profondeur de la jambe de routage.
 *
 * ⛔⛔⛔ LA METHODE : ON N INVENTE AUCUN SELECTEUR. On lit le BYTECODE du routeur et on en extrait
 *      tous les PUSH4 — la table de dispatch reelle. Un selecteur rappele de memoire est un defaut
 *      connu de ce depot ; une signature devinee qui reverte est AMBIGUE (mauvais nom ? mauvais
 *      arguments ? pas la bonne fonction ?) et n apprend rien.
 *
 * ⛔ TEMOIN NEGATIF OBLIGATOIRE : un nom qu aucun routeur ne peut porter doit etre ABSENT. Sans lui,
 *   « present » ne voudrait rien dire — un extracteur casse qui rend tout present serait vert.
 *
 * ⚠️ BORNE : la presence d un selecteur prouve que le contrat DISPATCHE dessus. Elle ne prouve pas
 *    que l appel aboutisse, ni ce que la fonction fait. La presence d un nom n est pas son usage.
 *
 * Usage : node mesure-routeur-multi-sauts.mjs
 */
/* ⛔ LE HELPER CANONIQUE DU DEPOT, pas une copie plus faible : `keccak.js` porte deja `selecteur()`.
 *   Une seconde implementation de keccak diverge en silence — le motif est deja documente ici. */
import { selecteur } from './keccak.js';

const RPC = 'https://mainnet.base.org';

/* ⛔ Adresses RECOPIEES de `frais-swap.js` / des mesures de ce depot, jamais completees de tete. */
const ROUTEURS = [
  { nom: 'Aerodrome CL (Slipstream)', adr: '0x698cb2b6dd822994581fea6ea4fc755d1363a92f' },
  { nom: 'Uniswap Universal Router', adr: '0x6ff5693b99212DA76aD316178A184AB56D299b43' },
];

/* Les signatures qu on TESTE — et le temoin negatif en dernier. */
const SIGNATURES = [
  /* un saut, forme Uniswap v3 (fee uint24) */
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
  /* un saut, forme Slipstream (tickSpacing int24) — c est la difference qui compte */
  'exactInputSingle((address,address,int24,address,uint256,uint256,uint256,uint160))',
  /* PLUSIEURS SAUTS : le chemin est un `bytes` (token,espacement,token,espacement,token…) */
  'exactInput((bytes,address,uint256,uint256,uint256))',
  'exactOutput((bytes,address,uint256,uint256,uint256))',
  /* l enchainement de plusieurs appels dans UNE transaction */
  'multicall(bytes[])',
  'multicall(uint256,bytes[])',
  'multicall(bytes32,bytes[])',
  /* NOTRE FRAIS, au bout de la route */
  'sweepTokenWithFee(address,uint256,address,uint256,address)',
  'unwrapWETH9WithFee(uint256,address,uint256,address)',
  /* de quoi payer en ETH natif et recuperer le reste */
  'refundETH()',
  'unwrapWETH9(uint256,address)',
  'wrapETH(uint256)',
  /* ⛔ LE TEMOIN NEGATIF — aucun routeur ne porte ca. S il est « present », l extracteur est casse. */
  'cetteFonctionNExistePas(uint256,address,bytes32)',
];

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(methode, params, essais = 6) {
  for (let i = 0; i < essais; i += 1) {
    try {
      const r = await fetch(RPC, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      if (r.status === 429) { await dors(1200 * (i + 1)); continue; }
      const j = await r.json();
      if (j.error) return { ok: false, err: j.error.message };
      return { ok: true, val: j.result };
    } catch (_) { await dors(800 * (i + 1)); }
  }
  return { ok: false, err: 'NON_MESURE' };
}

/** Tous les PUSH4 du bytecode — la table de dispatch reelle, pas une liste de noms devines.
 *  ⛔ On SAUTE les operandes des PUSH : sinon on lirait des octets de donnees comme des opcodes et
 *    on inventerait des selecteurs qui n existent pas. */
function push4DuBytecode(hex) {
  const b = Buffer.from(hex.slice(2), 'hex');
  const vus = new Set();
  let i = 0;
  while (i < b.length) {
    const op = b[i];
    if (op === 0x63 && i + 4 < b.length) {        /* PUSH4 */
      vus.add('0x' + b.slice(i + 1, i + 5).toString('hex'));
      i += 5; continue;
    }
    if (op >= 0x60 && op <= 0x7f) { i += 1 + (op - 0x5f); continue; }  /* PUSH1..PUSH32 : sauter l operande */
    i += 1;
  }
  return vus;
}

async function main() {
  console.log('SELECTEURS CALCULES (jamais recites) :');
  const table = SIGNATURES.map((s) => ({ sig: s, sel: selecteur(s) }));
  for (const t of table) console.log('  ' + t.sel + '  ' + t.sig);
  console.log('');

  for (const r of ROUTEURS) {
    const code = await rpc('eth_getCode', [r.adr, 'latest']);
    if (!code.ok) { console.log('⛔ ' + r.nom + ' : NON_MESURE (' + code.err + ')'); continue; }
    if (!code.val || code.val === '0x') { console.log('⛔ ' + r.nom + ' : AUCUN BYTECODE'); continue; }
    const vus = push4DuBytecode(code.val);
    console.log('═'.repeat(92));
    console.log(r.nom + '  ' + r.adr);
    console.log('  bytecode : ' + ((code.val.length - 2) / 2) + ' octets · ' + vus.size + ' PUSH4 distincts');
    let nPresents = 0;
    for (const t of table) {
      const present = vus.has(t.sel);
      const estTemoin = t.sig.startsWith('cetteFonctionNExistePas');
      if (present && !estTemoin) nPresents += 1;
      console.log('   ' + (present ? '✓ PRESENT   ' : '·  absent   ') + t.sel + '  '
        + t.sig.slice(0, 62) + (estTemoin ? '   <-- TEMOIN NEGATIF' : ''));
      if (estTemoin && present) {
        console.log('   ⛔⛔ LE TEMOIN NEGATIF EST PRESENT : l extracteur est casse, tout ce tableau est NUL.');
        process.exit(1);
      }
    }
    console.log('  -> ' + nPresents + ' des ' + (table.length - 1) + ' signatures testees dispatchent.');
  }
  console.log('═'.repeat(92));
  console.log('⚠️ BORNE : un selecteur present prouve que le contrat DISPATCHE dessus — pas que');
  console.log('   l appel aboutisse, ni ce que la fonction fait. La presence d un nom n est pas son usage.');
}

main().catch((e) => { console.error('⛔ NON_MESURE :', e.message); process.exit(1); });
