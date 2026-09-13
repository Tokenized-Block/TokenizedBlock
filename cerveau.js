// cerveau.js — le cerveau de mouche d un block : il VIT, il se NOURRIT, il peut MOURIR — et il ne trade pas.
// ================================================================================================
// ⛔⛔ REGLES DU JEU DE PHIL, 2026-09-13 (tblock/DECISIONS-regles-du-jeu-2026-09-13.md) :
//    2. le cerveau est VERIFIABLE on-chain : fonction PURE de l adresse du block et de donnees lues sur
//       la chaine ; sa version et ses parametres sont exportes d UNE source (`VERSION_CERVEAU`,
//       `PARAMETRES`) pour etre graves a la creation. N importe qui recalcule les memes neurones.
//    3. la NOURRITURE, c est tout a la fois : GM recus, messages recus, nouveaux detenteurs, achats.
//       Un block SANS marche mais nourri s EVEILLE — il ne dort plus parce que personne ne l a achete.
//    4. la MORT : quand le createur ne detient plus rien. ⛔ Elle se constate sur une lecture REUSSIE :
//       l appelant passe `mort: true` seulement s il a LU un solde nul. « Pas lu » ne tue jamais.
//
// ⛔⛔ CE CERVEAU NE PROPOSE AUCUN ACHAT ET NE SIGNE RIEN. Il rend le block vivant : sa facon de bouger,
//    son humeur, sa reaction a ce qui lui arrive VRAIMENT sur la chaine.
//
// ⛔ LES ENTREES SONT DES FAITS LUS, JAMAIS DES HUMEURS INVENTEES. Ce que chaque entree veut dire, et
//    comment la lire sur la chaine (c est ce qui rend le cerveau recalculable par un tiers) :
//    · vie / vieAvant   capitalisation mesuree (prix × supply) et la precedente ;
//    · gm               nombre de transferts du block entre deux adresses non nulles (hors frappe) ;
//    · messages         nombre de ces transferts qui portent un message lisible dans leur calldata ;
//    · detenteurs       nombre d adresses qui recoivent le block pour la premiere fois dans la fenetre ;
//    · mort             `true` SEULEMENT si le solde du createur a ete lu et vaut zero.
//
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu une vraie mouche ferait ca. C est un reseau a impulsions JOUET
//    (128 neurones, integration et fuite), pas une reconstruction biologique.
import { keccak256Hex } from './keccak.js';

/** ⛔ LA VERSION GRAVEE A LA CREATION. Changer la dynamique sans changer ce nom ferait mentir les blocks
 *  qui la portent : un tiers recalculerait avec la mauvaise regle. */
export const VERSION_CERVEAU = 'tblock-fly-brain/2';

/** ⛔ SOURCE UNIQUE DES PARAMETRES — `pas()` les lit ici, et Create les grave tels quels. */
export const PARAMETRES = Object.freeze({
  neurones: 128,
  capteurs: 16,
  liensParNeurone: 8,
  seuil: 1,
  fuite: 0.82,
  reposSansMarche: 0.15,
  bruitMax: 0.10,
  graine: 'keccak256(lowercase block address)',
});

/** ⛔ Taille FIXE : le cerveau de deux blocks doit etre comparable, sinon « plus actif » ne veut rien dire. */
export const NEURONES = PARAMETRES.neurones;
/** Combien de neurones recoivent directement les faits de la chaine. */
export const CAPTEURS = PARAMETRES.capteurs;
/* ⛔ EVEILLE et MORT sont nes des regles du 2026-09-13 : un block nourri sans marche ne dort pas, et un
 * block dont le createur n a plus rien est mort. */
export const PHASES = ['DORMANT', 'EVEILLE', 'CALME', 'CURIEUX', 'EXCITE', 'INQUIET', 'MORT'];

const enc = new TextEncoder();

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
 * ⛔ MEME ADRESSE ⇒ MEME CERVEAU, toujours. Aucun stockage, aucun serveur.
 */
export function connectome(adresse) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(adresse || ''))) throw new Error('connectome needs an address');
  const h = empreinte(String(adresse).toLowerCase());
  const graine = parseInt(h.slice(2, 10), 16);
  const suivant = tirage(graine);
  const liens = [];
  /* ⛔ SPARSE, PAS COMPLET : huit liens par neurone laissent des circuits DIFFERENTS d une adresse a l autre. */
  for (let i = 0; i < NEURONES; i++) {
    const sortants = [];
    for (let k = 0; k < PARAMETRES.liensParNeurone; k++) {
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

const borne01 = (x, diviseur) => Math.max(0, Math.min(1, (Number(x) || 0) / diviseur));

/**
 * Les faits de la chaine, transformes en courant d entree.
 * ⛔ TROIS ETATS, PAS DEUX : `vie` a `null` veut dire « pas de marche ou pas lu », et ce n est pas zero.
 * ⛔ `mort` n est vrai QUE s il vaut strictement `true` : un solde non lu (null, undefined) ne tue pas.
 */
export function courant({ vie = null, vieAvant = null, gm = 0, messages = 0, detenteurs = 0, part = 0,
  scelle = null, mort = null } = {}) {
  const aMarche = typeof vie === 'number' && Number.isFinite(vie) && vie > 0;
  /* la variation RELATIVE, bornee : un x10 ne doit pas saturer le reseau pour toujours */
  let delta = 0;
  if (aMarche && typeof vieAvant === 'number' && vieAvant > 0) {
    delta = Math.max(-1, Math.min(1, (vie - vieAvant) / vieAvant));
  }
  /* ⚠️ ECHELLE LOGARITHMIQUE, comme les PV : en lineaire, tous les cerveaux se ressembleraient. */
  const taille = aMarche ? Math.min(1, Math.log10(1 + vie) / 9) : 0;
  return {
    aMarche,
    taille,
    delta,
    /* ⛔ BORNES : on ne fabrique pas un block hyperactif en s envoyant mille GM a soi-meme. */
    gm: borne01(gm, 10),
    messages: borne01(messages, 5),
    detenteurs: borne01(detenteurs, 5),
    part: Math.max(0, Math.min(1, Number(part) || 0)),
    scelle: scelle === true ? 1 : 0,
    mort: mort === true,
  };
}

/** La nourriture recue hors marche, entre 0 et 1. */
function nourriture(f) {
  return Math.min(1, f.gm * 0.5 + f.messages * 0.3 + f.detenteurs * 0.4);
}

/**
 * Un pas de temps. Rend le nouvel etat ET ce qui se voit.
 * ⛔ UN BLOCK MORT NE RECOIT PLUS AUCUN COURANT : son reseau s eteint pour de vrai. Le dire « mort » tout
 *    en le laissant tirer serait une animation qui ment.
 */
export function pas(etat, faits = {}) {
  const f = courant(faits);
  const { c } = etat;
  const p = etat.potentiels.slice();
  const suivant = tirage((parseInt(c.empreinte.slice(10, 18), 16) ^ etat.tick) >>> 0);
  const miam = nourriture(f);

  if (!f.mort) {
    for (let i = 0; i < CAPTEURS; i++) {
      const bruit = suivant() * PARAMETRES.bruitMax;
      /* ⛔ LE COURANT DE REPOS SEPARE « ENDORMI » DE « ETEINT » : avec 0,15 et un bruit jusqu a 0,10, le
       * potentiel tourne autour de 1,1 — il tire RAREMENT. La nourriture s ajoute, avec ou sans marche. */
      p[i] += (f.aMarche ? 0.25 + f.taille * 0.5 : PARAMETRES.reposSansMarche)
        + f.delta * 0.4 + miam * 0.6 + bruit;
    }
  }
  let spikes = 0;
  const actifs = [];
  for (let i = 0; i < NEURONES; i++) {
    if (p[i] >= PARAMETRES.seuil) {
      spikes++;
      actifs.push(i);
      p[i] = 0;
      for (const l of c.liens[i]) p[l.vers] += l.poids * 0.5;
    } else {
      p[i] *= PARAMETRES.fuite;
    }
    /* ⛔ BORNES DURES : sans elles un potentiel diverge et `left_hz` devient NaN. */
    if (!Number.isFinite(p[i])) p[i] = 0;
    p[i] = Math.max(-4, Math.min(4, p[i]));
  }

  const tireG = actifs.filter((i) => (i + c.aileG) % 3 === 0).length;
  const tireD = actifs.filter((i) => (i + c.aileD) % 3 === 0).length;
  const base = f.mort ? 0 : 12;
  const gauche = Math.round((base + tireG * 4 + f.taille * 18) * 100) / 100;
  const droite = Math.round((base + tireD * 4 + f.taille * 18) * 100) / 100;
  const somme = gauche + droite;
  const virage = somme > 0 ? Math.round(((gauche - droite) / somme) * 1000) / 1000 : 0;
  const vitesse = Math.round(Math.min(1, spikes / 40) * 1000) / 1000;

  /* ⛔ L ORDRE DES REGLES EST LA REGLE : la mort d abord, puis sans marche (nourri ou non), puis le marche. */
  let phase;
  if (f.mort) phase = 'MORT';
  else if (!f.aMarche) phase = miam > 0 ? 'EVEILLE' : 'DORMANT';
  else if (f.delta <= -0.05) phase = 'INQUIET';
  else if (f.delta >= 0.05 || f.gm > 0.3 || f.detenteurs > 0.3) phase = 'EXCITE';
  else if (spikes > 8) phase = 'CURIEUX';
  else phase = 'CALME';

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
      /* ⛔ LES INDICES, PAS SEULEMENT LE COMPTE : le trace est la lecture elle-meme. */
      indices: actifs,
      phase,
      nourriture: Math.round(miam * 1000) / 1000,
      /* ⛔ L EMPREINTE DE L ENTREE PORTE LA VERSION ET CHAQUE FAIT : deux personnes rejouent le meme pas. */
      entree: empreinte(JSON.stringify([VERSION_CERVEAU, f.aMarche, f.taille, f.delta, f.gm, f.messages,
        f.detenteurs, f.part, f.scelle, f.mort, etat.tick])),
    },
  };
}

/** Une phrase pour l ecran. ⛔ Elle ne promet rien sur le prix : elle decrit l animal, pas le marche. */
export function phraseDePhase(phase, symbole) {
  const nom = symbole ? String(symbole) : 'this block';
  return {
    DORMANT: nom + ' is asleep: no market and nothing received yet. Not dead — untouched.',
    EVEILLE: nom + ' is awake: no market yet, but its community feeds it — GMs, messages, new holders.',
    CALME: nom + ' is calm. Its market is steady.',
    CURIEUX: nom + ' is restless, looking around.',
    EXCITE: nom + ' is buzzing: its life went up, or it was fed.',
    INQUIET: nom + ' is agitated: its life went down. Nobody refunds that.',
    MORT: nom + ' is dead: its creator no longer holds any of it.',
  }[phase] || nom + ' is quiet.';
}
