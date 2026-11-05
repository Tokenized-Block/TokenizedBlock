/* keeper-pot.js — decide QUOI faire sur le pot, et prepare la transaction. Il ne signe JAMAIS.
 *
 * ⛔⛔ MAKER / CHECKER, PAS AUTOMATE. Ce keeper propose ; un humain signe. Aucune cle ne passe ici, et
 *    aucune fonction de ce fichier n envoie quoi que ce soit. C est une contrainte du projet, pas une
 *    limitation technique : ce qui deplace de la valeur est signe par une main humaine.
 *
 * ⛔⛔ LE PIEGE QUE CETTE CONTRAINTE CREE, ET QUI EST LA RAISON D ETRE DE `valideJusqua` :
 *    `ouvrirPeriode` REFUSE un debut anterieur au bloc courant. Entre le moment ou on prepare le
 *    calldata et celui ou l humain signe, Base avance d un bloc toutes les 2 secondes. Un debut
 *    calcule a « bloc courant + 5 » serait deja du passe apres dix secondes, et la transaction
 *    reverterait sur DebutDansLePasse — apres que l humain ait paye le gas et cru avoir ouvert.
 *    On prend donc une MARGE genereuse, et on rend la DATE LIMITE de validite du calldata.
 *
 * ⛔ ON N ANCRE JAMAIS SUR UNE RECONSTRUCTION TROUEE. Une racine batie sur des soldes incomplets
 *    paierait les mauvaises adresses, et le contrat ne peut pas s en apercevoir. Le refus est un
 *    resultat a part entiere, avec sa raison.
 */

export const ACTIONS = Object.freeze(['OUVRIR', 'ANCRER', 'ATTENDRE', 'REFUS']);

/** Selecteurs MESURES avec `cast sig` le 2026-09-20, jamais ecrits de memoire. */
export const SELECTEURS = Object.freeze({
  ouvrirPeriode: '0x86457b9b', // ouvrirPeriode(uint64,uint64)
  ancrer: '0x60a7a9c0',        // ancrer(uint256,address,bytes32,bytes32,uint256)
  alimenter: '0xef4a35a3',     // alimenter(uint256,address,uint256)
  alimenterEth: '0x38f980ef',  // alimenterEth(uint256)
  rouler: '0x91dd7f72',        // rouler(uint256,uint256,address)
});

/* ⛔⛔ DENIM (2026-11-05) : Base passe de 2 s a 200 ms/bloc. 300 blocs ne font plus 10 min mais 1 min ; 43 200 blocs plus 24 h mais 2,4 h.
 *     La marge et la duree sont donc des DUREES, converties au temps de bloc MESURE (`sParBloc`, servi par le serveur — temps-de-bloc.js
 *     blocsPour). Non mesure et pas de `config` explicite -> OUVRIR est REFUSE (aucune periode ouverte a 2 s supposees). ANCRER et ATTENDRE
 *     ne dependent pas du temps et restent possibles. */
import { blocsPour, secondesPour, dureeTexte } from './temps-de-bloc.js';
/** Le temps laisse pour signer avant que le debut devienne du passe : 10 minutes. */
export const MARGE_SIGNATURE_S = 600;
/** Duree d une periode : 24 h. */
export const DUREE_PERIODE_S = 86400;
/** ⛔ HISTORIQUE (2 s/bloc) : 300 blocs = 10 min et 43 200 = 24 h AVANT Denim. Plus utilises par defaut ; gardes pour les lecteurs anciens. */
export const MARGE_SIGNATURE = 300;
export const DUREE_PERIODE = 43200;

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdresse = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const motBytes32 = (b) => String(b).replace(/^0x/, '').toLowerCase().padStart(64, '0');

/** Calldata de `ouvrirPeriode(uint64 debut, uint64 fin)`. */
export function calldataOuvrir({ debut, fin }) {
  if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 0 || fin < debut) {
    throw new Error('periode invalide : ' + debut + ' -> ' + fin);
  }
  return SELECTEURS.ouvrirPeriode + mot(debut) + mot(fin);
}

/** Calldata de `ancrer(uint256 id, address jeton, bytes32 graine, bytes32 racine, uint256 total)`. */
export function calldataAncrer({ id, jeton, graine, racine, total }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton))) throw new Error('jeton invalide : ' + jeton);
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(graine))) throw new Error('graine invalide');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(racine))) throw new Error('racine invalide');
  return SELECTEURS.ancrer + mot(id) + motAdresse(jeton) + motBytes32(graine) + motBytes32(racine) + mot(total);
}

/** Calldata de alimenter(uint256 id, address jeton, uint256 montant).
 *  ⛔ RAPPEL : il faut une approbation ERC-20 AVANT, sinon la transaction revert sur le
 *     transferFrom. Le dire ici evite de faire payer un gas perdu pour rien. */
export function calldataAlimenter({ id, jeton, montant }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton))) throw new Error('jeton invalide : ' + jeton);
  if (BigInt(montant) <= 0n) throw new Error('alimenter de zero ne ferait rien');
  return SELECTEURS.alimenter + mot(id) + motAdresse(jeton) + mot(montant);
}

/** Calldata de alimenterEth(uint256 id). Le montant voyage dans la value, pas dans le calldata. */
export function calldataAlimenterEth({ id }) {
  return SELECTEURS.alimenterEth + mot(id);
}

/**
 * Que faut-il faire maintenant ?
 *
 * @param {object} e
 * @param {Array<{id:number, debut:number, fin:number, ancreeLe:number}>} e.periodes
 * @param {number} e.blocCourant
 * @param {object} [e.snapshot]  pour la periode a ancrer : {complet, pourquoi, racine, total, depose, graine, jeton}
 * @param {object} [e.config]    {duree, marge} en BLOCS, explicites (sinon : 24 h et 10 min au temps de bloc mesure)
 * @param {number|null} [e.sParBloc] le temps de bloc MESURE (s) ; null = non mesure
 */
export function prochaineAction({ periodes, blocCourant, snapshot = null, config = {}, sParBloc = null }) {
  const duree = Number.isInteger(config.duree) ? config.duree : blocsPour(DUREE_PERIODE_S, sParBloc);
  const marge = Number.isInteger(config.marge) ? config.marge : blocsPour(MARGE_SIGNATURE_S, sParBloc);
  if (!Number.isInteger(blocCourant) || blocCourant < 0) {
    return { action: 'REFUS', pourquoi: 'bloc courant inconnu — on ne devine pas la tete de chaine' };
  }
  const liste = Array.isArray(periodes) ? periodes : [];

  /* ── 1. UNE PERIODE FINIE ET NON ANCREE PASSE AVANT TOUT ──────────────────────────────────────
   * ⛔ L ordre compte : si on ouvrait d abord, une periode finie resterait non ancree indefiniment et
   *    ses fonds seraient bloques jusqu au roulement. La famine par ordre de branches a deja coute
   *    une journee sur le scan de blocks — on ne la refait pas. */
  const aAncrer = liste.find((p) => p && p.fin < blocCourant && !p.ancreeLe);
  if (aAncrer) {
    if (!snapshot) {
      return { action: 'REFUS', periode: aAncrer.id,
        pourquoi: 'la periode ' + aAncrer.id + ' est finie et attend un ancrage, mais aucun snapshot n a ete fourni' };
    }
    /* ⛔ UNE RECONSTRUCTION TROUEE NE S ANCRE PAS. Le contrat ne peut pas le voir ; nous si. */
    if (!snapshot.complet) {
      return { action: 'REFUS', periode: aAncrer.id,
        pourquoi: 'reconstruction des soldes incomplete : ' + (snapshot.pourquoi || 'raison non dite') };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(snapshot.racine || ''))) {
      return { action: 'REFUS', periode: aAncrer.id, pourquoi: 'racine absente ou mal formee' };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(snapshot.graine || '')) || /^0x0+$/.test(String(snapshot.graine))) {
      return { action: 'REFUS', periode: aAncrer.id,
        pourquoi: 'graine absente ou nulle — le contrat refuserait, et la periode doit etre annulee' };
    }
    const total = BigInt(snapshot.total || 0);
    const depose = BigInt(snapshot.depose || 0);
    /* ⛔ Le contrat refuse total > depose. Le dire ICI evite de faire payer un gas perdu a l humain. */
    if (total > depose) {
      return { action: 'REFUS', periode: aAncrer.id,
        pourquoi: 'l arbre promet ' + total + ' mais le pot ne contient que ' + depose };
    }
    if (total === 0n) {
      return { action: 'REFUS', periode: aAncrer.id,
        pourquoi: 'un arbre a total nul ne paierait personne : ancrer le rendrait definitif pour rien' };
    }
    return {
      action: 'ANCRER',
      periode: aAncrer.id,
      calldata: calldataAncrer({ id: aAncrer.id, jeton: snapshot.jeton, graine: snapshot.graine,
        racine: snapshot.racine, total }),
      /* ⛔ Pas de date limite ici : `ancrer` n a aucune contrainte de bloc au-dela de « periode finie »,
       *    qui reste vraie pour toujours. C est `ouvrirPeriode` qui expire, pas celui-ci. */
      valideJusqua: null,
      resume: 'ancre la periode ' + aAncrer.id + ' sur ' + snapshot.jeton + ' · total ' + total,
    };
  }

  /* ── 2. UNE PERIODE EN COURS : on attend ─────────────────────────────────────────────────────── */
  const enCours = liste.find((p) => p && p.fin >= blocCourant);
  if (enCours) {
    return { action: 'ATTENDRE', periode: enCours.id,
      pourquoi: 'la periode ' + enCours.id + ' court jusqu au bloc ' + enCours.fin,
      blocsRestants: enCours.fin - blocCourant };
  }

  /* ── 3. RIEN EN COURS : on en ouvre une ──────────────────────────────────────────────────────── */
  /* ⛔ DENIM : sans temps de bloc mesure (et sans config explicite), on ne devine pas combien de blocs font 24 h ou 10 min */
  if (duree === null || marge === null) {
    return { action: 'REFUS', pourquoi: 'block time not measured — a round is not opened on an assumed 2 s per block (duration and signing margin are times)' };
  }
  const debut = blocCourant + marge;
  const fin = debut + duree;
  const margeTexte = dureeTexte(secondesPour(marge, sParBloc));
  return {
    action: 'OUVRIR',
    calldata: calldataOuvrir({ debut, fin }),
    debut,
    fin,
    /* ⛔⛔ LA DATE LIMITE EST LE COEUR DE CE FICHIER. Passe ce bloc, `debut` est du passe et la
     *    transaction reverterait sur DebutDansLePasse — apres que l humain ait paye le gas. */
    valideJusqua: debut,
    resume: 'ouvre une periode de ' + duree + ' blocs, du ' + debut + ' au ' + fin
      + ' · A SIGNER AVANT LE BLOC ' + debut + ' (' + (margeTexte ? 'environ ' + margeTexte.replace(/^~/, '') + ' au temps de bloc mesure' : marge + ' blocs') + ')',
  };
}
