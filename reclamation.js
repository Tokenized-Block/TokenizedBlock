/* reclamation.js — ce qu un detenteur peut reclamer, et la transaction pour le faire.
 *
 * ⛔⛔ ON NE SERT JAMAIS UNE PREUVE SANS AVOIR VERIFIE LA RACINE. L arbre est recalcule depuis la
 *    chaine, puis compare a la racine ANCREE dans le contrat. Un desaccord veut dire que l ancrage
 *    ne decrit pas les soldes reels — servir quand meme ferait echouer la reclamation chez
 *    l utilisateur, qui croirait que le probleme vient de lui.
 *
 * ⛔ ET ON NE SIGNE RIEN. On rend une transaction ; le wallet du detenteur l envoie.
 */
import { arbreDUnePeriodeAncree, lirePeriodes, SEL as SEL_BOUCLE } from './boucle-pot.js';
import { feuille, verifierPreuve } from './merkle-pot.js';

/** Selecteurs MESURES avec `cast sig` le 2026-09-20. */
export const SEL = Object.freeze({
  reclamer: '0x353d2544',          // reclamer(uint256,address,uint256,bytes32[])
  pots: '0x32ac8376',              // pots(uint256,address)
  reclame: '0x244526da',           // reclame(uint256,address,address)
  ouverture: '0x91b3da18',         // ouvertureReclamations(uint256)
});

export const ETATS = Object.freeze(['PAYABLE', 'DEJA_RECLAME', 'CONTESTATION', 'RIEN_A_TOI',
  'PAS_ANCREE', 'DESACCORD', 'NON_LU']);

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const mots = (d) => (String(d).replace(/^0x/, '').match(/.{64}/g) || []);

/** Decode `pots(uint256,address)` : racine, total, verse, ancre. */
/**
 * Decode une chaine ABI (le retour de symbol() ou name()).
 * ⛔ REND null PLUTOT QUE DU CHARABIA : afficher 0x4f4b0000… a la place d un symbole donne
 *    l impression d un bug du jeton alors que c est notre decodage qui a echoue.
 */
export function decoderChaine(hex) {
  const d = String(hex || '').replace(/^0x/, '');
  if (d.length < 128) return null;
  let taille;
  try { taille = Number(BigInt('0x' + d.slice(64, 128))); } catch { return null; }
  if (!taille || !Number.isInteger(taille) || taille > 64) return null;
  if (d.length < 128 + taille * 2) return null;
  const oct = d.slice(128, 128 + taille * 2).match(/.{2}/g) || [];
  try { return new TextDecoder().decode(Uint8Array.from(oct.map((h) => parseInt(h, 16)))); }
  catch { return null; }
}

/**
 * Un montant brut rendu lisible, SUIVI du nombre brut.
 *
 * ⛔⛔ LES DECIMALES NE SONT JAMAIS SUPPOSEES. `unite` doit venir d une lecture de decimals().
 *    Supposer 18 sur un jeton a 6 decimales afficherait 1 000 000 000 000 fois trop — quelqu un
 *    croirait avoir gagne une fortune et paierait du gas pour des miettes.
 * ⛔ ET LE BRUT RESTE AFFICHE : c est lui qui est dans la feuille de merkle, donc le seul qui
 *    permette a un detenteur de recalculer et de nous contredire. La lisibilite ne doit pas couter
 *    la verifiabilite.
 *
 * @param {bigint|string|number} montant  le montant brut, tel qu il est dans la feuille
 * @param {{sym:string, dec:number}|null} unite  lu sur le jeton, ou null si illisible
 */
export function montantLisible(montant, unite) {
  const n = String(montant);
  if (!unite || !Number.isInteger(unite.dec) || unite.dec < 0 || unite.dec > 36) {
    return n + ' (raw units — this token decimals could not be read, so no conversion is shown)';
  }
  let v;
  try { v = BigInt(n); } catch { return n + ' (raw units — unreadable amount)'; }
  const base = 10n ** BigInt(unite.dec);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const ent = abs / base;
  const frac = (abs % base).toString().padStart(unite.dec, '0').replace(/0+$/, '');
  const humain = (neg ? '-' : '') + ent.toLocaleString('en-US') + (frac ? '.' + frac.slice(0, 8) : '');
  return humain + ' ' + (unite.sym || 'tokens') + ' (' + n + ' raw)';
}

export function decoderPot(data) {
  const m = mots(data);
  if (m.length < 4) return null;
  return { racine: '0x' + m[0], total: BigInt('0x' + m[1]), verse: BigInt('0x' + m[2]),
    ancre: BigInt('0x' + m[3]) === 1n };
}

/**
 * Calldata de `reclamer(uint256 id, address jeton, uint256 montant, bytes32[] preuve)`.
 * ⛔ Le tableau dynamique vient APRES les quatre mots de tete : offset 0x80, puis longueur, puis
 *    les elements. Se tromper d offset produit un calldata qui revert apres avoir coute du gas.
 */
export function calldataReclamer({ id, jeton, montant, preuve }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton))) throw new Error('jeton invalide : ' + jeton);
  if (!Array.isArray(preuve)) throw new Error('preuve absente');
  for (const p of preuve) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(p))) throw new Error('element de preuve mal forme : ' + p);
  }
  return SEL.reclamer + mot(id) + motAdr(jeton) + mot(montant) + mot(128)
    + mot(preuve.length) + preuve.map((p) => String(p).replace(/^0x/, '').toLowerCase()).join('');
}

/**
 * Ce qu un compte peut reclamer sur une periode ancree.
 * ⛔ SEPT ETATS, chacun nomme. « rien a reclamer » a beaucoup de causes differentes, et les
 *    confondre ferait chercher un bug la ou il n y en a pas — ou l inverse.
 */
export async function etatReclamation({ rpc, pot, periode, jetonHolders, jetonRecompense, compte,
  plancher, maintenant }) {
  /* ⛔ DEUX JETONS, DEUX NOMS — voir preparerAncrage. Les confondre ferait chercher le pot dans la
   *    mauvaise devise et annoncerait « rien a reclamer » a quelqu un a qui on doit de l argent. */
  const jeton = jetonRecompense;
  if (!periode || !periode.ancreeLe) {
    return { etat: 'PAS_ANCREE', pourquoi: 'this round has not been anchored yet' };
  }
  const brutPot = await rpc('eth_call', [{ to: pot, data: SEL.pots + mot(periode.id) + motAdr(jeton) }, 'latest']);
  const infos = decoderPot(brutPot);
  if (!infos) return { etat: 'NON_LU', pourquoi: 'the pot for this round could not be read' };
  if (!infos.ancre) {
    return { etat: 'PAS_ANCREE', pourquoi: 'no root has been anchored for this token on this round' };
  }

  /* ⛔ DEJA PAYE ? On demande au contrat, on ne le deduit pas. */
  const deja = await rpc('eth_call', [{ to: pot,
    data: SEL.reclame + mot(periode.id) + motAdr(jeton) + motAdr(compte) }, 'latest']);
  if (typeof deja === 'string' && deja !== '0x' && BigInt(deja) === 1n) {
    return { etat: 'DEJA_RECLAME', pourquoi: 'this wallet has already claimed this round' };
  }

  /* ⛔ ON RECALCULE L ARBRE ET ON LE CONFRONTE A LA RACINE ANCREE. Sans cette comparaison, on
   *    servirait une preuve qui echouerait chez l utilisateur. */
  const a = await arbreDUnePeriodeAncree({ rpc, pot, periode, jetonHolders, jetonRecompense, plancher,
    racineAncree: infos.racine, totalAncre: infos.total });
  if (!a.ok) {
    /* un desaccord de racine est une chose grave ; une lecture incomplete en est une autre */
    const desaccord = /does not match the anchored root|not what the stored seed/.test(a.pourquoi || '');
    return { etat: desaccord ? 'DESACCORD' : 'NON_LU', pourquoi: a.pourquoi,
      ...(a.racineRecalculee ? { racineRecalculee: a.racineRecalculee, racineAncree: a.racineAncree } : {}) };
  }

  const mien = a.parts.find((p) => p.compte.toLowerCase() === String(compte).toLowerCase());
  if (!mien) {
    return { etat: 'RIEN_A_TOI', cible: a.cible,
      pourquoi: 'this wallet held none of this block at block ' + a.cible + ', outside the market pool' };
  }

  const preuve = a.arbre.preuveDe(mien.compte);
  const f = feuille({ id: periode.id, jeton, compte: mien.compte, montant: mien.montant });
  /* ⛔ ON REJOUE LA PREUVE AVANT DE LA DONNER. Une preuve fausse coute du gas a l utilisateur et lui
   *    fait croire que c est lui le probleme. */
  if (!verifierPreuve({ feuille: f, preuve, racine: infos.racine })) {
    return { etat: 'DESACCORD',
      pourquoi: 'the proof we built does not replay to the anchored root — we will not hand it to you' };
  }

  /* ⛔ LA FENETRE DE CONTESTATION EST UN FAIT DE LA CHAINE, pas une estimation locale. */
  const ouvertureBrute = await rpc('eth_call', [{ to: pot, data: SEL.ouverture + mot(periode.id) }, 'latest']);
  const ouverture = typeof ouvertureBrute === 'string' && ouvertureBrute !== '0x' ? Number(BigInt(ouvertureBrute)) : null;
  if (ouverture !== null && Number.isFinite(maintenant) && maintenant < ouverture) {
    return { etat: 'CONTESTATION', montant: mien.montant, cible: a.cible, ouverture,
      resteSecondes: ouverture - maintenant,
      pourquoi: 'claims open at ' + new Date(ouverture * 1000).toISOString()
        + ' — the challenge window exists so anyone can recompute the root first' };
  }

  return {
    etat: 'PAYABLE',
    montant: mien.montant,
    cible: a.cible,
    ouverture,
    preuve,
    calldata: calldataReclamer({ id: periode.id, jeton, montant: mien.montant, preuve }),
    borne: 'Your share is pro rata of what you held at the drawn block, outside the market pool. '
      + 'The root was recomputed from the chain and matches the one anchored in the contract.',
  };
}

/** Les periodes du pot, telles que la page les lira. */
export async function periodesDuPot({ rpc, pot }) {
  return lirePeriodes({ rpc, pot });
}

export { SEL_BOUCLE };
