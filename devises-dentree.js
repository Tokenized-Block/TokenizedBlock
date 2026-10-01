/* AVEC QUOI PEUT-ON PAYER CE BLOCK ? — la liste des devises d entree, et ce qu elles coutent.
 *
 * ⭐ POURQUOI CE FICHIER EXISTE. `pont-de-liquidite.js` sait depuis le 2026-10-01 trouver la route
 *   OUSD -> USDC -> ... -> un block, et `route-v4-multi-sauts.js` sait l assembler. Les deux sont
 *   testes, et la route OUSD -> USDC -> ETH -> TBLOCK a ete prouvee EN EXECUTION sur fork (3 sauts,
 *   UNE transaction, status 0x1, gas 220 893, frais a6cf exact au wei).
 *   ⛔⛔ ET POURTANT AUCUN ACHETEUR NE POUVAIT L EMPRUNTER : l ecran d echange n offre qu une seule
 *     devise, celle de la pool du block. Un porteur d OUSD ne pouvait LITTERALEMENT rien acheter.
 *
 * ⛔⛔⛔ LE DEFAUT QUE CE FICHIER CORRIGE EST UN DEFAUT DE **GRAPHE**, PAS DE DECISION.
 *   Le constructeur d aretes de l app ne posait que des aretes `USDC -> devise du registre`. Le
 *   BLOCK OUVERT n y entrait JAMAIS. Donc `cheminEntre(OUSD, block)` rendait REFUSE — non pas
 *   parce qu aucune route n existe, mais parce que personne n avait mesure l arete d arrivee.
 *   ⇒ Un module de decision correct, branche sur une entree qui ne contient pas le cas qu il sert.
 *     C est le motif « une cle exigee qui ne borne rien » : vert partout, inerte en vrai.
 *   ⇒ ON EXIGE DONC ICI L ARETE DU BLOCK, explicitement, et on REFUSE DE REPONDRE sans elle —
 *     plutot que de rendre une liste vide qui se lirait comme « aucune devise ne marche ».
 *
 * ⛔ CE MODULE NE LIT RIEN, NE COTE RIEN, NE SIGNE RIEN. Il recoit des faits MESURES et rend un
 *   classement. Melanger la lecture et la decision rendrait « pas de route » indistinguable de
 *   « on n a pas regarde » — et cette confusion est le defaut numero un de ce depot.
 *
 * ⛔⛔ QUATRE ETATS, ET LES QUATRE SE DISENT DIFFEREMMENT. En particulier les deux derniers :
 *     DIRECTE       la devise EST celle de la pool du block : rien a ponter.
 *     UNE_TX        une route mesuree, entierement sur une factory : une signature.
 *     PLUSIEURS_TX  une route mesuree qui change de factory : N signatures, le chiffre est dit.
 *     SANS_ROUTE    on a REGARDE et il n y a pas de route de <= SAUTS_MAX sauts.
 *     NON_MESUREE   on n a PAS regarde : les faits de cette devise n ont pas ete lus.
 *   ⛔ `SANS_ROUTE` et `NON_MESUREE` NE SONT PAS LE MEME FAIT. Les confondre ferait annoncer
 *     « impossible » sur une devise qu on n a simplement pas sondee — une accusation fondee sur
 *     notre propre incompletude. Aucune des deux n est offerte ; seule la premiere est un verdict.
 */

import { cheminEntre, segmenterParFactory, transactionsNecessaires, SAUTS_MAX } from './pont-de-liquidite.js';

/** Les etats rendus. ⛔ Aucun autre n est produit, et un etat inconnu fait refuser l affichage. */
export const ETATS = Object.freeze(['DIRECTE', 'UNE_TX', 'PLUSIEURS_TX', 'SANS_ROUTE', 'NON_MESUREE']);

/** ⛔ Les etats qu on OFFRE a l achat. Les autres existent pour etre DITS, pas pour etre cliques. */
export const ETATS_OFFERTS = Object.freeze(['DIRECTE', 'UNE_TX', 'PLUSIEURS_TX']);

const bas = (a) => String(a || '').toLowerCase();
const estAdresse = (a) => /^0x[0-9a-f]{40}$/.test(bas(a));

/**
 * L ARETE D ARRIVEE DU BLOCK, DEDUITE DE SES FAITS DE POOL MESURES.
 *
 * @param {string} p.block          l adresse du block
 * @param {string} p.deviseDeLaPool le jeton en face dans sa pool — ETH ou la devise du marche, LU
 * @param {string} p.famille        'aerodrome' | 'uniswap-v4', LU
 *
 * ⛔⛔ C EST L ARETE QUI MANQUAIT, ET ELLE NE PEUT PAS ETRE DEVINEE. La devise en face n est PAS
 *   toujours USDC : un block paire avec ETH a une arete ETH <-> block, et poser `USDC -> block`
 *   inventerait une pool USDC/block qui n existe pas. Un graphe avec une fausse arete est PIRE
 *   qu un graphe incomplet : il produit une route qui revert a la signature.
 * ⛔ SANS FAMILLE LUE, ON NE REND PAS D ARETE. `cheminEntre` ignorerait de toute facon une famille
 *   inconnue, mais il la NOMMERAIT comme « ignoree » — ce qui se lirait comme un lieu exotique
 *   alors que la verite est qu on ne l a pas lue.
 */
export function areteDuBlock({ block, deviseDeLaPool, famille } = {}) {
  if (!estAdresse(block) || !estAdresse(deviseDeLaPool)) return null;
  if (bas(block) === bas(deviseDeLaPool)) return null;
  if (famille !== 'aerodrome' && famille !== 'uniswap-v4') return null;
  return { de: bas(deviseDeLaPool), vers: bas(block), famille };
}

/**
 * LE CLASSEMENT D UNE SEULE DEVISE D ENTREE.
 *
 * @param {string} p.devise   l adresse de la devise avec laquelle on voudrait payer
 * @param {string} p.block    l adresse du block a acheter
 * @param {object[]} p.aretes  les aretes MESUREES, arete du block INCLUSE
 * @param {boolean} p.faitsLus  a-t-on lu les faits de pool de cette devise ? ⛔ pas une supposition
 *
 * ⛔ `faitsLus` EST UN PARAMETRE ET PAS UNE DEDUCTION. On pourrait croire qu une devise absente du
 *   graphe est une devise non mesuree — c est faux dans les deux sens : une devise mesuree peut
 *   n avoir aucune pool (verdict reel), et une devise non lue peut apparaitre dans le graphe par
 *   une arete venue d ailleurs. Deduire melangerait les deux faits qu on tient a separer.
 */
export function classerDevise({ devise, block, aretes, faitsLus = false } = {}) {
  if (!estAdresse(devise) || !estAdresse(block)) {
    return { etat: 'NON_MESUREE', devise: bas(devise), tx: null, chemin: null,
      pourquoi: 'the currency and the block must both be addresses' };
  }
  if (bas(devise) === bas(block)) {
    return { etat: 'SANS_ROUTE', devise: bas(devise), tx: null, chemin: null,
      pourquoi: 'you cannot pay for a block with itself' };
  }
  const r = cheminEntre(bas(devise), bas(block), aretes);
  if (r.etat !== 'OK') {
    /* ⛔⛔ ICI VIT LA DISTINCTION QUI COMPTE. `cheminEntre` a REGARDE : il rend donc un verdict sur
     *   le graphe qu on lui a donne. Mais si les faits de CETTE devise n ont jamais ete lus, le
     *   graphe ne pouvait pas porter ses aretes — et le verdict porte sur notre lecture, pas sur
     *   la chaine. On ne transforme jamais notre incompletude en accusation. */
    if (!faitsLus) {
      return { etat: 'NON_MESUREE', devise: bas(devise), tx: null, chemin: null,
        pourquoi: 'we have not read this currency pools yet, so we do not know' };
    }
    return { etat: 'SANS_ROUTE', devise: bas(devise), tx: null, chemin: null,
      pourquoi: r.pourquoi || ('no path of ' + SAUTS_MAX + ' hops or fewer') };
  }
  const tx = transactionsNecessaires(r.chemin);
  return {
    etat: tx <= 1 ? 'UNE_TX' : 'PLUSIEURS_TX',
    devise: bas(devise),
    tx,
    chemin: r.chemin,
    segments: segmenterParFactory(r.chemin),
    /* ⛔ LES FAMILLES IGNOREES REMONTENT. Une route trouvee en ignorant un lieu qu on ne sait pas
     *   construire reste une bonne route — mais le createur doit pouvoir savoir qu il existait
     *   peut-etre plus court ailleurs. Taire une ignorance la rend invisible. */
    ignorees: r.ignorees || [],
    pourquoi: null,
  };
}

/**
 * LA LISTE COMPLETE, PRETE A REMPLIR UN SELECTEUR.
 *
 * @param {string} p.block            le block a acheter
 * @param {string} p.deviseDeLaPool   la devise de SA pool, LUE
 * @param {string} p.familleDuBlock   la famille de SA pool, LUE
 * @param {object[]} p.candidates     [{ adr, symbole, decimales, faitsLus }] — le registre
 * @param {object[]} p.aretes         les aretes mesurees AILLEURS (hors arete du block)
 *
 * ⛔⛔ SANS L ARETE DU BLOCK, ON REFUSE DE REPONDRE — on ne rend pas une liste vide. Une liste vide
 *   se lirait « aucune devise ne marche », alors que le fait est « on ne sait pas ou arrive ce
 *   block ». C est la difference entre un verdict et une panne, et elle change ce que l ecran dit.
 * ⛔ LA DEVISE DE LA POOL EST TOUJOURS EN TETE ET MARQUEE `DIRECTE`. Elle n a pas besoin du pont,
 *   et la faire passer par `cheminEntre` lui ferait parfois trouver une route PLUS LONGUE que la
 *   pool directe — on annoncerait 2 transactions la ou le chemin historique en demande 1.
 * ⛔ L ORDRE EST UN ORDRE DE COUT POUR L ACHETEUR : directe, puis une transaction, puis plusieurs.
 *   Les non-offertes suivent, parce qu elles doivent se LIRE sans se cliquer.
 */
export function devisesDentree({ block, deviseDeLaPool, familleDuBlock, candidates, aretes } = {}) {
  const arete = areteDuBlock({ block, deviseDeLaPool, famille: familleDuBlock });
  if (!arete) {
    return { etat: 'REFUSE', devises: [], offertes: [],
      pourquoi: 'we have not read which pool this block trades in, so we cannot say what you can pay with' };
  }
  const liste = Array.isArray(candidates) ? candidates : [];
  const graphe = (Array.isArray(aretes) ? aretes : []).concat([arete]);
  const vues = new Set([bas(deviseDeLaPool)]);
  const out = [{
    etat: 'DIRECTE', devise: bas(deviseDeLaPool), tx: 1, chemin: null, segments: null,
    ignorees: [], pourquoi: null,
    symbole: (liste.find((c) => c && bas(c.adr) === bas(deviseDeLaPool)) || {}).symbole || null,
    decimales: (liste.find((c) => c && bas(c.adr) === bas(deviseDeLaPool)) || {}).decimales,
  }];
  for (const c of liste) {
    if (!c || !estAdresse(c.adr) || vues.has(bas(c.adr))) continue;
    vues.add(bas(c.adr));
    const r = classerDevise({ devise: c.adr, block, aretes: graphe, faitsLus: !!c.faitsLus });
    out.push({ ...r, symbole: typeof c.symbole === 'string' ? c.symbole : null, decimales: c.decimales });
  }
  const rang = (e) => {
    const i = ETATS.indexOf(e.etat);
    return i < 0 ? ETATS.length : i;
  };
  out.sort((a, b) => (rang(a) - rang(b)) || ((a.tx || 9) - (b.tx || 9))
    || String(a.symbole || a.devise).localeCompare(String(b.symbole || b.devise)));
  return {
    etat: 'OK',
    devises: out,
    offertes: out.filter((d) => ETATS_OFFERTS.includes(d.etat)),
    pourquoi: null,
  };
}

/**
 * CETTE ROUTE PEUT-ELLE ETRE ASSEMBLEE **AUJOURD HUI** ? — et la reponse n est pas « y a-t-il une
 * route », c est « avons-nous l assembleur ».
 *
 * ⛔⛔⛔ DEUX QUESTIONS DIFFERENTES, ET LES CONFONDRE OFFRIRAIT UN BOUTON QUI REVERT.
 *   `cheminEntre` rend des sauts `{ de, vers, famille }` — SANS clef de pool. C est voulu : il
 *   decide sur l existence, pas sur l executabilite. Mais pour SIGNER il faut un assembleur, et
 *   nous en avons DEUX, qui ne couvrent pas la meme chose :
 *       `route-v4-multi-sauts.js`  -> un segment UNISWAP V4, 2 a 4 sauts, UNE transaction (prouve
 *                                     sur fork : OUSD -> USDC -> ETH -> TBLOCK, status 0x1)
 *       `calldata-aerodrome.js`    -> Aerodrome, et il ne partage NI le format d actions NI le
 *                                     chainage OPEN_DELTA de V4
 *   ⇒ Une route a PLUSIEURS segments demande donc deux transactions ET deux assembleurs, et la
 *     chainer dans un seul appel reverterait. Une route a UN segment AERODROME est franchissable
 *     en principe mais passe par l autre assembleur, qui n est pas cable sur ce chemin.
 *   ⇒ ON N OFFRE DONC QUE LE CAS **PROUVE** : un segment, famille `uniswap-v4`.
 * ⛔ ET LES AUTRES NE SONT PAS CACHEES, ELLES SONT DITES AVEC LEUR RAISON. Cacher une route
 *   existante parce que notre outillage ne la couvre pas encore ferait lire « impossible » une
 *   limite qui est la NOTRE. C est la meme distinction que SANS_ROUTE / NON_MESUREE, un cran plus
 *   loin : la chaine peut, nous pas encore.
 */
export function peutEtreAssemblee(d) {
  if (!d || !ETATS.includes(d.etat)) {
    return { ok: false, court: 'unknown', pourquoi: 'this route was not classified' };
  }
  if (d.etat === 'DIRECTE') {
    return { ok: true, pourquoi: null, court: null, par: 'chemin historique' };
  }
  if (!ETATS_OFFERTS.includes(d.etat)) {
    /* ⛔⛔ `court` EST UNE ETIQUETTE DE DEUX MOTS, ET ELLE EXISTE POUR UNE RAISON MESUREE : la
     *   phrase entiere, repetee une fois par devise, a produit un MUR DE TEXTE que Phil a entoure
     *   en rouge — puis, apres regroupement, un paragraphe encore trop long. Il a demande « resume
     *   en quelques mots ». L ecran montre donc `court` + un COMPTE, et garde `pourquoi` entier
     *   pour le survol.
     *   ⛔ ON NE REMPLACE PAS LA RAISON, ON LA RANGE : `pourquoi` reste rendu, intact. Raccourcir
     *     en PERDANT l explication serait l autre moitie du defaut — un refus qu on ne peut plus
     *     comprendre. */
    return { ok: false, pourquoi: d.pourquoi || 'this currency is not offered',
      court: d.etat === 'SANS_ROUTE' ? 'no route' : 'not checked' };
  }
  const segs = Array.isArray(d.segments) ? d.segments : [];
  if (segs.length === 1) {
    if (segs[0].famille === 'uniswap-v4') {
      return { ok: true, pourquoi: null, court: null, par: 'route-v4-multi-sauts', appels: 1 };
    }
    /* ⭐⭐ UN SEGMENT AERODROME EST OUVERT DEPUIS LE 2026-10-01, ET UNE MESURE A RENVERSE MA
     *   DECISION DE NE PAS LE BATIR. J avais chiffre le gain sur TOUTES les paires
     *   (devise d entree x block) : 1,2 %, « ca ne vaut pas un module ». Re-mesure depuis les DEUX
     *   devises que les gens detiennent reellement, sur les 245 marches servis :
     *       depuis OUSD   245/245 offerts   100 % du volume
     *       depuis USDC   236/245 offerts  mais 23,1 % du volume
     *   Les NEUF non batis depuis USDC sont AAPLc, METAc, GOOGLc, AMZNc, SNDKc... et ils portent
     *   76,9 % du volume. Un payeur en USDC — le cas le plus banal — ne pouvait acheter AUCUNE des
     *   actions qui font l argent.
     *   ⇒ « 1,2 % des paires » et « 76,9 % du volume depuis USDC » decrivent le MEME trou. Moyenner
     *     sur des paires que personne ne fait avait noye le seul chemin que tout le monde prend.
     *   ⇒ POURQUOI USDC ECHOUAIT LA OU OUSD REUSSISSAIT : `OUSD -> USDC -> action` traverse DEUX
     *     factories, donc c est un franchissement, et il etait bati. `USDC -> action` tient sur
     *     Aerodrome SEUL. Le plus simple etait le trou.
     * ⭐ ET C EST LE MEILLEUR RAPPORT GAIN/RISQUE DU LOT : un segment unique tient en UNE
     *   transaction (plus une approbation), donc AUCUNE exigence d atomicite — contrairement au
     *   franchissement, ferme aux wallets qui ne groupent pas. */
    if (segs[0].famille === 'aerodrome') {
      return { ok: true, pourquoi: null, court: null, par: 'aerodrome-segment', appels: 2,
        exigeAtomique: false };
    }
    return { ok: false, court: segs[0].famille + ' only',
      pourquoi: 'this route runs on ' + segs[0].famille
        + ', and we build Uniswap v4 and Aerodrome segments, not that venue' };
  }
  /* ⭐⭐ LE FRANCHISSEMENT A DEUX MONDES — ouvert le 2026-10-01 sur demande de Phil : « open OUSD a
   *   tt les action tokenized ». Les actions tokenisees vivent sur AERODROME, OUSD sur UNISWAP V4,
   *   et un seul `exactInput` ne traverse qu une factory. `planifierFranchissement` bati le lot
   *   [jambe1 V4, approve(pivot), jambe2 Aerodrome], envoye en UN LOT ATOMIQUE.
   *   ⛔ MESURE QUI DIT POURQUOI CETTE FORME-LA ET PAS UNE AUTRE : sur nos 249 lignes servies, les
   *     ONZE marches Aerodrome portent 96,4 % du volume (83 728 918 $ / 24 h) contre 3,6 % pour les
   *     238 marches Uniswap. Le rail a un seul segment atteignait 237 marches et 3,6 % de l argent.
   *   ⛔⛔ L ORDRE EST EXIGE, PAS DEDUIT : uniswap-v4 PUIS aerodrome. L inverse produirait un lot
   *     dont les approbations sont dans le mauvais ordre, et ca reverte APRES la signature — donc
   *     apres le gaz de l acheteur. La forme exacte est verifiee par
   *     `franchissement-depuis-chemin.js`, qui refuse aussi un segment Aerodrome a plusieurs sauts.
   *   ⚠️ ET CE N EST PAS « UNE TRANSACTION » : trois appels sous UNE signature quand le wallet sait
   *     grouper. Un wallet qui ne sait pas grouper ne peut pas prendre cette route — c est dit. */
  if (segs.length === 2 && segs[0].famille === 'uniswap-v4' && segs[1].famille === 'aerodrome'
    && segs[1].sauts.length === 1) {
    return { ok: true, pourquoi: null, court: null, par: 'franchissement', appels: 3,
      exigeAtomique: true };
  }
  /* ⛔ L ETIQUETTE NE COMMENCE PAS PAR UN CHIFFRE : l ecran l affiche precedee d un COMPTE, et
   *   « 4 2 venues » colle deux nombres et devient illisible. Le detail chiffre reste dans
   *   `pourquoi`, au survol. */
  return { ok: false, court: 'cross-venue',
    pourquoi: 'this route crosses ' + segs.length + ' venues as '
      + segs.map((s) => s.famille).join(' then ')
      + ', and the only crossing we build is uniswap-v4 then a single aerodrome hop' };
}

/**
 * LE RESUME DE CE QU ON N OFFRE PAS — groupe par RAISON, pas une ligne par devise.
 *
 * ⛔⛔⛔ CE QUE J AI DEPLOYE ETAIT ILLISIBLE, ET PHIL L A ENTOURE EN ROUGE SUR SA CAPTURE : quinze
 *   devises, quinze fois LA MEME phrase de quinze mots, bout a bout sous le selecteur. Personne ne
 *   lit ca. Un bloc de texte repete n informe pas — il APPREND A NE PLUS LIRE la zone, et la
 *   prochaine information utile qui s y affichera sera sautee elle aussi.
 *   ⇒ ET LE DEFAUT EST DE CONCEPTION, PAS DE MISE EN FORME : j avais mappe une raison PAR devise
 *     alors que la raison est la MEME pour toutes celles qui echouent pour la meme cause. On groupe
 *     donc par raison, et on nomme les devises concernees une seule fois.
 *
 * ⛔ ON NE CACHE RIEN POUR AUTANT : chaque devise lue reste nommee, et la raison reste entiere. La
 *   correction est de ne plus la REPETER, pas d en dire moins. Taire une devise mesuree serait
 *   retomber dans le defaut d a cote — une route reelle ni offerte ni dite.
 * ⛔ ET LA LISTE DE NOMS EST BORNEE, AVEC SON RESTE COMPTE : « et 9 autres » est une information ;
 *   une enumeration de trente symboles n en est pas une. Le compte total est toujours dit, pour
 *   qu on ne confonde jamais « on en montre 6 » avec « il y en a 6 ».
 */
export function resumeDesNonOffertes(devises, raisonDe, maxNoms = 6) {
  const liste = Array.isArray(devises) ? devises : [];
  const parRaison = new Map();
  for (const d of liste) {
    if (!d || d.etat === 'NON_MESUREE') continue; /* ⛔ on ne nomme pas ce qu on n a pas sonde */
    let r;
    try { r = raisonDe(d); } catch (_) { r = null; }
    if (!r) continue;
    const k = String(r);
    if (!parRaison.has(k)) parRaison.set(k, []);
    parRaison.get(k).push(d.symbole || String(d.devise).slice(0, 8));
  }
  /* ⛔ LA RAISON LA PLUS FREQUENTE D ABORD : c est celle qui concerne le plus de monde. */
  const groupes = [...parRaison.entries()].sort((a, b) => b[1].length - a[1].length);
  return groupes.map(([raison, noms]) => {
    const montres = noms.slice(0, maxNoms);
    const reste = noms.length - montres.length;
    return {
      raison,
      noms,
      total: noms.length,
      texte: montres.join(', ') + (reste > 0 ? ' and ' + reste + ' more' : '')
        + ' (' + noms.length + ') — ' + raison,
    };
  });
}

/**
 * LA PHRASE D UNE ENTREE DU SELECTEUR. ⛔ Elle porte TOUJOURS le nombre de signatures.
 *
 * ⛔ « plusieurs transactions » sans le chiffre est inutilisable : 2 et 4 ne se decident pas
 *   pareil. Un facteur sans son montant est une sur-vente, et ici c est une sous-information.
 * ⛔ ET LES DEUX ETATS NON OFFERTS NE DISENT PAS LA MEME CHOSE : l un est un verdict sur la
 *   chaine, l autre un aveu sur nous.
 */
export function phraseDevise(d, symboleBlock = 'this block') {
  if (!d || !ETATS.includes(d.etat)) return 'Not computed.';
  const sym = d.symbole || d.devise;
  if (d.etat === 'DIRECTE') return sym + ' — its own pool, one signature.';
  if (d.etat === 'UNE_TX') return sym + ' — routed to ' + symboleBlock + ', one signature.';
  if (d.etat === 'PLUSIEURS_TX') {
    return sym + ' — routed to ' + symboleBlock + ', ' + d.tx + ' signatures (the route changes venue '
      + (d.tx - 1) + (d.tx - 1 === 1 ? ' time' : ' times') + ').';
  }
  if (d.etat === 'SANS_ROUTE') return sym + ' — no route we can build reaches ' + symboleBlock + '.';
  return sym + ' — not checked yet, so we are not offering it.';
}
