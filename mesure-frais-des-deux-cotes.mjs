/* mesure-frais-des-deux-cotes.mjs — NOS DEUX FRAIS, LUS SUR LA CHAINE, PAS DANS LES COMMENTAIRES.
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE MESURE. Phil montre `thestonks.exchange` : « Your cut 0.70% of every
 *     trade », frais pris dans la POOL (Aerodrome, fee tier 1 %), donc sur CHAQUE echange quelle que
 *     soit l interface. J ai d abord repondu que notre 0,5 % etait un frais d INTERFACE, donc
 *     percu seulement via notre UI.
 *   ⛔ C ETAIT INCOMPLET, ET UNE REPONSE INCOMPLETE ICI COUTE UN CHANTIER ENTIER : on a DEUX frais.
 *       1. `FRAIS_INTERFACE_BPS = 50` dans `echange.js` — pris dans NOTRE transaction, via
 *          `ACTIONS_V4.TAKE_PORTION`. Interface seulement. C est ce que j avais nomme.
 *       2. `HOOK_FEE()` du hook V8, qui est DANS LA PoolKey — donc applique a tout swap qui passe
 *          par la pool, aggregator compris. C est deja le modele « pool-level » de stonks.
 *     Construire un frais de pool « comme eux » reviendrait a rebatir ce qui tourne deja.
 *
 * ⛔ CETTE SONDE NE CROIT AUCUN COMMENTAIRE DU DEPOT. Les taux sont lus par `eth_call` sur Base.
 *   Un commentaire perime ment aussi longtemps qu on le lit — ce depot en a deja fait l experience
 *   (le V6 est reste « pas encore deploye » un jour apres sa transaction).
 *
 * ⚠️ CE QU ELLE NE PEUT PAS DIRE :
 *   · combien ces frais RAPPORTENT. Un taux n est pas un revenu ; il faut le volume, et le volume
 *     se lit ailleurs (`/api/entonnoir`, et les encaissements du wallet).
 *   · si les deux frais se CUMULENT sur un achat fait chez nous. Ca demande un swap reel, et le
 *     harnais interdit de signer.
 *   · ce que fait un hook qui ne publie pas `HOOK_FEE()`. Un revert n est pas un zero.
 */
import { readFileSync } from 'node:fs';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } =
  await import('./tokenomics.js');

/* ⛔⛔ LE SELECTEUR EST IMPORTE, PAS REECRIT — et ma premiere version de cette sonde a prouve
 *     pourquoi, en direct. J avais ecrit `'0x' + keccak256(bytes).slice(0, 8)` : `keccak256` rend un
 *     Uint8Array, donc la concatenation a produit `0x26,68,29,207,130,251,131,131` — un tableau
 *     d octets joint par des virgules. Le noeud a repondu « Invalid params » pour les HUIT hooks, et
 *     ma sonde a imprime huit fois « taux NON LU ». J allais publier « aucun de nos hooks ne publie
 *     son taux », qui est FAUX de bout en bout.
 *   ⛔ Elle ne l a dit que parce qu elle IMPRIME SON PROPRE SELECTEUR avant de s en servir : un
 *     instrument doit s accuser lui-meme en premier. On garde donc cette ligne.
 *   ⛔ ET LA VRAIE CAUSE EST PIRE QUE LE BUG : `selecteur` EXISTE, exporte par `keccak.js`, et
 *     utilise par `mesure-rails-suite.mjs`. Je m en suis ecrit une copie faible a cote — le motif
 *     `canonical-helper-weaker-copy`, commis le jour ou je le citais. */
import { selecteur } from './keccak.js';
const SEL_FEE = selecteur('HOOK_FEE()');

/* ⛔ ON RESPIRE ENTRE DEUX LECTURES. Le noeud public a repondu « over rate limit » sur la moitie des
 *   hooks au premier essai : envoyees d affilee, une partie des reponses aurait ete des refus, et un
 *   refus s affiche exactement comme une fonction absente. */
const souffler = (ms = 400) => new Promise((r) => setTimeout(r, ms));
/* ⛔⛔ ON REESSAIE SUR ETRANGLEMENT, ET SEULEMENT SUR ETRANGLEMENT. Premiere execution : V6, V7 et V8
 *     sont tombes sur « over rate limit » — et V8 est PRECISEMENT le hook qui porte le 0,5 %. Une
 *     sonde qui laisse sa question centrale non lue vaut moins que pas de sonde : on aurait retenu
 *     « non lu » pour le seul chiffre qui decide.
 *   ⛔ On ne reessaie PAS un `execution reverted` : celui-la est une reponse du contrat, pas un
 *     refus du noeud. Les confondre ferait boucler sur un hook qui n a simplement pas la fonction. */
async function appel(to, data, essais = 4) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
    const j = await r.json();
    if (!j.error) return { resultat: j.result };
    const msg = j.error.message || String(j.error.code);
    if (!/rate limit|too many|429/i.test(msg) || i === essais - 1) return { erreur: msg, essais: i + 1 };
    await souffler(1200 * (i + 1));
  }
  return { erreur: 'inatteignable' };
}

console.log('═══ NOS DEUX FRAIS, LUS SUR LA CHAINE ═══\n');
console.log('selecteur HOOK_FEE() calcule : ' + SEL_FEE + '\n');

const hooks = [['V1/PREVU', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4],
  ['V5', HOOK_V5], ['V6', HOOK_V6], ['V7', HOOK_V7], ['V8', HOOK_V8]];

console.log('── 1. LE FRAIS DE POOL (hook dans la PoolKey — s applique a TOUT swap) ──');
for (const [nom, adr] of hooks) {
  if (!adr) { console.log('  ' + nom.padEnd(9) + ' adresse absente du module'); continue; }
  await souffler();
  const r = await appel(adr, SEL_FEE);
  if (r.erreur) {
    /* ⛔ UN REVERT N EST PAS UN ZERO. Le V1 ne publie pas son taux : ecrire 0 % ici ferait croire
     *   a une pool gratuite, alors que ses 5 marches sont enfermes a 3 % POUR TOUJOURS. */
    console.log('  ' + nom.padEnd(9) + adr + '  HOOK_FEE() NE REPOND PAS (' + r.erreur.slice(0, 40) + ') — taux NON LU, pas zero');
    continue;
  }
  if (!r.resultat || r.resultat === '0x') {
    console.log('  ' + nom.padEnd(9) + adr + '  reponse vide — taux NON LU, pas zero');
    continue;
  }
  const brut = BigInt(r.resultat);
  console.log('  ' + nom.padEnd(9) + adr + '  HOOK_FEE = ' + brut + ' / 1e6 = '
    + (Number(brut) / 1e6 * 100).toFixed(3) + ' %');
}

/* ⛔⛔ LA PART DU CREATEUR — DEUX SOURCES DU DEPOT SE CONTREDISENT, ET C EST LE CHIFFRE QUI DECIDE.
 *     `tokenomics.js` dit du V7 : « 100 % du frais va au wallet. La part du createur est SUPPRIMEE ».
 *     `deploy-v7.json` ET `deploy-v8.json` disent : "dimeCreateurPourCent": 20.
 *     Un createur exterieur qui compare TBLOCK a un concurrent affichant « your cut 0.70% » lirait
 *     l une ou l autre. On ne tranche ni par le commentaire ni par le manifeste : par la chaine.
 *   ⛔ ET UN REVERT SERAIT UNE REPONSE, PAS UN ZERO : un hook sans `dime()` ne prouve pas que la
 *     part vaut zero, il prouve qu on ne l a pas lue. */
console.log('\n── 1bis. LA PART DU CREATEUR (`dime()`), LUE SUR LA CHAINE ──');
/* ⛔⛔ CE SELECTEUR EST LU DANS LE MANIFESTE DE DEPLOIEMENT, PAS CALCULE — et ma premiere version a
 *     montre pourquoi. J avais ecrit `selecteur('dime()')` = `0x30793036` en supposant le nom de la
 *     fonction ; le manifeste, lui, enregistre `0xfabd2365`, mesure au deploiement. Les trois hooks
 *     ont repondu « execution reverted » et ma sonde a imprime « NON LU » — j allais conclure que la
 *     part creatrice est illisible on-chain, alors que je frappais a une porte qui n existe pas.
 *   ⛔ UN SELECTEUR SE COPIE, IL NE SE DEVINE PAS A PARTIR D UN NOM QU ON CROIT CONNAITRE. */
const manifeste = JSON.parse(readFileSync(new URL('./deploy-v8.json', import.meta.url), 'utf8'));
const SEL_DIME = manifeste.selecteurs && manifeste.selecteurs.dime;
const SEL_WALLET = manifeste.selecteurs && manifeste.selecteurs.feeWallet;
if (!SEL_DIME || !SEL_WALLET) { console.log('  ⛔ selecteurs absents du manifeste : je ne les devine pas.'); }
console.log('  selecteurs LUS dans deploy-v8.json : dime ' + SEL_DIME + ' · feeWallet ' + SEL_WALLET);
console.log('  ⚠️ calcule a tort par `selecteur(\'dime()\')` : ' + selecteur('dime()') + ' — le nom suppose etait faux');
for (const [nom, adr] of [['V6', HOOK_V6], ['V7', HOOK_V7], ['V8', HOOK_V8]]) {
  await souffler();
  const d = await appel(adr, SEL_DIME);
  if (d.erreur || !d.resultat || d.resultat === '0x') {
    console.log('  ' + nom + ' dime() : NON LU (' + String(d.erreur || 'reponse vide').slice(0, 40) + ') — pas zero');
  } else {
    const v = BigInt(d.resultat);
    console.log('  ' + nom + ' dime() = ' + v + '  ⇒ part creatrice = ' + (Number(v)) + ' % du frais'
      + (v === 0n ? '  (AUCUNE part creatrice)' : ''));
  }
  await souffler();
  const w = await appel(adr, SEL_WALLET);
  if (!w.erreur && w.resultat && w.resultat !== '0x') {
    console.log('  ' + nom + ' feeWallet() = 0x' + w.resultat.slice(-40));
  }
}

console.log('\n── 2. LE FRAIS D INTERFACE (notre transaction seulement) ──');
const ech = readFileSync(new URL('./echange.js', import.meta.url), 'utf8');
const m = /FRAIS_INTERFACE_BPS\s*=\s*(\d+)/.exec(ech.replace(/\/\*[\s\S]*?\*\//g, ' '));
console.log(m ? '  FRAIS_INTERFACE_BPS = ' + m[1] + ' = ' + (Number(m[1]) / 100).toFixed(2) + ' %'
  : '  ⛔ FRAIS_INTERFACE_BPS introuvable dans echange.js');
console.log('  ⛔ pris via ACTIONS_V4.TAKE_PORTION dans la transaction que NOUS construisons :');
console.log('     un achat fait sur un aggregator ne le paie pas.');

console.log('\n── LE VERDICT SUR LA CONTRADICTION ──');
console.log('⛔⛔ `tokenomics.js` dit du V7 : « 100 % du frais va au wallet. La part du createur est');
console.log('    SUPPRIMEE. » La CHAINE dit `dime() = 20` sur V6, V7 ET V8. Le commentaire est');
console.log('    contredit par le contrat qu il decrit.');
console.log('⚠️ ET SON ARITHMETIQUE NE TIENT PAS NON PLUS : le meme commentaire annonce « +50 % »');
console.log('    de gain. Supprimer une part de 20 % fait passer notre prise de 80 % a 100 %, soit');
console.log('    +25 %. Un +50 % correspondrait a une part de 33 %.');
console.log('⛔ CE QUE CETTE LECTURE PROUVE, ET SA BORNE EXACTE : que `dime()` RETOURNE 20. Elle ne');
console.log('    prouve PAS que le hook APPLIQUE cette part au partage — un getter peut survivre a');
console.log('    la logique qui le lisait. La source des hooks n est pas dans le depot, donc seule');
console.log('    une trace de versement a un createur le trancherait.');
console.log('⇒ TANT QUE CE N EST PAS TRANCHE, AUCUN DES DEUX CHIFFRES NE SE PUBLIE. Dire « 0 % au');
console.log('    createur » ou « 20 % au createur » a un createur exterieur serait une affirmation');
console.log('    non mesuree, dans les deux sens.');

console.log('\n── CE QUE CETTE SONDE NE DIT PAS ──');
console.log('⛔ Le REVENU. Un taux n est pas un encaissement : il faut du volume, et il se lit');
console.log('   ailleurs. Mesure du depot au 2026-09-21 : 14 jours, 39 encaissements, dont 20 en');
console.log('   jetons qui DORMENT (non vendus).');
console.log('⛔ Si les deux frais se CUMULENT sur un achat fait chez nous : ca demande un swap reel.');
/* ⛔ CETTE LIGNE REPETAIT L AFFIRMATION QUE LA SONDE VENAIT DE REFUTER — je l avais ecrite avant
 *   de mesurer, et elle a survecu a la mesure. Une sonde qui se contredit dans sa propre sortie est
 *   pire qu absente : le lecteur choisit la moitie qui l arrange. */
console.log('⛔ Ce que touche VRAIMENT le createur : NON TRANCHE (voir le verdict ci-dessus).');
console.log('   Si `dime()` est applique, un createur touche 20 % de 0,5 % = 0,10 % par echange ;');
console.log('   le concurrent mesure affiche 0,700 %. Sept fois plus. Mais le « si » est entier.');
