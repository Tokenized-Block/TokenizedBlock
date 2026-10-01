/* LE PONT : ATTEINDRE CE QU UNE SEULE FACTORY N ATTEINT PAS.
 *
 * ⭐⭐ L IDEE EST DE PHIL (2026-10-01), et la mesure lui donne raison exactement :
 *   « regarde OUSD/NVIDA, NVIDA/APPL — la route n existe pas, mais cette double pool, la connexion
 *     si tu passes par NVIDA avec des micro tx pour eviter des grosses fluctuations du prix »
 *
 * ⛔⛔ CE QUE LA MESURE DIT, 0 NON MESURE : il y a DEUX MONDES DISJOINTS sur Base.
 *       monde UNISWAP V4  : ETH, USDC, OUSD, NVDAc
 *       monde AERODROME   : ETH, USDC, les QUINZE actions tokenisees
 *
 *   ⛔⛔⛔ CETTE LIGNE DISAIT « ET LA PLUPART DES BLOCKS » SUR AERODROME. C EST FAUX EN NOMBRE, et
 *     la mesure du 2026-10-01 sur nos 249 lignes servies le dit sans ambiguite :
 *         aerodrome    11 marches    83 728 918 $ de volume 24 h    96,4 %
 *         uniswap     238 marches     3 133 376 $ de volume 24 h     3,6 %
 *     ⇒ NOMBRE DE MARCHES et PART DU VOLUME ne disent PAS la meme chose, et les confondre renverse
 *       la conclusion. La quasi-totalite de nos MARCHES vit sur Uniswap ; la quasi-totalite de
 *       l ARGENT vit sur les onze marches Aerodrome — les actions tokenisees.
 *     ⇒ CE QUE CA CHANGE POUR LE RAIL OUSD : il atteint 237 des 249 marches EN UNE TRANSACTION,
 *       soit 95,2 %... qui portent 3,6 % du volume. Les onze qui portent les 96,4 % demandent DEUX
 *       transactions et DEUX assembleurs, et ce sont justement ceux qu on ne batit pas encore.
 *       Annoncer « 95 % des marches atteignables » serait VRAI et TROMPEUR.
 *     ⚠️ ET LA FAMILLE DE CES 249 LIGNES VIENT DE L AGREGATEUR, pas d une preuve on-chain : le
 *       serveur ne prouve la famille que pour les DEVISES. Le compte est donc sous hypothese.
 *
 *   OUSD a 0 pool Aerodrome (sonde sur les NEUF espacements declares, temoins : USDC/WETH 3,
 *   AAPLc/USDC 2). Et 14 des 15 actions ont 0 pool V4.
 *   ⇒ Un seul `exactInput` ne traverse QU UNE factory : OUSD -> AAPLc etait donc impossible.
 *
 * ⭐⭐⭐ LE PONT EST **USDC**, ET C EST MON PROPRE TEST QUI ME L A APPRIS.
 *   J avais conclu « NVDAc est le seul pont », parce que NVDAc est le seul JETON COTE present sur
 *   les deux factories (V4 fee 100 ET Aerodrome ts 10, mesure 0 non mesuree). C etait VRAI mais
 *   SANS INTERET : le premier chemin que ce module trouve pour OUSD -> AAPLc est
 *       OUSD -> USDC (Uniswap V4)  puis  USDC -> AAPLc (Aerodrome)
 *   soit DEUX sauts, et il ne passe pas par NVDAc du tout. Parce qu USDC est lui aussi dans les
 *   DEUX mondes — et de loin le plus profond (mesure : USDC/WETH 3 pools Aerodrome, ETH/USDC
 *   4 pools V4).
 *   ⇒ `le pont est USDC` est plus simple ET plus fort : les QUINZE actions sont atteignables depuis
 *     OUSD en DEUX transactions, par le jeton le plus liquide de Base, sans dependre de NVDAc.
 *   ⛔ J ai failli publier « NVDAc est le seul pont ». Le test a casse mon RECIT, pas mon code —
 *     c est exactement a ca qu il sert, et l assertion qui l a attrape encodait ma croyance.
 *   ⚠️ NVDAc reste une arete utile (elle double la connexion), elle n est simplement pas necessaire.
 *
 *       OUSD    V4 seulement
 *       USDC    V4 **ET** Aerodrome   <- LE PONT
 *       NVDAc   V4 **ET** Aerodrome   <- pont de secours, mesure, non necessaire
 *       les 14 autres actions         Aerodrome seulement
 *
 * ⛔ CE MODULE NE LIT RIEN ET NE SIGNE RIEN. Il decide sur des aretes DEJA MESUREES, et il rend
 *   des SEGMENTS. Melanger la lecture et la decision rendrait un refus indistinguable d une
 *   lecture ratee — le defaut numero un de ce depot.
 * ⛔ ET IL NE PROMET JAMAIS UNE SEULE TRANSACTION QUAND IL EN FAUT DEUX. Un chemin a deux
 *   segments demande deux signatures, ou un lot atomique qu une PART IMPORTANTE des wallets ne
 *   tient pas. Le dire est tout l interet de ce fichier.
 *   ⛔⛔ CETTE LIGNE DISAIT « 40,5 % », ET CE N EST PAS UN TAUX. Relecture de l entonnoir servi le
 *     2026-10-01, par jour : 2026-09-29 -> 15 non sur 24 (62,5 %) ; 2026-09-30 -> 3 non sur 16
 *     (18,8 %) ; cumul 18/40 (45,0 %). Les DEUX seuls jours se CONTREDISENT, et n=24 puis n=16 ne
 *     permettent pas de trancher entre bruit et changement reel. Un chiffre qui porte une decision
 *     doit porter sa borne — voir `frais-hors-routeur.js` pour le detail et ce qui reste vrai.
 */

/** Les familles de marche que nos calldata savent construire. ⛔ Rien d autre n est routable. */
export const FAMILLES = Object.freeze(['aerodrome', 'uniswap-v4']);

/** ⛔ Au-dela, le chemin devient une loterie : chaque saut est une occasion d echouer. */
export const SAUTS_MAX = 4;

const bas = (a) => String(a || '').toLowerCase();

function areteValide(e) {
  return !!e && typeof e === 'object'
    && typeof e.de === 'string' && e.de !== ''
    && typeof e.vers === 'string' && e.vers !== ''
    && FAMILLES.includes(e.famille);
}

/**
 * LE CHEMIN LE PLUS COURT ENTRE DEUX JETONS, SUR LE GRAPHE DES ARETES MESUREES.
 *
 * @param {string} de
 * @param {string} vers
 * @param {object[]} aretes  [{ de, vers, famille }] — MESUREES, jamais supposees.
 *
 * ⛔ UNE ARETE EST BIDIRECTIONNELLE : la pool A/B sert A->B et B->A. Exiger le sens ferait rater
 *   des chemins franchissables, et ce refus-la coute un echange.
 * ⛔ UNE FAMILLE HORS DE `FAMILLES` EST IGNOREE **ET NOMMEE** : on ne sait pas construire son
 *   calldata, donc la router serait promettre un appel qu on ne peut pas faire. La taire ferait
 *   lire « pas de chemin » alors qu on n aurait pas su lire celle-la.
 * ⛔ ET LE PARCOURS EST EN LARGEUR, donc le chemin rendu est le PLUS COURT en nombre de sauts —
 *   pas le moins cher. Le prix se cote ailleurs ; ici on cherche l existence.
 */
export function cheminEntre(de, vers, aretes) {
  if (typeof de !== 'string' || typeof vers !== 'string' || !de || !vers) {
    return { etat: 'REFUSE', chemin: null, ignorees: [], pourquoi: 'both ends must be given' };
  }
  const brutes = Array.isArray(aretes) ? aretes : [];
  const ignorees = brutes.filter((e) => e && typeof e === 'object' && e.famille
    && !FAMILLES.includes(e.famille)).map((e) => String(e.famille));
  const bonnes = brutes.filter(areteValide);
  if (!bonnes.length) {
    return { etat: 'REFUSE', chemin: null, ignorees,
      pourquoi: 'no usable edge was measured' + (ignorees.length ? ' (' + ignorees.length + ' on venues we cannot build)' : '') };
  }
  if (bas(de) === bas(vers)) {
    return { etat: 'REFUSE', chemin: null, ignorees, pourquoi: 'both ends are the same token' };
  }
  /* Voisins, dans les deux sens. */
  const voisins = new Map();
  const ajouter = (a, b, e) => {
    const k = bas(a);
    if (!voisins.has(k)) voisins.set(k, []);
    voisins.get(k).push({ vers: b, famille: e.famille });
  };
  for (const e of bonnes) { ajouter(e.de, e.vers, e); ajouter(e.vers, e.de, e); }

  /* ⛔⛔⛔ ON MINIMISE LES SEGMENTS, PAS LES SAUTS — ET C EST MA PROPRE SORTIE QUI L A EXIGE.
   *   Ma premiere version faisait un simple parcours en largeur sur les NOEUDS : elle rendait le
   *   chemin le plus court en SAUTS, et prenait la premiere arete trouvee. Resultat mesure pour
   *   ETH -> AAPLc : elle empruntait ETH -> USDC en Uniswap V4 puis USDC -> AAPLc en Aerodrome,
   *   soit DEUX segments donc DEUX transactions — alors que ETH <-> USDC existe AUSSI sur
   *   Aerodrome, et que le chemin tient donc ENTIEREMENT sur une seule factory : UNE transaction.
   *   ⇒ J aurais dit au createur « il faudra 2 transactions » quand UNE suffit. Une sous-vente
   *     fausse decourage une paire parfaitement bonne, et l anti-hype coupe dans les DEUX sens :
   *     on ne surestime pas le cout plus qu on ne le sous-estime.
   *   ⇒ L etat du parcours est donc (NOEUD, FAMILLE COURANTE), et le cout est le NOMBRE DE
   *     CHANGEMENTS de factory. A cout egal, le moins de sauts gagne.
   * ⛔ ET LA PROFONDEUR RESTE BORNEE : un chemin de dix sauts n est pas une route, c est une
   *   accumulation de glissement et d occasions d echouer. */
  const cle = (noeud, famille) => noeud + '|' + (famille || '');
  /* File par cout croissant : on traite d abord tout ce qui ne change pas de factory. */
  let courant = [{ noeud: bas(de), famille: null, sauts: [] }];
  const vus = new Map([[cle(bas(de), null), 0]]);
  let meilleur = null;
  for (let cout = 0; cout <= FAMILLES.length && courant.length; cout += 1) {
    const suivant = [];
    /* Parcours en largeur A COUT CONSTANT : on explore tout ce qui reste sur la meme factory. */
    for (let i = 0; i < courant.length; i += 1) {
      const { noeud, famille, sauts } = courant[i];
      if (sauts.length >= SAUTS_MAX) continue;
      for (const v of (voisins.get(noeud) || [])) {
        const changement = famille !== null && v.famille !== famille;
        const suite = [...sauts, { de: noeud, vers: bas(v.vers), famille: v.famille }];
        if (bas(v.vers) === bas(vers)) {
          /* ⛔ ON NE REND PAS LA PREMIERE ARRIVEE : on garde la MOINS CHERE en segments, et a cout
           *   egal la plus COURTE. Rendre la premiere etait tout le defaut. */
          if (!changement) return { etat: 'OK', chemin: suite, ignorees, pourquoi: null };
          if (!meilleur || suite.length < meilleur.length) meilleur = suite;
          continue;
        }
        const k = cle(bas(v.vers), v.famille);
        const dejaVu = vus.get(k);
        const coutIci = cout + (changement ? 1 : 0);
        if (dejaVu !== undefined && dejaVu <= coutIci) continue;
        vus.set(k, coutIci);
        (changement ? suivant : courant).push({ noeud: bas(v.vers), famille: v.famille, sauts: suite });
      }
    }
    /* ⛔ Une arrivee trouvee a CE cout est deja optimale : tout ce qui suit coute plus cher. */
    if (meilleur) return { etat: 'OK', chemin: meilleur, ignorees, pourquoi: null };
    courant = suivant;
  }
  if (meilleur) return { etat: 'OK', chemin: meilleur, ignorees, pourquoi: null };
  return { etat: 'REFUSE', chemin: null, ignorees,
    pourquoi: 'no path of ' + SAUTS_MAX + ' hops or fewer joins these two tokens' };
}

/**
 * DECOUPER UN CHEMIN EN SEGMENTS, UN PAR FACTORY — parce qu un `exactInput` n en traverse qu une.
 *
 * ⛔⛔ C EST LA RAISON D ETRE DU MODULE. Un chemin OUSD -> USDC -> NVDAc -> USDC -> AAPLc existe,
 *   mais ses trois premiers sauts sont sur V4 et le dernier sur Aerodrome : le franchir en UN appel
 *   reverterait. Chaque segment est UN appel ; le nombre de segments est le nombre de SIGNATURES
 *   (ou la taille du lot atomique).
 * ⛔ ON NE REGROUPE PAS LES SEGMENTS NON CONTIGUS. A -> B sur V4, B -> C sur Aerodrome, C -> D sur
 *   V4 fait TROIS segments, pas deux : l ordre du chemin est l ordre des appels, et reordonner
 *   casserait le chainage.
 */
export function segmenterParFactory(chemin) {
  if (!Array.isArray(chemin) || !chemin.length) return [];
  const segments = [];
  for (const saut of chemin) {
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.famille === saut.famille) dernier.sauts.push(saut);
    else segments.push({ famille: saut.famille, sauts: [saut] });
  }
  return segments;
}

/** Combien de transactions ce chemin demande-t-il ? ⛔ Un segment = un appel. Jamais « environ ». */
export function transactionsNecessaires(chemin) {
  return segmenterParFactory(chemin).length;
}

/**
 * NOTRE PART SUR LE PONT : 0,1 % PAR TRANSACTION (decision de Phil, 2026-10-01).
 * ⛔ 10 bps, la meme valeur que `FRAIS_INTERFACE_BPS_CL` du routeur Aerodrome — « comme d hab »,
 *   et le depot au wallet de frais (a6cf).
 */
export const FRAIS_PONT_BPS = 10n;

/**
 * CE QUE LE PONT COUTE EN TOUT — ET POURQUOI CE N EST PAS 0,1 %.
 *
 * ⛔⛔⛔ LE FRAIS EST PAR TRANSACTION, DONC UNE ROUTE A DEUX SEGMENTS LE PAIE DEUX FOIS : 0,2 %, pas
 *   0,1 %. Annoncer « 0,1 % » sur une route a deux segments serait sous-evaluer le prix — la faute
 *   exacte que ce depot a deja payee ce matin meme (« 50 bps » annonce pour un echange qui coute
 *   3 %, sous-evalue d un facteur six, EN PRODUCTION, et un test vert garantissait le faux chiffre).
 *   ⇒ Cette fonction rend donc le TOTAL et le NOMBRE DE PRELEVEMENTS, et la phrase dit les deux.
 *     Un taux affiche qui n est pas le taux paye est une promesse rompue.
 *
 * ⛔ ET LE TOTAL EST UN MINIMUM, PAS UN PRIX COMPLET : chaque marche prend AUSSI son propre frais
 *   (3 % sur une pool ouverte chez nous, le sien ailleurs), et chaque saut a son glissement. Ce
 *   chiffre est NOTRE part, pas le cout de l echange.
 */
export function fraisDuPont(chemin, bpsParTx = FRAIS_PONT_BPS) {
  const segments = segmenterParFactory(chemin);
  let b;
  try { b = BigInt(bpsParTx); } catch (_) { b = -1n; }
  if (!segments.length) {
    return { etat: 'REFUSE', prelevements: 0, bpsParTx: null, bpsTotal: null,
      pourquoi: 'no route, so nothing is charged' };
  }
  if (b < 0n || b > 500n) {
    /* ⛔ Au-dela de 500 bps ce n est plus un frais d interface, c est une saisie. */
    return { etat: 'REFUSE', prelevements: segments.length, bpsParTx: null, bpsTotal: null,
      pourquoi: 'a per-transaction fee of ' + String(bpsParTx) + ' bps is not an interface fee' };
  }
  return {
    etat: 'OK',
    prelevements: segments.length,
    bpsParTx: b,
    bpsTotal: b * BigInt(segments.length),
    pourquoi: null,
  };
}

/** La phrase du frais. ⛔ Elle dit le TOTAL, et elle dit que ce n est pas le cout complet. */
export function phraseFraisDuPont(f) {
  if (!f || f.etat !== 'OK') return 'Fee: not computed' + (f && f.pourquoi ? ' — ' + f.pourquoi : '') + '.';
  const parTx = Number(f.bpsParTx) / 100;
  const total = Number(f.bpsTotal) / 100;
  if (f.prelevements === 1) {
    return 'This app keeps ' + parTx + '%, taken once.';
  }
  /* ⛔ LE TOTAL EN PREMIER : c est ce que la personne paie. Le detail vient apres. */
  return 'This app keeps ' + total + '% in total — ' + parTx + '% on each of the '
    + f.prelevements + ' transactions this route needs. Each market also charges its own fee on '
    + 'top, and every hop has its own price impact: this is our share, not the cost of the trade.';
}

/**
 * EN COMBIEN DE TRANCHES FAUT-IL COUPER POUR TENIR SOUS UN GLISSEMENT DONNE ?
 *
 * ⭐ L IDEE EST DE PHIL : « des micro tx pour eviter des grosses fluctuations du prix ». Elle est
 *   juste, et elle est mesurable — MSTRc rend 381 bps sur la taille de reference, au-dessus de
 *   notre plafond de 300.
 *
 * ⛔⛔ ET VOICI CE QUE CE CALCUL NE PROUVE PAS, PARCE QUE C EST LA MOITIE QUI COMPTE. Le glissement
 *   d un AMM ne baisse PAS proportionnellement au montant : il est a peu pres LINEAIRE en taille
 *   pour de petites tailles, donc couper en N donne environ bps/N PAR TRANCHE — mais les tranches
 *   se suivent, et chacune part du prix que la precedente a deja bouge. Le total encaisse reste
 *   donc du meme ordre : on lisse l IMPACT INSTANTANE, on ne supprime pas le cout.
 *   ⇒ CE QU ON GAGNE VRAIMENT : passer sous un PLAFOND PAR TRANSACTION (le notre est a 300 bps),
 *     et laisser l arbitrage ramener le prix entre deux tranches. Ce qu on PERD : N fois le gas,
 *     et N occasions d echouer.
 *   ⇒ Ce module rend donc un NOMBRE DE TRANCHES et le DIT comme une estimation lineaire, jamais
 *     comme une garantie. Un chiffre presente comme une garantie serait une sur-vente.
 */
export function tranchesPourTenirLeSeuil({ glissementBps, seuilBps, trancheMax = 20 } = {}) {
  /* ⛔⛔ ON CONTROLE LE TYPE, ON NE CONVERTIT PAS — ET C EST MON TEST QUI L A EXIGE. Ma premiere
   *   version faisait `Number(glissementBps)` : or `Number(null)` vaut ZERO, fini et positif, donc
   *   un glissement JAMAIS MESURE passait pour un marche PARFAIT et rendait « une seule tranche ».
   *   C est `un retour neutre qui avale un echec`, le motif numero un de ce depot, et il serait
   *   arrive ici sur un chemin qui porte de l argent. Un bigint est accepte (les bps circulent en
   *   bigint ailleurs), une chaine et `null` ne le sont pas. */
  const nombre = (x) => (typeof x === 'number' && Number.isFinite(x) ? x
    : (typeof x === 'bigint' ? Number(x) : null));
  const g = nombre(glissementBps);
  const s = nombre(seuilBps);
  if (g === null || g < 0) {
    return { etat: 'NON_MESURE', tranches: null, pourquoi: 'the slippage was never measured' };
  }
  if (s === null || s <= 0) {
    return { etat: 'NON_MESURE', tranches: null, pourquoi: 'a positive bound is required' };
  }
  if (g <= s) return { etat: 'OK', tranches: 1, pourquoi: 'one transaction already fits under the bound' };
  const n = Math.ceil(g / s);
  if (n > trancheMax) {
    /* ⛔ AU-DELA, CE N EST PLUS UN DECOUPAGE, C EST UN RENONCEMENT DEGUISE : N fois le gas et N
     *   occasions d echouer pour un marche trop mince. On le DIT au lieu de rendre 47. */
    return { etat: 'REFUSE', tranches: null,
      pourquoi: 'it would take ' + n + ' slices to fit under ' + s + ' bps — this market is too thin for the size' };
  }
  return { etat: 'OK', tranches: n,
    pourquoi: 'about ' + n + ' slices, assuming impact grows roughly linearly with size — an '
      + 'estimate, not a guarantee: each slice starts from the price the one before it moved' };
}

/**
 * LA PHRASE MONTREE. ⛔ ELLE DIT LE NOMBRE DE TRANSACTIONS, parce que c est ce que la personne va
 *   signer. Annoncer « un echange » quand il en faut deux est la seule chose qu on ne peut pas
 *   rattraper apres coup.
 */
export function phrasePont(r, symboles = {}) {
  if (!r || (r.etat !== 'OK' && r.etat !== 'REFUSE')) return 'Route: not computed.';
  const nom = (a) => symboles[bas(a)] || (String(a).slice(0, 6) + '…' + String(a).slice(-4));
  if (r.etat === 'REFUSE') {
    return 'No route here (' + (r.pourquoi || 'unknown') + ').'
      + (r.ignorees && r.ignorees.length
        ? ' ' + r.ignorees.length + ' pool(s) were skipped because this app cannot build their venue.' : '');
  }
  const segments = segmenterParFactory(r.chemin);
  const route = [r.chemin[0].de, ...r.chemin.map((s) => s.vers)].map(nom).join(' → ');
  if (segments.length === 1) {
    return route + ' — one transaction, through ' + segments[0].famille + '.';
  }
  return route + ' — ' + segments.length + ' transactions, because the pools sit on '
    + segments.map((s) => s.famille).join(' then ')
    + ' and one swap cannot cross two venues. Each one has to be signed.';
}
