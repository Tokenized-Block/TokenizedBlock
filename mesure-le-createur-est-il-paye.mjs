/* mesure-le-createur-est-il-paye.mjs — `dime()` REND 20. LE HOOK LE VERSE-T-IL VRAIMENT ?
 *
 * ⛔⛔ LA QUESTION EST RESTEE OUVERTE TOUTE LA JOURNEE, ET ELLE PORTE SUR L ARGENT.
 *     `tokenomics.js` affirmait que le V7 avait SUPPRIME la part du createur. La chaine dit
 *     `dime() = 20` sur le V6, le V7 ET le V8 (selecteur `0xfabd2365`, LU dans `deploy-v8.json`).
 *     Le commentaire a ete corrige — mais un GETTER N EST PAS UN VERSEMENT. Un accesseur peut
 *     survivre a la logique qui le lisait : il rendrait 20 sans que personne ne touche rien.
 *   ⇒ La seule preuve est une TRANSACTION. Si la part creatrice est appliquee, la transaction qui
 *     paie a6cf doit AUSSI transferer a quelqu un d autre, dans le meme jeton, le meme bloc.
 *
 * COMMENT ON TRANCHE :
 *   1. on retrouve des transferts de jetons VERS a6cf (le wallet de frais) ;
 *   2. pour chacun, on relit la transaction entiere et on cherche les AUTRES transferts du MEME
 *      jeton vers d autres adresses ;
 *   3. s il y en a, on compare le rapport au 20 % annonce.
 *
 * ⛔ CE QU UN « NON » NE VOUDRA PAS DIRE : que la part n existe pas. Elle pourrait etre versee
 *   ailleurs, plus tard, ou par un autre chemin. Un seul echantillon ne ferme pas la question — et
 *   le nombre d echantillons est affiche pour qu on sache ce que le verdict pese.
 * ⛔ ET UN « OUI » NE DIRA PAS QUE C EST 20 % : il faudra que le RAPPORT tombe juste. Un transfert
 *   voisin peut etre tout autre chose (un swap, un remboursement, une route).
 *
 * ⚠️ LECTURE SEULE. Aucune signature.
 */
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
/* ⛔ `selecteur` de keccak.js rend AVEC le prefixe ; celui de pool.js SANS. Deux homonymes aux
 *   conventions opposees — ca m a deja coute seize « Invalid params » aujourd hui. */
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const TOPIC_TRANSFER = '0x' + 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const adrDeTopic = (t) => '0x' + String(t).slice(26).toLowerCase();

const souffler = (ms = 220) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 4) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429|limited/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(900 * (i + 1));
  }
}

console.log('═══ LE CREATEUR EST-IL PAYE ? ═══\n');
console.log('  topic Transfer : ' + TOPIC_TRANSFER);
console.log('  wallet de frais : ' + A6CF + '\n');

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
/* ⛔ 2000 blocs par fenetre : au-dela le noeud public refuse, et un refus se lit comme un vide. */
const PAS = 2000, FENETRES = Number(process.env.TB_FENETRES || 150);
const recus = [];
let lues = 0, ratees = 0;
for (let i = 0; i < FENETRES && recus.length < 12; i++) {
  const fin = tete - i * PAS, debut = fin - PAS + 1;
  try {
    await souffler();
    const logs = await rpc('eth_getLogs', [{ fromBlock: '0x' + debut.toString(16), toBlock: '0x' + fin.toString(16),
      topics: [TOPIC_TRANSFER, null, '0x'.padEnd(26, '0') + A6CF.slice(2)] }]);
    lues++;
    for (const l of logs || []) recus.push({ tx: l.transactionHash, jeton: String(l.address).toLowerCase(),
      de: adrDeTopic(l.topics[1]), montant: BigInt(l.data || '0x0') });
  } catch (e) { ratees++; }
}
console.log('── 1. transferts de jetons VERS le wallet de frais ──');
console.log('  fenetres lues : ' + lues + '/' + FENETRES + ' (ratees ' + ratees + ')  ~'
  + ((lues * PAS * 2) / 3600).toFixed(1) + ' h de chaine');
console.log('  transferts trouves : ' + recus.length);
if (!recus.length) {
  /* ⛔ UN ZERO QUI NE PEUT PAS MONTER RESSEMBLE A UN ZERO DE SUCCES. Ici il dit seulement qu aucun
   *   frais en jeton n est tombe sur la fenetre — pas que la part creatrice n existe pas. */
  console.log('  ⛔ AUCUN sur cette fenetre : cette sonde NE PEUT PAS trancher.');
  console.log('    Ce zero ne dit RIEN de `dime()` — il dit que le wallet n a rien recu en jeton ici.');
  process.exitCode = 2;
  process.exit();
}

console.log('\n── 2. LA PREUVE : la MEME transaction paie-t-elle quelqu un d autre ? ──');
let avecVoisin = 0, sansVoisin = 0, masse = 0;
const vues = new Set();
for (const r of recus) {
  if (vues.has(r.tx)) continue;
  vues.add(r.tx);
  await souffler();
  let rec;
  try { rec = await rpc('eth_getTransactionReceipt', [r.tx]); } catch (e) { console.log('  ' + r.tx + ' : receipt NON LU'); continue; }
  const memeJeton = (rec.logs || []).filter((l) => String(l.address).toLowerCase() === r.jeton
    && (l.topics || [])[0] === TOPIC_TRANSFER);
  const autres = memeJeton.filter((l) => adrDeTopic(l.topics[2]) !== A6CF);
  console.log('  tx ' + r.tx.slice(0, 18) + '…  jeton ' + r.jeton.slice(0, 10) + '…'
    + '  a6cf recoit ' + r.montant + '  ·  ' + autres.length + ' autre(s) destinataire(s) du meme jeton');
  /* ⛔⛔ UNE DISTRIBUTION DE MASSE N EST PAS UN FRAIS, ET C EST LA MESURE QUI L A MONTRE. Le premier
   *     passage a trouve 199, 394 et 199 autres destinataires du MEME jeton dans la meme
   *     transaction — et, dans un cas, TOUS recevant exactement le meme montant que le wallet.
   *     C est la signature d un airdrop : le wallet y est un destinataire parmi des centaines, pas
   *     le beneficiaire d un prelevement.
   *   ⇒ Les compter comme des versements de frais aurait fait croire a un revenu qui n existe pas.
   *     Le seuil est bas (20) et il est DIT : un frais partage entre le wallet et un createur a
   *     DEUX destinataires, pas deux cents. */
  const SEUIL_MASSE = 20;
  const memeMontant = autres.filter((a) => BigInt(a.data || '0x0') === r.montant).length;
  if (autres.length >= SEUIL_MASSE) {
    console.log('      ⇒ DISTRIBUTION DE MASSE (' + autres.length + ' destinataires, dont '
      + memeMontant + ' au montant IDENTIQUE) — ce n est pas un frais, c est un airdrop.');
    masse++;
    continue;
  }
  if (!autres.length) { sansVoisin++; continue; }
  avecVoisin++;
  for (const a of autres.slice(0, 3)) {
    const m = BigInt(a.data || '0x0');
    const total = r.montant + m;
    /* ⛔ LE RAPPORT DECIDE, PAS LA PRESENCE. Un transfert voisin peut etre un swap, une route, un
     *   remboursement. Seul un 20/80 fait de lui une part creatrice. */
    const part = total > 0n ? Number((m * 10000n) / total) / 100 : null;
    console.log('      -> ' + adrDeTopic(a.topics[2]).slice(0, 12) + '…  ' + m
      + (part === null ? '' : '  (' + part.toFixed(2) + ' % du couple)'));
  }
}

console.log('\n── VERDICT ──');
console.log('  transactions examinees : ' + vues.size);
console.log('  avec un autre destinataire du meme jeton : ' + avecVoisin);
console.log('  sans aucun autre destinataire            : ' + sansVoisin);
if (avecVoisin === 0 && masse > 0) {
  console.log('  ⛔⛔ AUCUN FRAIS TROUVE DU TOUT sur cette fenetre : les ' + masse + ' transfert(s) recus');
  console.log('    sont des distributions de masse. Le wallet y est un destinataire parmi des');
  console.log('    centaines — ce n est pas du revenu, c est du bruit qui arrive dessus.');
  console.log('    ⇒ La question « le createur est-il paye ? » reste OUVERTE : on n a pas vu un seul');
  console.log('      versement de frais a examiner.');
} else if (avecVoisin === 0) {
  console.log('  ⛔ AUCUN versement voisin sur cet echantillon : rien ici ne ressemble a une part');
  console.log('    creatrice appliquee. ⚠️ Mais ' + vues.size + ' transaction(s) ne ferment pas la');
  console.log('    question — la part pourrait etre versee ailleurs, plus tard, ou autrement.');
} else {
  console.log('  ⚠️ Des versements voisins existent. Regarder les POURCENTAGES ci-dessus : seul un');
  console.log('    rapport proche de 20/80 en fait une part creatrice. Tout le reste est autre chose.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : ce que fait le hook en interne. Elle lit des');
console.log('   transferts, pas du code — la source des hooks n est pas dans ce depot.');
