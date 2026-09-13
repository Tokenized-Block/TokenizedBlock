// pointsdevie.js — les PV d un block : la racine cubique de sa capitalisation.
// ================================================================================================
// ⛔ L ECHELLE VIENT DE PHIL, ET ELLE EST JUSTE. « k = 10, M = 100, B = 1000 ». Autrement dit :
//        1 000 $        ->    10 PV
//        1 000 000 $    ->   100 PV
//        1 000 000 000 $-> 1 000 PV
//    C est exactement `PV = capitalisation ^ (1/3)`. La racine cubique, pas un bareme invente :
//    chaque fois que la capitalisation est multipliee par 1 000, les PV sont multiplies par 10.
//    ⚠️ Une echelle LINEAIRE serait inutilisable — un block a 2 000 $ et un a 2 000 000 $ auraient
//       la meme barre a l ecran, l un colle a zero et l autre au plafond. Le logarithme n est pas
//       une astuce d affichage, c est ce qui rend la grandeur LISIBLE.
//
// ⛔⛔ ET LA CAPITALISATION N EST PAS UNE OPINION : c est `prix x supply`, deux valeurs qui se
//    RELISENT. Personne ne peut la peindre. C est ce qui distingue cette barre de vie de toutes
//    les autres : elle n est pas decidee par nous.
//
// ⛔ SANS PRIX, IL N Y A PAS DE PV. Pas zero — RIEN. Un block sans pool n a pas une capitalisation
//    de zero, il a une capitalisation NON MESURABLE, et afficher 0 PV le dirait mort alors qu il
//    est seulement jamais echange. C est le meme refus que partout ici.
//
// ⛔ CE QUE LES PALIERS N OUVRIRONT JAMAIS. Ils debloquent du DECOR, de la place, de la lecture.
//    Jamais une garde de securite, jamais un avertissement, jamais une verification. Cacher une
//    protection derriere une capitalisation reviendrait a proteger les gros et exposer les petits —
//    exactement l inverse de ce que ce projet raconte.
//
// ⚠️ ET LA BARRE PEUT DESCENDRE. Une capitalisation baisse. Un jeu ou la barre ne fait que monter
//    ment sur ce qu est un marche ; il faut que le mot le dise quand ca descend.

/** Les paliers, du plus bas au plus haut. `mc` est le seuil de capitalisation en devise de cotation. */
export const PALIERS = [
  /* ⛔⛔ PROMESSES TENUES (Phil, 2026-09-13 : « faut tenir les promesses qu on a inscrites »). Mesure en relisant
   *    l app : AUCUNE fonction n est reservee a un palier — ornements, ecart et photo sont ouverts a tous des
   *    Create, et « History window », « block card », « companion panel set » n existent pas. Le texte promettait
   *    ce que le code ne fait pas. Il dit maintenant ce qui est VRAI : un nom, et une tuile qui grandit avec la vie. */
  { cle: 'GRAINE',   mc: 0,        titre: 'Seed',      ouvre: 'the Seed name on its profile' },
  { cle: 'POUSSE',   mc: 1e3,      titre: 'Sprout',    ouvre: 'the Sprout name, and a larger tile on the map' },
  { cle: 'BRANCHE',  mc: 1e4,      titre: 'Branch',    ouvre: 'the Branch name, and a larger tile on the map' },
  { cle: 'TRONC',    mc: 1e5,      titre: 'Trunk',     ouvre: 'the Trunk name, and a larger tile on the map' },
  { cle: 'CANOPEE',  mc: 1e6,      titre: 'Canopy',    ouvre: 'the Canopy name, and a larger tile on the map' },
  { cle: 'FORET',    mc: 1e8,      titre: 'Forest',    ouvre: 'the Forest name, and a larger tile on the map' },
  { cle: 'MONUMENT', mc: 1e9,      titre: 'Monument',  ouvre: 'nothing more — the top is a name, not a privilege' },
];

/**
 * Les PV d une capitalisation.
 * ⛔ Rend `null` quand la capitalisation n est pas mesurable. JAMAIS zero : zero se lirait
 *    « ce block est mort », alors que « pas de prix » veut dire « jamais echange ».
 */
export function pointsDeVie(capitalisation) {
  if (typeof capitalisation !== 'number' || !Number.isFinite(capitalisation) || capitalisation < 0) return null;
  /* ⚠️ `Math.cbrt` et pas `x ** (1/3)` : sur les tres petites valeurs la seconde forme derive, et
   *    une barre de vie qui saute d un pixel a chaque relecture parait cassee. */
  return Math.round(Math.cbrt(capitalisation) * 10) / 10;
}

/**
 * La capitalisation, DERIVEE — jamais saisie.
 * @param {bigint|null} supply     totalSupply en unites brutes
 * @param {number|null} decimales  decimales du jeton
 * @param {number|null} prix       prix d UNE unite entiere, dans la devise de cotation
 * @param {string|null} devise     le NOM de la devise — obligatoire des qu il y a un prix
 */
export function capitalisation({ supply, decimales, prix, devise }) {
  if (typeof supply !== 'bigint' || supply < 0n) return { valeur: null, pourquoi: 'supply unread' };
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 36) return { valeur: null, pourquoi: 'decimals unread — never assumed 18' };
  if (typeof prix !== 'number' || !Number.isFinite(prix) || prix < 0) return { valeur: null, pourquoi: 'no price — this block has never been quoted' };
  /* ⛔ LA DEVISE EST OBLIGATOIRE DES QU IL Y A UN PRIX. « 1 200 » sans devise n est pas un montant :
   * en ETH et en USDC ce sont deux blocks tres differents, et l ecran afficherait le meme chiffre. */
  if (typeof devise !== 'string' || !devise.trim()) return { valeur: null, pourquoi: 'price without a named currency — refusing to show a bare number' };
  /* ⚠️ On passe en Number APRES la division : `Number(supply)` sur 1e27 unites brutes perd de la
   * precision bien avant. On divise en BigInt, puis on convertit la partie entiere et on rajoute
   * la fraction — la precision d un double suffit largement pour une capitalisation affichee. */
  const base = 10n ** BigInt(decimales);
  const entier = Number(supply / base);
  const reste = Number(supply % base) / Number(base);
  const unites = entier + reste;
  return { valeur: unites * prix, unites, devise: devise.trim(), pourquoi: null };
}

/**
 * L effet d un achat sur les PV — le « docteur » de Phil, dit pour ce qu il est.
 *
 * ⛔⛔ AJOUTER DE LA LIQUIDITE N AUGMENTE PAS LA CAPITALISATION. C est la precision qui change la
 *    mecanique : la liquidite ajoute de la PROFONDEUR, le prix ne bouge pas, donc `prix x supply`
 *    non plus. La SEULE facon dont de l argent fait monter la capitalisation, c est ACHETER le
 *    jeton. Une app qui dirait « ajoute de la liquidite pour monter tes PV » mentirait sur une
 *    grandeur que l utilisateur peut verifier lui-meme en trente secondes.
 *
 * ⛔⛔⛔ ET UN ACHAT EST UN ACHAT. Appeler ca « payer le docteur » cacherait que l utilisateur
 *    acquiert une position qui peut BAISSER. Les PV gagnes ne sont pas acquis : ils descendent
 *    avec le prix, et personne ne rembourse. On rend donc les avertissements AVEC le chiffre, dans
 *    le meme objet, pour qu un appelant ne puisse pas afficher l un sans l autre.
 *
 * ⛔ L ARGENT NE VA PAS A NOUS. Il va dans la pool, contre des jetons que l acheteur detient. Un
 *    « soin » paye a l editeur contre un chiffre affiche serait la vente d un nombre.
 *
 * ⚠️ LES DEUX PRIX SONT MESURES, JAMAIS MODELISES. On ne calcule pas l impact d un achat sur le
 *    prix : on le DEMANDE au quoteur avant et apres. Modeliser demanderait la profondeur exacte de
 *    la pool, et une estimation fausse ici se paierait en argent reel.
 *
 * @param {number|null} capAvant  capitalisation mesuree avant
 * @param {number|null} capApres  capitalisation issue d un prix QUOTE apres l achat
 */
export function effetAchat(capAvant, capApres) {
  const pvAvant = pointsDeVie(capAvant);
  const pvApres = pointsDeVie(capApres);
  const avertissements = [
    'This is a BUY, not a repair. You receive units of the token; you are not paying us for a heal.',
    'HP follows the market cap. If the price falls, the HP you just bought falls with it — nobody refunds it.',
    'Adding liquidity would NOT raise the market cap: it adds depth, the price does not move. Only a buy does.',
  ];
  if (pvAvant === null || pvApres === null) {
    return {
      pvAvant, pvApres, gain: null,
      /* ⛔ Sans les DEUX prix mesures, on ne promet aucun gain. Afficher « +N PV » sur une
       * estimation ferait payer quelqu un pour un chiffre qu on a devine. */
      pourquoi: 'both prices must be quoted — no HP gain is promised from an estimate',
      avertissements,
    };
  }
  return {
    pvAvant, pvApres,
    gain: Math.round((pvApres - pvAvant) * 10) / 10,
    pourquoi: null,
    avertissements,
  };
}

/** Le palier atteint par une capitalisation. ⛔ `null` si elle n est pas mesurable. */
export function palierDe(capitalisation) {
  if (typeof capitalisation !== 'number' || !Number.isFinite(capitalisation) || capitalisation < 0) return null;
  let atteint = PALIERS[0];
  for (const p of PALIERS) if (capitalisation >= p.mc) atteint = p;
  return atteint;
}

/**
 * Ce que le palier ouvre, et ce qu il reste a atteindre.
 * ⛔ AUCUN PALIER N OUVRE UNE GARDE. Un test le verifie, parce que le jour ou quelqu un mettra un
 *    avertissement derriere un seuil, il protegera les gros et exposera les petits.
 */
export function etatPaliers(capitalisation) {
  const p = palierDe(capitalisation);
  if (!p) {
    return {
      palier: null,
      /* ⛔ NON MESURE ≠ PALIER LE PLUS BAS. Sans prix, on n ouvre RIEN et on ne ferme rien non plus :
       * on ne sait pas. Les fonctionnalites restent a leur etat par defaut, pas verrouillees. */
      ouverts: [], prochain: null,
      note: 'No measurable market cap — nothing is unlocked and nothing is locked. This block has simply never been quoted.',
    };
  }
  const i = PALIERS.indexOf(p);
  const prochain = PALIERS[i + 1] || null;
  return {
    palier: p,
    ouverts: PALIERS.slice(0, i + 1),
    prochain: prochain ? { ...prochain, manque: prochain.mc - capitalisation } : null,
    /* ⚠️ LE MOT DIT QUE CA PEUT DESCENDRE. Un jeu ou la barre ne fait que monter ment sur ce qu est
     * un marche, et c est le genre de mensonge qui se paie avec l argent de quelqu un. */
    note: 'Tiers follow the market cap, and a market cap goes down as well as up. A tier is a state, not a reward you keep.',
  };
}

/**
 * La jauge vers le palier suivant, en DOLLARS.
 * ⛔⛔ BUG TROUVE LE 2026-09-13 : l echelle de ce module est en dollars (« 1 000 $ -> 10 PV », PALIERS
 *    1e3, 1e6…), mais le profil lui passait la capitalisation EN ETH (`vieDuBlock`). « Sprout at 1,000 »
 *    voulait donc dire 1 000 ETH, environ trois mille fois le seuil voulu. L appelant convertit en
 *    dollars avec un prix ETH MESURE ; sans prix, la jauge n est pas jugee — jamais estimee.
 * ⚠️ La barre avance en racine cubique, comme les PV (un lineaire serait colle a zero).
 * @returns {{etat:'LU'|'NON_MESURABLE', index:number, palier:object|null, prochain:object|null, pct:number|null}}
 */
export function progressionPalier(capUsd) {
  const e = etatPaliers(capUsd);
  if (!e.palier) return { etat: 'NON_MESURABLE', index: -1, palier: null, prochain: null, pct: null };
  const index = PALIERS.indexOf(e.palier);
  const pct = e.prochain
    ? (Math.cbrt(capUsd) - Math.cbrt(e.palier.mc)) / (Math.cbrt(e.prochain.mc) - Math.cbrt(e.palier.mc))
    : 1;
  return { etat: 'LU', index, palier: e.palier, prochain: e.prochain, pct: Math.max(0, Math.min(1, pct)) };
}
