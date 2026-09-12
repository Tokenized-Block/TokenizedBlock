// cerveau.js — le cerveau de mouche d un block : il VIT, il ne trade pas.
// ================================================================================================
// ⛔⛔ CE CERVEAU NE PROPOSE AUCUN ACHAT ET NE SIGNE RIEN. degen-fly fait piloter un wallet qui SIGNE
//    par un connectome de mouche (mesure du 2026-09-12 : budget 70 $, achat max 5 $, `signing: true`).
//    Nous, non : un cerveau qui proposerait des trades finirait par en executer, et la promesse de
//    cette app est « aucune cle ici, ton wallet signe ». Ce cerveau-la fait UNE chose : il rend le
//    block VIVANT — sa facon de bouger, de se reveiller, de reagir a ce qui lui arrive sur la chaine.
//
// ⛔ LE CONNECTOME EST DERIVE DE L ADRESSE DU BLOCK. Il n est ni copie de degen-fly (leur graphe de
//    166 700 neurones est a eux) ni tire au hasard : la MEME adresse rend TOUJOURS le meme cerveau,
//    sur n importe quelle machine, sans rien stocker. C est ce qui fait qu un block a un caractere
//    au lieu d une animation.
//
// ⛔⛔ LES ENTREES SONT DES FAITS LUS, JAMAIS DES HUMEURS INVENTEES. `vie` est la capitalisation
//    mesuree (prix x supply), `vieAvant` la precedente, `gm` des transferts reels. Sans marche, le
//    cerveau DORT — il ne fait pas semblant d etre excite pour faire joli, et il ne se dit pas
//    « mort » non plus : jamais echange n est pas la meme chose que sans valeur.
//
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu une vraie mouche ferait ca. C est un reseau a impulsions
//    JOUET (128 neurones, integration et fuite), pas une reconstruction biologique. Le dire est plus
//    honnete que de laisser croire qu on a un connectome.
import { keccak256Hex } from './keccak.js';

/** ⛔ Taille FIXE : le cerveau de deux blocks doit etre comparable, sinon « plus actif » ne veut rien dire. */
export const NEURONES = 128;
/** Combien de neurones recoivent directement les faits du marche. */
export const CAPTEURS = 16;
export const PHASES = ['DORMANT', 'CALME', 'CURIEUX', 'EXCITE', 'INQUIET'];

const enc = new TextEncoder();
const SEUIL = 1;          // potentiel a partir duquel un neurone tire
const FUITE = 0.82;       // ce qui reste du potentiel au pas suivant

/** ⛔ Un generateur DETERMINISTE et portable : `Math.random` rendrait le caractere different a chaque ouverture. */
function tirage(graine) {
  let x = graine >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/** L empreinte d une chaine, par keccak — la meme fonction que partout ailleurs dans ce depot. */
export function empreinte(texte) {
  return keccak256Hex(enc.encode(String(texte)));
}

/**
 * Le connectome d un block : des poids signes, sparses, tires de son adresse.
 * ⛔ MEME ADRESSE ⇒ MEME CERVEAU, toujours. Aucun stockage, aucun serveur : le caractere du block
 *    est une propriete de son identite, pas une donnee qu on pourrait perdre ou falsifier.
 */
export function connectome(adresse) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(adresse || ''))) throw new Error('connectome needs an address');
  const h = empreinte(String(adresse).toLowerCase());
  const graine = parseInt(h.slice(2, 10), 16);
  const suivant = tirage(graine);
  const liens = [];
  /* ⛔ SPARSE, PAS COMPLET : 128x128 liens donneraient une bouillie uniforme ou tous les blocks se
   * ressemblent. Huit liens par neurone laissent des circuits DIFFERENTS d une adresse a l autre. */
  for (let i = 0; i < NEURONES; i++) {
    const sortants = [];
    for (let k = 0; k < 8; k++) {
      const vers = Math.floor(suivant() * NEURONES);
      /* des poids negatifs autant que positifs : sans inhibition, tout le reseau tire en meme temps */
      const poids = Math.round((suivant() * 2 - 1) * 100) / 100;
      sortants.push({ vers, poids });
    }
    liens.push(sortants);
  }
  /* les deux ailes ne lisent pas les memes neurones : c est ce qui cree un virage */
  const aileG = Math.floor(suivant() * NEURONES);
  const aileD = Math.floor(suivant() * NEURONES);
  return { adresse: String(adresse).toLowerCase(), empreinte: h, liens, aileG, aileD };
}

/** L etat de depart. ⛔ `tick` commence a 0 : un cerveau qui « a deja vecu » mentirait sur son age. */
export function etatInitial(adresse) {
  const c = connectome(adresse);
  return { c, tick: 0, potentiels: new Array(NEURONES).fill(0), spikes: 0, dernierSpikes: 0 };
}

/**
 * Les faits de la chaine, transformes en courant d entree.
 * ⛔ TROIS ETATS, PAS DEUX (comme partout ici) : `vie` a `null` veut dire « pas de marche ou pas lu »,
 *    et ce n est pas zero. Un cerveau nourri de zeros se comporterait comme un block qui s effondre.
 */
export function courant({ vie = null, vieAvant = null, gm = 0, part = 0, scelle = null } = {}) {
  const aMarche = typeof vie === 'number' && Number.isFinite(vie) && vie > 0;
  /* la variation RELATIVE, bornee : un x10 ne doit pas saturer le reseau pour toujours */
  let delta = 0;
  if (aMarche && typeof vieAvant === 'number' && vieAvant > 0) {
    delta = Math.max(-1, Math.min(1, (vie - vieAvant) / vieAvant));
  }
  /* ⚠️ ECHELLE LOGARITHMIQUE, comme les PV : en lineaire, un block a 1 000 et un a 1 000 000 auraient
   * la meme entree « faible » a cote d un gros, et tous les cerveaux se ressembleraient. */
  const taille = aMarche ? Math.min(1, Math.log10(1 + vie) / 9) : 0;
  return {
    aMarche,
    taille,
    delta,
    /* un GM est un vrai transfert : il compte comme une caresse, bornee pour qu on ne puisse pas
     * fabriquer un block hyperactif en s envoyant mille GM a soi-meme */
    gm: Math.max(0, Math.min(1, Number(gm) / 10)),
    part: Math.max(0, Math.min(1, Number(part))),
    scelle: scelle === true ? 1 : 0,
  };
}

/**
 * Un pas de temps. Rend le nouvel etat ET ce qui se voit : battements d ailes, virage, vitesse, phase.
 * ⛔ SANS MARCHE, LE CERVEAU DORT et le dit (`DORMANT`). Il continue de tirer faiblement — un block
 *    jamais echange n est pas eteint, il est endormi.
 */
export function pas(etat, faits = {}) {
  const f = courant(faits);
  const { c } = etat;
  const p = etat.potentiels.slice();
  const suivant = tirage((parseInt(c.empreinte.slice(10, 18), 16) ^ etat.tick) >>> 0);

  /* les capteurs recoivent les faits ; le reste du reseau ne recoit que ses voisins */
  for (let i = 0; i < CAPTEURS; i++) {
    const bruit = suivant() * 0.10;
    /* ⛔⛔ LE COURANT DE REPOS EST CE QUI SEPARE « ENDORMI » DE « ETEINT », ET MA PREMIERE VERSION
     * ETAIT ETEINTE : 0,06 de courant avec une fuite de 0,82 plafonne a 0,06/(1-0,82) = 0,33, sous
     * le seuil de 1 — un block sans marche ne tirait JAMAIS. Le test l a attrape. Avec 0,15 et un
     * bruit jusqu a 0,10, le potentiel de repos tourne autour de 1,1 : il tire RAREMENT, ce qui est
     * exactement ce qu on voulait dire par « jamais echange n est pas mort ». */
    p[i] += (f.aMarche ? 0.25 + f.taille * 0.5 : 0.15) + f.delta * 0.4 + f.gm * 0.5 + bruit;
  }
  let spikes = 0;
  const actifs = [];
  for (let i = 0; i < NEURONES; i++) {
    if (p[i] >= SEUIL) {
      spikes++;
      actifs.push(i);
      p[i] = 0;
      for (const l of c.liens[i]) p[l.vers] += l.poids * 0.5;
    } else {
      p[i] *= FUITE;
    }
    /* ⛔ BORNES DURES : sans elles, un poids positif en boucle fait diverger le potentiel vers
     * l infini, et `left_hz` devient NaN — un NaN traverse toutes les comparaisons sans rien dire. */
    if (!Number.isFinite(p[i])) p[i] = 0;
    p[i] = Math.max(-4, Math.min(4, p[i]));
  }

  const tireG = actifs.filter((i) => (i + c.aileG) % 3 === 0).length;
  const tireD = actifs.filter((i) => (i + c.aileD) % 3 === 0).length;
  /* 12 Hz de battement de base, comme un insecte au repos ; le reste vient de l activite */
  const gauche = Math.round((12 + tireG * 4 + f.taille * 18) * 100) / 100;
  const droite = Math.round((12 + tireD * 4 + f.taille * 18) * 100) / 100;
  const somme = gauche + droite;
  const virage = somme > 0 ? Math.round(((gauche - droite) / somme) * 1000) / 1000 : 0;
  const vitesse = Math.round(Math.min(1, spikes / 40) * 1000) / 1000;

  let phase = 'DORMANT';
  if (f.aMarche) {
    if (f.delta <= -0.05) phase = 'INQUIET';
    else if (f.delta >= 0.05 || f.gm > 0.3) phase = 'EXCITE';
    else if (spikes > 8) phase = 'CURIEUX';
    else phase = 'CALME';
  }

  const nouvel = { c, tick: etat.tick + 1, potentiels: p, spikes, dernierSpikes: etat.spikes };
  return {
    etat: nouvel,
    vu: {
      tick: nouvel.tick,
      gauche_hz: gauche,
      droite_hz: droite,
      virage,
      vitesse,
      spikes,
      actifs: actifs.length,
      /* ⛔ LES INDICES, PAS SEULEMENT LE COMPTE. Un ecran qui dessine « 12 neurones ont tire » sans
       * savoir LESQUELS dessinerait douze points au hasard — une animation qui a l air d une mesure.
       * Avec les indices, le trace est la lecture elle-meme. */
      indices: actifs,
      phase,
      /* ⛔ L EMPREINTE DE L ENTREE VOYAGE AVEC LA SORTIE. C est ce qui rend une simulation
       * verifiable au lieu de decorative : deux personnes peuvent rejouer le meme pas. */
      entree: empreinte(JSON.stringify([f.aMarche, f.taille, f.delta, f.gm, f.part, f.scelle, etat.tick])),
    },
  };
}

/** Une phrase pour l ecran. ⛔ Elle ne promet rien sur le prix : elle decrit l animal, pas le marche. */
export function phraseDePhase(phase, symbole) {
  const nom = symbole ? String(symbole) : 'this block';
  return {
    DORMANT: nom + ' is asleep: never traded yet. Not dead — untouched.',
    CALME: nom + ' is calm. Its market is steady.',
    CURIEUX: nom + ' is restless, looking around.',
    EXCITE: nom + ' is buzzing: its life went up, or someone sent it a GM.',
    INQUIET: nom + ' is agitated: its life went down. Nobody refunds that.',
  }[phase] || nom + ' is quiet.';
}
