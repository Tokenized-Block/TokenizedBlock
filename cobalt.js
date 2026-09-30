/* COBALT — CE QUE LE HARDFORK A AJOUTE SUR LA CHAINE, ET CE QUE NOTRE APP DOIT EN LIRE.
 *
 * ✅ ACTIVATION MESUREE, PAS ANNONCEE. Base a publie « Indexers will need to update to the new ABI
 *   for the hardfork » sans donner de bloc. On l a trouve par bissection sur la chaine :
 *
 *     bloc 52 000 926  -> `updateUIMultiplier(uint256,uint256)` ABSENTE
 *     bloc 52 000 927  -> PRESENTE          (2026-09-30T18:00:01Z)
 *
 *   ⭐ ET LA MEME FRONTIERE, AU MEME BLOC, SUR TROIS B20 INDEPENDANTS : AAPLc (Asset Coinbase),
 *     OUSD (stablecoin institutionnel) et notre Block 0. C est CA qui distingue un hardfork d une
 *     mise a jour de contrat : une mise a jour touche une adresse, un fork les bascule toutes au
 *     meme bloc. Un horodatage a la seconde ronde (18:00:01 UTC) va dans le meme sens.
 *
 * ⛔⛔ COMMENT ON A MESURE, PARCE QUE LA METHODE EST LE RESULTAT. Un B20 n a qu UN OCTET de code
 *   (`0xef`) : rien a desassembler, aucune ABI a extraire. Et `updateUIMultiplier` est une
 *   ECRITURE reservee a un role — appelee en `eth_call` par une adresse quelconque, elle REVERTE
 *   MEME QUAND ELLE EXISTE. Une sonde qui classe « repond » contre « reverte » ne peut donc PAS la
 *   trouver : c est le defaut de ma premiere version, et son « 0 trouvee sur 30 » etait garanti par
 *   sa construction, pas par la chaine.
 *   ✅ LE VRAI DISCRIMINANT EST LA CHARGE DU REVERT, et il a trois etats verifiables :
 *       fonction absente          -> reecho NU du selecteur envoye      (`0xe6323eb5` -> `0xe6323eb5`)
 *       presente, droits refuses  -> `0xe2517d3f` + adresse + hash de role
 *       presente et lisible       -> la valeur
 *     Le temoin negatif PROUVE la forme de l absence sur le contrat qu on interroge, au lieu de la
 *     supposer. ⛔ Et ma premiere version du comparateur comparait la charge du candidat a celle du
 *     temoin : comme la charge EST le selecteur, deux selecteurs differents ne peuvent jamais etre
 *     egaux — la comparaison etait vraie par construction et rendait 8 « presentes » sur 8. La
 *     forme de l absence n est pas une VALEUR, c est une RELATION : donnee == selecteur envoye.
 *
 * ⛔ ET LES NOMS DE L ANNONCE NE SONT PAS DES SELECTEURS. Le billet ecrit « seizeWithMemo », «
 *   composite policies », « schedule multiplier updates ». La doc publiee donne `seize(from,to,
 *   amount,memo)`, `createPolicy()`/`attachPolicy()`, `updateUIMultiplier(multiplier,effectiveAt)`.
 *   J ai sonde huit noms tires de la prose : huit absents, et c etait exact — ils n existent nulle
 *   part. Une prose n est pas une ABI.
 */

/** ⭐ Premier bloc ou la surface Cobalt repond. Mesure par bissection, fenetre d UN bloc. */
export const BLOC_COBALT = 52000927;
export const HORODATAGE_COBALT = '2026-09-30T18:00:01Z';

/** La charge de revert d OpenZeppelin `AccessControlUnauthorizedAccount(address,bytes32)`. */
export const ERREUR_DROITS = '0xe2517d3f';

/**
 * ⛔ SELECTEUR CALCULE PAR KECCAK sur `uiMultiplier()`, PAS RECITE — puis VERIFIE EN VIVANT sur
 *   AAPLc, qui a rendu `0x0de0b6b3a7640000` (1,0). Un selecteur faux ne plante pas : il interroge
 *   une autre fonction ou aucune, et rend un silence qu on lirait comme « pas de multiplicateur ».
 *   Les deux etapes comptent : le calcul empeche l invention, la verification vivante empeche de
 *   calculer juste sur une signature fausse.
 */
export const SELECTEUR_UI_MULTIPLIER = '0xa60bf13d';

/* Hash de role LUS dans la charge de revert, jamais recites. ⛔ Ils viennent de l appel lui-meme :
 * c est la seule provenance acceptable pour un identifiant. */
export const ROLES_LUS = Object.freeze({
  updateUIMultiplier: '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929',
  batchMint: '0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686',
});

/**
 * Cette hauteur est-elle sous Cobalt ?
 * ⛔ REND `INCONNU` PLUTOT QUE DE PARIER. Un numero de bloc absent, non entier ou negatif n est pas
 *   « avant Cobalt » : c est une absence de mesure, et la confondre avec un fait ferait lire
 *   l ancienne ABI sur une chaine qui a la nouvelle — exactement ce que Base demande d eviter.
 */
export function etatCobalt(bloc) {
  if (typeof bloc !== 'number' || !Number.isFinite(bloc) || !Number.isInteger(bloc) || bloc < 0) {
    return { etat: 'INCONNU', pourquoi: 'no block height was read' };
  }
  if (bloc >= BLOC_COBALT) {
    return { etat: 'ACTIF', pourquoi: 'at or after block ' + BLOC_COBALT + ' (' + HORODATAGE_COBALT + ')' };
  }
  return { etat: 'AVANT', pourquoi: 'before block ' + BLOC_COBALT };
}

/**
 * Lire la forme d une reponse de sonde : ABSENTE / PRESENTE_DROITS / LISIBLE / INDECIS.
 *
 * ⛔ `selecteurEnvoye` EST OBLIGATOIRE, et c est tout le point. Sans lui on ne peut pas reconnaitre
 *   l absence, puisque l absence se lit « la charge egale le selecteur ». Un appelant qui l oublie
 *   obtient INDECIS, jamais ABSENTE — se tromper vers « je ne sais pas » est le seul sens sur.
 */
export function formeDeLaReponse({ selecteurEnvoye, donneeDeRevert, valeur } = {}) {
  if (typeof valeur === 'string' && valeur.startsWith('0x') && valeur.length > 2) {
    return { forme: 'LISIBLE', pourquoi: 'the call returned a value' };
  }
  const sel = typeof selecteurEnvoye === 'string' ? selecteurEnvoye.toLowerCase() : null;
  const d = typeof donneeDeRevert === 'string' ? donneeDeRevert.toLowerCase() : null;
  if (!sel) return { forme: 'INDECIS', pourquoi: 'the selector that was sent is unknown, so absence cannot be recognised' };
  if (!d) return { forme: 'INDECIS', pourquoi: 'no revert payload was read' };
  if (d === sel) return { forme: 'ABSENTE', pourquoi: 'the node echoed the unknown selector back' };
  if (d.startsWith(ERREUR_DROITS)) {
    return { forme: 'PRESENTE_DROITS', pourquoi: 'the function ran and failed its role check, so it exists' };
  }
  return { forme: 'INDECIS', pourquoi: 'the revert payload matches neither absence nor a role refusal' };
}

/**
 * LE MULTIPLICATEUR, LU SUR LES DEUX ACCESSEURS — ET LE REFUS D EN CHOISIR UN.
 *
 * Cobalt ajoute `uiMultiplier()` a cote de `multiplier()`. Mesure du 2026-09-30, apres le fork :
 * les deux concordent sur 15/15 actions, dont DEUX reellement chargees (GOOGLc 1,000377119 et
 * METAc 1,000313792). L accord est donc teste sur du non-neutre, pas seulement sur des 1,0.
 *
 * ⛔⛔ MAIS L ACCORD MESURE NE COUVRE QUE LA DERIVE, PAS LE SPLIT. Les deux valeurs chargees sont a
 *   ~3 bps. Rien ici ne prouve que les deux accesseurs concordent a 2,0 ou 4,0 — et c est
 *   precisement le cas ou l ecart couterait cher, puisque `updateUIMultiplier` existe pour
 *   PROGRAMMER un split. Un accord a 1,0003 n est pas un accord a 4,0.
 *   ⇒ DONC ON NE CHOISIT PAS. En cas d ecart on rend DESACCORD et l ecran se tait. Prendre
 *     silencieusement l un des deux afficherait un solde faux sans aucun symptome — le defaut que
 *     `multiplicateur-action.js` decrit deja : « un split 4:1 rendrait tout affichage derive faux
 *     de 300 %, EN SILENCE. »
 */
export function multiplicateurAccorde({ multiplier, uiMultiplier } = {}) {
  const bon = (v) => typeof v === 'bigint' && v > 0n;
  if (bon(multiplier) && bon(uiMultiplier)) {
    if (multiplier === uiMultiplier) {
      return { etat: 'ACCORD', valeur: multiplier, pourquoi: 'both accessors agree' };
    }
    return { etat: 'DESACCORD', valeur: null,
      pourquoi: 'multiplier() and uiMultiplier() disagree, so no share-equivalent can be shown' };
  }
  /* ⛔ UN SEUL ACCESSEUR LISIBLE N EST PAS UN ACCORD. C est une lecture non corroboree : on la
   *   rend, nommee pour ce qu elle est, pour que l appelant puisse decider — mais elle ne porte
   *   pas le meme poids, et l etat le dit au lieu de se fondre dans ACCORD. */
  if (bon(uiMultiplier)) {
    return { etat: 'SEUL_UI', valeur: uiMultiplier, pourquoi: 'only uiMultiplier() could be read' };
  }
  if (bon(multiplier)) {
    return { etat: 'SEUL_LEGACY', valeur: multiplier, pourquoi: 'only multiplier() could be read' };
  }
  return { etat: 'AUCUNE', valeur: null, pourquoi: 'neither accessor could be read' };
}

/** Peut-on afficher un equivalent en actions ? ⛔ Jamais sur un desaccord, jamais sur une absence. */
export function afficherEquivalent(m) {
  return !!m && (m.etat === 'ACCORD' || m.etat === 'SEUL_UI' || m.etat === 'SEUL_LEGACY');
}

/**
 * L ECRAN DOIT-IL DIRE QUELQUE CHOSE SUR CETTE LECTURE ?
 *
 * ⛔⛔⛔ CETTE FONCTION EXISTE PARCE QUE MON PROPRE SITE D APPEL S EST TROMPE, ET QUE LA FAUTE
 *   ETAIT INVISIBLE. `app.html` calculait la condition a la main :
 *       (desaccord || !afficherEquivalent(acc)) ? montrer la phrase : ''
 *   Or `afficherEquivalent` rend VRAI pour ACCORD **et** pour SEUL_UI/SEUL_LEGACY. Donc une lecture
 *   NON CORROBOREE — un seul accesseur lisible — passait `!true` = faux, et n affichait RIEN : elle
 *   devenait indistinguable d un accord confirme. La phrase portant « (read from one accessor
 *   only) » existait dans ce fichier et n etait JAMAIS montree. Une valeur ecrite puis jetee.
 *   ⛔ ET C EST LE CAS FREQUENT, PAS LE CAS RARE : `uiMultiplier()` est l appel RPC SUPPLEMENTAIRE,
 *     donc le premier a sauter sur une limite de debit. Le silence tombait exactement la ou il
 *     fallait parler.
 *   ⇒ La regle est trop facile a ecrire a l envers pour vivre dans une expression ternaire : elle
 *     vit ici, elle est nommee, et elle est testee. SEUL UN ACCORD COMPLET A LE DROIT D ETRE MUET.
 *   ⇒ Trouve par un audit adversarial, pas par moi, une heure apres avoir ecrit le module.
 */
export function doitDireQuelqueChose(m) {
  return !m || m.etat !== 'ACCORD';
}

/** La phrase montree. ⛔ Le cas muet PARLE : un ecran vide n avertit personne. */
export function phraseMultiplicateur(m) {
  if (!m) return 'Share multiplier: not read.';
  if (m.etat === 'DESACCORD') {
    return 'This token reports two different multipliers on-chain, so this app will not convert your '
      + 'balance into shares. Check the issuer before trading.';
  }
  if (m.etat === 'AUCUNE') return 'Share multiplier: not read, so no share equivalent is shown.';
  const x = Number(m.valeur) / 1e18;
  const suffixe = m.etat === 'ACCORD' ? '' : ' (read from one accessor only)';
  if (x === 1) return 'Multiplier 1.000000x — one unit is one share' + suffixe + '.';
  return 'Multiplier ' + x.toFixed(6) + 'x — balances are not one-to-one with shares' + suffixe + '.';
}
