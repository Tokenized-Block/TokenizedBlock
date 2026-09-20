/* boucle-pot.js — le cycle complet d une periode de recompense, de la chaine a la transaction a signer.
 *
 * ⛔⛔ ELLE NE SIGNE JAMAIS. Elle lit, elle decide, elle reconstruit, elle VERIFIE, et elle rend une
 *    transaction que la main de Phil enverra. Aucune cle ne passe ici.
 *
 * LE CYCLE :
 *   1. lire les periodes du pot sur la chaine
 *   2. decider (keeper-pot.prochaineAction) : ouvrir / attendre / ancrer / refuser
 *   3. pour ancrer : lire la GRAINE du bloc de fin, calculer la CIBLE, reconstruire les soldes
 *      AU BLOC CIBLE, exclure la pool, batir l arbre de merkle
 *   4. rendre le calldata, l arbre et les preuves
 *
 * ⛔ CHAQUE ETAPE PEUT REFUSER, ET DIT POURQUOI. Un cycle qui « ne fait rien » sans expliquer se lit
 *    comme un cycle qui a fini. Ici, ATTENDRE et REFUS sont deux resultats differents, chacun nomme.
 *
 * ⛔ ET ON RE-VERIFIE CE QU ON VIENT DE CONSTRUIRE : chaque preuve est rejouee jusqu a la racine AVANT
 *    de proposer l ancrage. Une preuve fausse ne se decouvrirait sinon qu au moment ou un detenteur
 *    essaie de reclamer — apres que la racine soit gravee pour toujours.
 */
import { prochaineAction, calldataAlimenter, calldataAlimenterEth } from './keeper-pot.js';
import { blocDeSnapshot } from './regle-snapshot.js';
import { naissanceDuJeton, soldesAuBloc } from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';
import { construireArbre, feuille, verifierPreuve } from './merkle-pot.js';

export const SEL = Object.freeze({
  nombreDePeriodes: '0x8f688a3f',
  periodes: '0x2fe7fb4e',
  depose: '0x721da62e',
});

const hex = (n) => '0x' + Number(n).toString(16);
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdresse = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const mots = (data) => (String(data).replace(/^0x/, '').match(/.{64}/g) || []);

/** Decode le getter public `periodes(uint256)` : cinq mots (debut, fin, ancreeLe, cible, graine). */
export function decoderPeriode(data, id) {
  const m = mots(data);
  if (m.length < 5) return null;
  return {
    id,
    debut: Number(BigInt('0x' + m[0])),
    fin: Number(BigInt('0x' + m[1])),
    ancreeLe: Number(BigInt('0x' + m[2])),
    cible: Number(BigInt('0x' + m[3])),
    graine: '0x' + m[4],
  };
}

/** Lit toutes les periodes du pot. ⛔ Une lecture ratee rend `null`, jamais une liste amputee. */
export async function lirePeriodes({ rpc, pot }) {
  const n = await rpc('eth_call', [{ to: pot, data: SEL.nombreDePeriodes }, 'latest']);
  if (typeof n !== 'string' || n === '0x') return null;
  const combien = Number(BigInt(n));
  const liste = [];
  for (let i = 0; i < combien; i++) {
    const d = await rpc('eth_call', [{ to: pot, data: SEL.periodes + mot(i) }, 'latest']);
    const p = decoderPeriode(d, i);
    /* ⛔ Une periode illisible fait echouer TOUT le tour : decider sur une liste trouee ferait
     *    ouvrir une periode alors qu une autre attend son ancrage. */
    if (!p) return null;
    liste.push(p);
  }
  return liste;
}

export async function lireDepose({ rpc, pot, id, jeton }) {
  const d = await rpc('eth_call', [{ to: pot, data: SEL.depose + mot(id) + motAdresse(jeton) }, 'latest']);
  return typeof d === 'string' && d !== '0x' ? BigInt(d) : null;
}

/**
 * Prepare tout ce qu il faut pour ancrer une periode finie : graine, cible, soldes AU BLOC CIBLE,
 * parts, arbre et preuves.
 * ⛔ Rend un objet avec `complet: false` et SA raison des qu une seule etape ne tient pas. Le keeper
 *    refusera alors d ancrer -- c est la chaine de refus qui protege l argent, pas un seul garde.
 */
export async function preparerAncrage({ rpc, pot, periode, jetonHolders, jetonRecompense, plancher }) {
  /* ⛔⛔ DEUX CHOSES DIFFERENTES, DEUX NOMS. Elles n en avaient qu un, et la mesure du 2026-09-20 l a
   *    prouve : depose[0][ETH] = 300 000 000 000 000 wei, depose[0][OK] = 0. Un seul parametre aurait
   *    fait refuser l ancrage avec « le pot est vide » alors que l argent etait la, dans l autre
   *    devise.
   * ⛔ AUCUNE VALEUR PAR DEFAUT : faire retomber la recompense sur le jeton des holders reproduirait
   *    le bug en silence. Un parametre manquant est un refus NOMME. */
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jetonHolders || ''))) {
    return { complet: false, pourquoi: 'jetonHolders manquant : on ne sait pas QUI detient' };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jetonRecompense || ''))) {
    return { complet: false, pourquoi: 'jetonRecompense manquant : on ne sait pas EN QUOI on paie' };
  }
  /* 1. LA GRAINE : le prevRandao du bloc de FIN, lu sur la chaine. */
  const blocFin = await rpc('eth_getBlockByNumber', [hex(periode.fin), false]);
  const graine = blocFin && blocFin.mixHash;
  const tirage = blocDeSnapshot({ debut: periode.debut, fin: periode.fin, graine });
  if (tirage.etat !== 'TIRE') {
    return { complet: false, pourquoi: 'tirage impossible : ' + (tirage.pourquoi || tirage.etat) };
  }

  /* 2. LES SOLDES AU BLOC TIRE — jamais a la tete de chaine. */
  const naissance = await naissanceDuJeton({ rpc, jeton: jetonHolders, depuis: plancher, jusqua: tirage.cible });
  if (naissance === null) {
    return { complet: false, cible: tirage.cible, pourquoi: 'naissance du jeton introuvable avant le bloc tire' };
  }
  const s = await soldesAuBloc({ rpc, jeton: jetonHolders, naissance, auBloc: tirage.cible });
  if (s.etat !== 'COMPLET') {
    return { complet: false, cible: tirage.cible, pourquoi: s.pourquoi || 'reconstruction incomplete' };
  }

  /* 3. LES PARTS, pool exclue. */
  /* ⛔ LE POT SE LIT DANS LA DEVISE DE RECOMPENSE, pas dans le jeton des holders. */
  const depose = await lireDepose({ rpc, pot, id: periode.id, jeton: jetonRecompense });
  if (depose === null) return { complet: false, cible: tirage.cible, pourquoi: 'depot du pot illisible' };
  const parts = partsHolders({ soldes: [...s.soldes.entries()], pot: depose });
  if (parts.etat !== 'PAYABLE') {
    return { complet: false, cible: tirage.cible, depose,
      pourquoi: parts.etat === 'AUCUN_DETENTEUR'
        ? 'personne ne detient ce block hors de sa pool au bloc ' + tirage.cible
        : 'rien a partager : le pot de la periode est vide' };
  }

  /* 4. L ARBRE, ET LA RE-VERIFICATION DE CHAQUE PREUVE. */
  /* ⛔ LA FEUILLE PORTE LA DEVISE DE RECOMPENSE : c est elle que le contrat verifie dans reclamer. */
  const arbre = construireArbre({ id: periode.id, jeton: jetonRecompense,
    parts: parts.parts.map((p) => ({ compte: p.adr, montant: p.montant })) });
  const preuves = [];
  for (const p of arbre.parts) {
    const f = feuille({ id: periode.id, jeton: jetonRecompense, compte: p.compte, montant: p.montant });
    const preuve = arbre.preuveDe(p.compte);
    /* ⛔ ON REJOUE CE QU ON VIENT DE CONSTRUIRE. Une preuve fausse ne se decouvrirait sinon qu au
     *    moment ou un detenteur tente de reclamer -- apres que la racine soit gravee pour toujours. */
    if (!verifierPreuve({ feuille: f, preuve, racine: arbre.racine })) {
      return { complet: false, cible: tirage.cible,
        pourquoi: 'une preuve ne se rejoue pas jusqu a la racine (' + p.compte + ') — on n ancre pas' };
    }
    preuves.push({ compte: p.compte, montant: p.montant.toString(), preuve });
  }

  return {
    complet: true,
    jeton: jetonRecompense,
    jetonHolders,
    graine,
    cible: tirage.cible,
    naissance,
    depose,
    racine: arbre.racine,
    total: arbre.total,
    preuves,
    horsBase: parts.baseExclue,
    borne: 'Balances read AT the drawn block, not at chain head. The market pool and our own contracts '
      + 'are excluded by a named list. Every proof was replayed to the root before proposing this anchor.',
  };
}

/**
 * Recalcule l arbre d une periode DEJA ANCREE, et le confronte a ce que le contrat a grave.
 *
 * ⛔⛔ C EST LA FONCTION QUI PERMET DE NOUS CONTREDIRE. Elle refait le tirage depuis la graine
 *    stockee et le compare a la cible stockee ; puis elle refait l arbre et compare sa racine a
 *    la racine ancree. Un desaccord signifie que l ancrage ne decrit pas les soldes reels — et
 *    c est precisement ce que le delai de contestation existe pour attraper.
 * ⛔ EN CAS DE DESACCORD, ON NE SERT AUCUNE PREUVE. Servir une preuve issue d un arbre qui ne
 *    correspond pas a la racine ancree ferait echouer la reclamation chez l utilisateur, qui
 *    croirait que le probleme vient de lui.
 */
export async function arbreDUnePeriodeAncree({ rpc, pot, periode, jetonHolders, jetonRecompense,
  plancher, racineAncree, totalAncre }) {
  /* ⛔ MEMES DEUX NOMS QU A L ANCRAGE : rebatir l arbre avec un seul jeton donnerait une racine
   *    differente de celle ancree, et on accuserait l operateur a tort. */
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jetonHolders || ''))
    || !/^0x[0-9a-fA-F]{40}$/.test(String(jetonRecompense || ''))) {
    return { ok: false, pourquoi: 'jetonHolders and jetonRecompense are both required' };
  }
  if (!periode || !periode.ancreeLe) {
    return { ok: false, pourquoi: 'this round is not anchored yet — nothing to claim' };
  }
  /* 1. le tirage stocke doit decouler de la graine stockee */
  const rejoue = blocDeSnapshot({ debut: periode.debut, fin: periode.fin, graine: periode.graine });
  if (rejoue.etat !== 'TIRE') {
    return { ok: false, pourquoi: 'the stored seed does not produce a draw: ' + (rejoue.pourquoi || rejoue.etat) };
  }
  if (rejoue.cible !== periode.cible) {
    return { ok: false,
      pourquoi: 'the stored drawn block (' + periode.cible + ') is not what the stored seed produces ('
        + rejoue.cible + ') — do not trust this anchor' };
  }
  /* 2. les soldes AU BLOC TIRE, comme a l ancrage */
  const naissance = await naissanceDuJeton({ rpc, jeton: jetonHolders, depuis: plancher, jusqua: periode.cible });
  if (naissance === null) return { ok: false, pourquoi: 'token birth not found before the drawn block' };
  const s = await soldesAuBloc({ rpc, jeton: jetonHolders, naissance, auBloc: periode.cible });
  if (s.etat !== 'COMPLET') return { ok: false, pourquoi: s.pourquoi || 'balances could not be rebuilt' };
  const depose = await lireDepose({ rpc, pot, id: periode.id, jeton: jetonRecompense });
  if (depose === null) return { ok: false, pourquoi: 'pot balance unreadable' };

  /* ⛔ LE POT A PU DIMINUER depuis l ancrage (des gens ont deja reclame). On refait donc l arbre
   *    sur le TOTAL ANCRE, pas sur le solde du moment — sinon les parts changeraient a chaque
   *    reclamation et plus aucune preuve ne serait valable. */
  const parts = partsHolders({ soldes: [...s.soldes.entries()], pot: BigInt(totalAncre ?? depose) });
  if (parts.etat !== 'PAYABLE') return { ok: false, pourquoi: 'nobody to pay for this round' };
  const arbre = construireArbre({ id: periode.id, jeton: jetonRecompense,
    parts: parts.parts.map((p) => ({ compte: p.adr, montant: p.montant })) });

  /* 3. LA RACINE RECALCULEE DOIT EGALER LA RACINE ANCREE */
  if (racineAncree && String(racineAncree).toLowerCase() !== arbre.racine.toLowerCase()) {
    return { ok: false, racineRecalculee: arbre.racine, racineAncree,
      pourquoi: 'the root we recompute does not match the anchored root — this anchor does not describe '
        + 'the real balances at block ' + periode.cible };
  }
  return { ok: true, racine: arbre.racine, cible: periode.cible, total: arbre.total, arbre, parts: arbre.parts };
}

/**
 * Que faut-il faire maintenant ?
 * ⛔ AUCUN ENVOI. `aSigner` est une description, pas un geste.
 */
export async function tour({ rpc, pot, jetonHolders, jetonRecompense, plancher, config = {} }) {
  const teteHex = await rpc('eth_blockNumber', []);
  const blocCourant = typeof teteHex === 'string' ? Number(BigInt(teteHex)) : null;
  const periodes = await lirePeriodes({ rpc, pot });
  if (periodes === null) {
    return { action: 'REFUS', pourquoi: 'les periodes du pot n ont pas pu etre lues — on ne decide pas sur une liste trouee' };
  }

  /* Y a-t-il une periode finie a ancrer ? Si oui, on prepare AVANT de demander la decision, pour que
   * le keeper ait un snapshot a juger. */
  const aAncrer = periodes.find((p) => p && p.fin < blocCourant && !p.ancreeLe);
  let snapshot = null;
  if (aAncrer) {
    const prep = await preparerAncrage({ rpc, pot, periode: aAncrer, jetonHolders, jetonRecompense, plancher });
    snapshot = { ...prep, jeton: jetonRecompense, depose: prep.depose, racine: prep.racine,
      total: prep.total, graine: prep.graine };
  }

  const d = prochaineAction({ periodes, blocCourant, snapshot, config });
  const sortie = { ...d, blocCourant, periodes: periodes.length };
  if (d.calldata) sortie.aSigner = { to: pot, data: d.calldata, value: '0x0' };
  if (d.action === 'ANCRER' && snapshot && snapshot.complet) {
    sortie.arbre = { racine: snapshot.racine, total: snapshot.total.toString(), cible: snapshot.cible,
      graine: snapshot.graine, preuves: snapshot.preuves, borne: snapshot.borne };
  }
  return sortie;
}

/** Prepare une alimentation du pot. ⛔ Prevoit l approbation ERC-20 : sans elle, la tx revert. */
export function prepararAlimentation({ pot, id, jeton, montant, estEth = false }) {
  if (estEth) {
    return { aSigner: { to: pot, data: calldataAlimenterEth({ id }), value: '0x' + BigInt(montant).toString(16) },
      resume: 'verse ' + montant + ' wei d ETH dans le pot de la periode ' + id };
  }
  return {
    aSigner: { to: pot, data: calldataAlimenter({ id, jeton, montant }), value: '0x0' },
    prealable: 'approve(' + pot + ', ' + montant + ') sur ' + jeton
      + ' — sans cette approbation, la transaction revert sur le transferFrom APRES avoir coute du gas',
    resume: 'verse ' + montant + ' de ' + jeton + ' dans le pot de la periode ' + id,
  };
}
