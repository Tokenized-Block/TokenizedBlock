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
/* ⛔ v3 (2026-09-13, Phil : « les ticks des neurones doivent avoir une memoire pour travailler ») : chaque
 *    neurone porte une TRACE de son activite recente, qui le re-amorce aux pas suivants. */
export const VERSION_CERVEAU = 'tblock-fly-brain/3';

/** ⛔ SOURCE UNIQUE DES PARAMETRES — `pas()` les lit ici, et Create les grave tels quels. */
export const PARAMETRES = Object.freeze({
  neurones: 128,
  capteurs: 16,
  liensParNeurone: 8,
  seuil: 1,
  fuite: 0.82,
  reposSansMarche: 0.15,
  bruitMax: 0.10,
  /* ⛔ MEMOIRE DE TRAVAIL : trace = moyenne glissante des tirs (0,97 ≈ une trentaine de pas), re-injectee a
   *    0,2 — sous le seuil de 1 : la memoire AMORCE un neurone, elle ne le fait jamais tirer seule. */
  memoireDecroissance: 0.97,
  memoireGain: 0.2,
  graine: 'keccak256(lowercase block address)',
});

/** ⛔ Taille FIXE : le cerveau de deux blocks doit etre comparable, sinon « plus actif » ne veut rien dire. */
export const NEURONES = PARAMETRES.neurones;
/** Combien de neurones recoivent directement les faits de la chaine. */
export const CAPTEURS = PARAMETRES.capteurs;
/* ⛔ EVEILLE et MORT sont nes des regles du 2026-09-13 : un block nourri sans marche ne dort pas, et un
 * block dont le createur n a plus rien est mort. */
/* ⛔ NON_LU (2026-09-13, capture de Phil sur TBLOCK) : un marche PAS LU se disait DORMANT — « asleep: no market » —
 *    sur un block dont le marche est en ligne. Ce n est pas une humeur : c est « on ne juge pas ». */
export const PHASES = ['DORMANT', 'EVEILLE', 'CALME', 'CURIEUX', 'EXCITE', 'INQUIET', 'MORT', 'NON_LU'];

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
  return { c, tick: 0, potentiels: new Array(NEURONES).fill(0), memoire: new Array(NEURONES).fill(0), spikes: 0, dernierSpikes: 0 };
}

const borne01 = (x, diviseur) => Math.max(0, Math.min(1, (Number(x) || 0) / diviseur));

/**
 * Les faits de la chaine, transformes en courant d entree.
 * ⛔ TROIS ETATS, PAS DEUX : `vie` a `null` veut dire « pas de marche ou pas lu », et ce n est pas zero.
 * ⛔ `mort` n est vrai QUE s il vaut strictement `true` : un solde non lu (null, undefined) ne tue pas.
 */
export function courant({ vie = null, vieAvant = null, gm = 0, messages = 0, detenteurs = 0, part = 0,
  scelle = null, mort = null, etatVie = null, gmAvant = null, messagesAvant = null, detenteursAvant = null } = {}) {
  /* ⛔⛔ L HUMEUR SUR LE NOUVEAU (Phil, 2026-09-13, apres mesure : TBLOCK et WOFI EXCITE 40/40 battements a prix stable,
   *    parce que 3 detenteurs dans la fenetre suffisaient — CALME et CURIEUX n arrivaient jamais sur un block vivant).
   *    Seul ce qui est arrive DEPUIS LA LECTURE PRECEDENTE excite. Sans lecture precedente, rien n est « nouveau ».
   * ⚠️ BORNE : les compteurs sont sur une fenetre glissante ; un transfert qui entre pendant qu un ancien sort se compense
   *    et n est pas vu. On rate du nouveau, on n en invente jamais. */
  const hausse = (x, avant) => (typeof avant === 'number' && Number.isFinite(avant) ? Math.max(0, (Number(x) || 0) - avant) : 0);
  const nouveaux = { gm: hausse(gm, gmAvant), messages: hausse(messages, messagesAvant), detenteurs: hausse(detenteurs, detenteursAvant) };
  const avecAvant = [gmAvant, messagesAvant, detenteursAvant].some((a) => typeof a === 'number' && Number.isFinite(a));
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
    /* ⛔ SEULEMENT LE LIBELLE : le courant est le meme (vie null dans les deux cas), donc les potentiels et
     *    l empreinte d entree ne changent pas — un enregistrement deja grave se rejoue a l identique. */
    /* ⛔⛔ VU EN PROD (2026-09-14, « TBLOCK: I am asleep now ») : la map ecrivait etatVie = 'LUE' AVANT la vie (lectures
     *    de face et de nourriture entre les deux) — « lu mais sans vie » tombait en DORMANT. Une vie absente n est un
     *    « pas de marche » que sur NON_TROUVEE. */
    nonLu: !aMarche && (etatVie === 'NON_LUE' || etatVie === 'LUE'),
    nouveau: Math.min(1, nouveaux.gm * 0.5 + nouveaux.messages * 0.5 + nouveaux.detenteurs * 0.5),
    nouveaux,
    avecAvant,
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
  /* ⛔ UN ETAT SANS MEMOIRE (sauvegarde d avant la v3) repart de zero, il ne casse pas. */
  const m = Array.isArray(etat.memoire) && etat.memoire.length === NEURONES ? etat.memoire.slice() : new Array(NEURONES).fill(0);
  if (!f.mort) {
    for (let i = 0; i < NEURONES; i++) p[i] += m[i] * PARAMETRES.memoireGain;
  }
  let spikes = 0;
  const actifs = [];
  for (let i = 0; i < NEURONES; i++) {
    const tire = p[i] >= PARAMETRES.seuil;
    if (tire) {
      spikes++;
      actifs.push(i);
      p[i] = 0;
      for (const l of c.liens[i]) p[l.vers] += l.poids * 0.5;
    } else {
      p[i] *= PARAMETRES.fuite;
    }
    /* un block mort OUBLIE aussi : sa trace s eteint sans jamais etre re-nourrie */
    m[i] = m[i] * PARAMETRES.memoireDecroissance + (tire && !f.mort ? 1 - PARAMETRES.memoireDecroissance : 0);
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
  else if (f.nonLu) phase = 'NON_LU';
  else if (!f.aMarche) phase = miam > 0 ? 'EVEILLE' : 'DORMANT';
  else if (f.delta <= -0.05) phase = 'INQUIET';
  else if (f.delta >= 0.05 || f.nouveau > 0) phase = 'EXCITE';
  else if (spikes > 8) phase = 'CURIEUX';
  else phase = 'CALME';

  const nouvel = { c, tick: etat.tick + 1, potentiels: p, memoire: m, spikes, dernierSpikes: etat.spikes };
  const memoireMoyenne = Math.round((m.reduce((s, x) => s + x, 0) / NEURONES) * 10000) / 10000;
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
      /* ce qui est NOUVEAU depuis la lecture precedente, et la variation de vie : lus par les regles du block */
      nouveaux: f.nouveaux,
      delta: f.delta,
      /* la memoire de travail moyenne, 0..1 : combien le reseau « se souvient » de ce qu il vient de faire */
      memoire: memoireMoyenne,
      /* ⛔ L EMPREINTE DE L ENTREE PORTE LA VERSION ET CHAQUE FAIT : deux personnes rejouent le meme pas. */
      entree: empreinte(JSON.stringify([VERSION_CERVEAU, f.aMarche, f.taille, f.delta, f.gm, f.messages,
        f.detenteurs, f.part, f.scelle, f.mort, etat.tick,
        /* le nouveau n entre dans l empreinte que s il a ete fourni : un pas d avant se rejoue a l identique */
        ...(f.avecAvant ? [f.nouveaux.gm, f.nouveaux.messages, f.nouveaux.detenteurs] : [])])),
    },
  };
}

/**
 * La memoire d un cerveau, a garder entre deux ouvertures (tick, potentiels, traces).
 * ⛔ ARRONDIE A 1e-4 : assez pour reprendre, pas assez pour qu un stockage de navigateur gonfle.
 * ⚠️ CE QU ELLE CHANGE A LA VERIFIABILITE : un cerveau REPRIS depend de l histoire de ce navigateur. Il reste
 *    rejouable depuis le tick 0 avec les memes faits ; c est ce que dit l empreinte d entree, pas l etat repris.
 */
export function serialiserMemoire(etat) {
  const r = (x) => Math.round(x * 10000) / 10000;
  return { v: VERSION_CERVEAU, tick: etat.tick, spikes: etat.spikes,
    potentiels: etat.potentiels.map(r), memoire: (etat.memoire || new Array(NEURONES).fill(0)).map(r) };
}

/**
 * Reprend un cerveau depuis sa memoire. Rend `null` — jamais un etat a moitie valide — si la version, la taille
 * ou une valeur ne tient pas : l appelant repart alors de `etatInitial`.
 */
export function restaurerMemoire(adresse, memo) {
  if (!memo || typeof memo !== 'object' || memo.v !== VERSION_CERVEAU) return null;
  if (!Number.isSafeInteger(memo.tick) || memo.tick < 0) return null;
  const tableau = (t, min, max) => Array.isArray(t) && t.length === NEURONES
    && t.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max);
  if (!tableau(memo.potentiels, -4, 4) || !tableau(memo.memoire, 0, 1)) return null;
  let base;
  try { base = etatInitial(adresse); } catch { return null; }
  return { ...base, tick: memo.tick, spikes: Number.isSafeInteger(memo.spikes) ? memo.spikes : 0,
    potentiels: memo.potentiels.slice(), memoire: memo.memoire.slice() };
}

/* ⛔ LE NOM AFFICHE D UNE HUMEUR EST EN ANGLAIS (Phil, 2026-09-13 : « curieux ou calme, ecris en anglais, pas en francais »).
 *    Les identifiants internes (CALME, CURIEUX…) ne changent pas : regles gravees, tests et memoires en dependent. */
export const NOMS_HUMEUR = Object.freeze({ DORMANT: 'asleep', EVEILLE: 'awake', CALME: 'calm', CURIEUX: 'curious',
  EXCITE: 'excited', INQUIET: 'worried', MORT: 'dead', NON_LU: 'market unread' });
export function nomHumeur(phase) {
  return NOMS_HUMEUR[phase] || 'quiet';
}

/** Une phrase pour l ecran. ⛔ Elle ne promet rien sur le prix : elle decrit l animal, pas le marche. */
export function phraseDePhase(phase, symbole) {
  const nom = symbole ? String(symbole) : 'this block';
  return {
    DORMANT: nom + ' is asleep: no market and nothing received yet. Not dead — untouched.',
    EVEILLE: nom + ' is awake: no market yet, but its community feeds it — GMs, messages, new holders.',
    CALME: nom + ' is calm. Its market is steady.',
    CURIEUX: nom + ' is restless, looking around.',
    EXCITE: nom + ' is buzzing: its life went up, or something new just reached it — a transfer, a holder, a message.',
    INQUIET: nom + ' is agitated: its life went down. Nobody refunds that.',
    MORT: nom + ' is dead: its creator no longer holds any of it.',
    NON_LU: nom + '\'s market could not be read right now — no mood is judged until it is.',
  }[phase] || nom + ' is quiet.';
}
