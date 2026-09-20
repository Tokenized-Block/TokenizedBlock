/* merkle-pot.js — construire l arbre de recompense que TBlockPot.sol sait verifier.
 *
 * ⛔⛔ CE FICHIER DOIT TOMBER D ACCORD AU BIT PRES AVEC LE CONTRAT. Deux implementations qui
 *    divergeraient donneraient raison a celle qui ment : une racine calculee ici mais refusee
 *    la-bas bloquerait tout le monde, et pire, une racine acceptee pour de mauvaises feuilles
 *    paierait les mauvaises adresses. Les valeurs de reference sont figees dans les tests, prises
 *    sur une execution REELLE du contrat, jamais recopiees d une doc.
 *
 * LA FEUILLE, telle que TBlockPot.feuille la calcule :
 *    keccak256( keccak256( abi.encode(uint256 id, address jeton, address compte, uint256 montant) ) )
 *  - abi.encode de ces quatre-la = quatre mots de 32 octets, les adresses alignees a droite.
 *  - le DOUBLE hachage protege du second-preimage : sans lui, un noeud interne pourrait etre
 *    presente comme une feuille et reclamer ce qu il n a jamais ete.
 *
 * LE NOEUD INTERNE, tel que MerkleProof d OpenZeppelin le calcule :
 *    keccak256(concat(min(a,b), max(a,b)))   — paire TRIEE, donc commutative.
 *  - c est ce qui permet a la preuve de ne porter que des freres, sans indiquer de cote.
 *
 * ⛔ NOMBRE IMPAIR DE FEUILLES : le dernier noeud est REMONTE tel quel, il n est PAS duplique.
 *    Dupliquer une feuille creerait deux chemins valides vers la meme racine — une adresse pourrait
 *    alors prouver deux fois. C est un defaut classique et silencieux.
 */
import { keccak256 } from './keccak.js';

const enHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const octets = (hex) => {
  const h = String(hex).replace(/^0x/, '');
  const u = new Uint8Array(h.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return u;
};
const motNombre = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdresse = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const h = (hex) => enHex(keccak256(octets(hex)));

/** La feuille d un beneficiaire. Meme formule que TBlockPot.feuille. */
export function feuille({ id, jeton, compte, montant }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton))) throw new Error('jeton invalide : ' + jeton);
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte))) throw new Error('compte invalide : ' + compte);
  const encode = '0x' + motNombre(id) + motAdresse(jeton) + motAdresse(compte) + motNombre(montant);
  return h(h(encode)); /* double hachage : anti second-preimage */
}

/** Un noeud interne : paire TRIEE, comme MerkleProof. */
export function noeud(a, b) {
  const [x, y] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return h('0x' + x.replace(/^0x/, '') + y.replace(/^0x/, ''));
}

/**
 * Construit l arbre.
 * @param {Array<{compte:string, montant:bigint|string|number}>} parts
 * @returns {{racine:string, total:bigint, feuilles:string[], niveaux:string[][], preuveDe:(compte:string)=>string[]}}
 */
export function construireArbre({ id, jeton, parts }) {
  const propres = [];
  const vus = new Set();
  for (const p of parts || []) {
    const compte = String(p && p.compte || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(compte)) continue;
    const montant = BigInt(p.montant);
    if (montant <= 0n) continue;
    /* ⛔ UN COMPTE EN DOUBLE EST UN REFUS, PAS UNE FUSION : fusionner en silence changerait le
     *    montant que la personne a lu ailleurs, et personne ne saurait pourquoi. */
    if (vus.has(compte)) throw new Error('compte en double dans l arbre : ' + compte);
    vus.add(compte);
    propres.push({ compte, montant });
  }
  if (!propres.length) throw new Error('aucune part a distribuer');
  /* ⛔ ORDRE DETERMINISTE : sans lui, deux constructions des memes donnees donneraient deux racines,
   *    et personne ne pourrait nous verifier. */
  propres.sort((a, b) => (a.compte < b.compte ? -1 : a.compte > b.compte ? 1 : 0));

  const feuilles = propres.map((p) => feuille({ id, jeton, compte: p.compte, montant: p.montant }));
  const niveaux = [feuilles];
  let courant = feuilles;
  while (courant.length > 1) {
    const suivant = [];
    for (let i = 0; i < courant.length; i += 2) {
      /* ⛔ Le dernier impair REMONTE TEL QUEL. Le dupliquer creerait deux chemins vers la racine. */
      suivant.push(i + 1 < courant.length ? noeud(courant[i], courant[i + 1]) : courant[i]);
    }
    niveaux.push(suivant);
    courant = suivant;
  }
  const racine = courant[0];
  const total = propres.reduce((s, p) => s + p.montant, 0n);
  const indexDe = new Map(propres.map((p, i) => [p.compte, i]));

  const preuveDe = (compte) => {
    const c = String(compte).toLowerCase();
    if (!indexDe.has(c)) throw new Error('ce compte n est pas dans l arbre : ' + c);
    let i = indexDe.get(c);
    const preuve = [];
    for (let n = 0; n < niveaux.length - 1; n++) {
      const frere = i % 2 === 0 ? i + 1 : i - 1;
      /* pas de frere = ce noeud a ete remonte tel quel : rien a ajouter a la preuve */
      if (frere < niveaux[n].length) preuve.push(niveaux[n][frere]);
      i = Math.floor(i / 2);
    }
    return preuve;
  };

  return { racine, total, feuilles, niveaux, parts: propres, preuveDe };
}

/** Rejoue une preuve comme le ferait MerkleProof. ⛔ Sert a se contredire soi-meme AVANT la chaine. */
export function verifierPreuve({ feuille: f, preuve, racine }) {
  let calcule = f;
  for (const p of preuve || []) calcule = noeud(calcule, p);
  return calcule.toLowerCase() === String(racine).toLowerCase();
}
