/* parts-holders.js — qui detient VRAIMENT un block, et quelle part de recompense lui reviendrait.
 *
 * ⛔⛔ MESURE QUI A DICTE CE FICHIER (2026-09-20, deux jetons independants, reconstruction verifiee
 *    au wei pres contre balanceOf sur 3/3 puis 7/7 adresses) :
 *      le PoolManager d Uniswap detient 99,89 % de la supply, sur LES DEUX.
 *    Ce n est pas un hasard : `lancer-pool.js` place 99,9 % de la supply dans la pool permanente au
 *    lancement (MARGE_POUR_MILLE = 999). Une distribution au prorata BRUT enverrait donc 99,89 % de la
 *    recompense dans une pool dont la position appartient a l adresse morte — l argent serait brule.
 *
 * ⛔ ON EXCLUT UNE LISTE NOMMEE, PAS « TOUTE ADRESSE AVEC DU CODE ». Exclure le code excluerait les
 *    smart wallets (EIP-7702, ERC-4337), qui sont de VRAIS detenteurs : la garde serait vraie et
 *    couvrirait la mauvaise moitie. La liste ci-dessous est courte, nommee et verifiable.
 *
 * ⛔ ET L EXCLUSION EST RENDUE, PAS AVALEE : `exclus` sort dans le resultat avec ses montants, pour
 *    qu un ecran puisse dire « 99,89 % sont dans la pool » au lieu de laisser croire a 3 detenteurs.
 */

/** Adresses qui ne sont pas des detenteurs au sens de la recompense. Nommees une par une. */
export const EXCLUS = Object.freeze({
  '0x498581ff718922c3f8e6a244956af099b2652b2b': 'Uniswap v4 PoolManager (la liquidite du marche)',
  '0x7c5f5a4bbd8fd63184577525326123b519429bdc': 'Uniswap v4 PositionManager',
  '0x000000000000000000000000000000000000dead': 'adresse morte (position de lancement, non retirable)',
  '0x0000000000000000000000000000000000000000': 'adresse zero',
  '0xaa6d7bd9fc7d394bc717137936f2939834382044': 'notre hook V1',
  '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044': 'notre hook V2',
  '0x7a7cebb2ccb84c9fbfa2730e6cb23bb192166044': 'notre hook V3',
  '0x11fcd588c96b1781cc88b8b9f349b6067d9be4c4': 'notre hook V4',
  '0x799136c3f5f572f1597b5b7e067d3ee45fe4a4c4': 'notre hook V5',
});

export const ETATS_PART = Object.freeze(['PAYABLE', 'AUCUN_DETENTEUR', 'RIEN_A_PARTAGER']);

/**
 * Repartit un pot entre les detenteurs reels, au prorata de ce qu ils detiennent HORS pool.
 *
 * ⛔ AUCUN WEI NE SE PERD ET AUCUN N EST INVENTE : les parts sont calculees par division entiere, puis
 *    le RESTE est donne au premier detenteur. `somme(parts) === pot` est verifie avant de rendre.
 * ⛔ « AUCUN DETENTEUR » A SA PROPRE BRANCHE : rendre un tableau vide se lirait comme « rien a payer »,
 *    alors que ca veut dire « personne a payer, garde le pot ». Ce sont deux choses differentes.
 *
 * @param {object} e
 * @param {Array<[string, bigint]>} e.soldes  couples [adresse, solde] reconstruits ET verifies
 * @param {bigint} e.pot                       ce qu il y a a distribuer, en wei du jeton de recompense
 * @param {object} [e.exclus]                  surcharge de la liste d exclusion (tests)
 */
export function partsHolders({ soldes, pot, exclus = EXCLUS }) {
  if (typeof pot !== 'bigint' || pot < 0n) throw new Error('pot must be a non-negative bigint');
  const dehors = [], dedans = [];
  for (const [adrBrute, solde] of soldes || []) {
    const adr = String(adrBrute || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(adr)) continue;
    if (typeof solde !== 'bigint' || solde <= 0n) continue;
    (exclus[adr] ? dedans : dehors).push([adr, solde]);
  }
  /* ⛔ Tri deterministe : a solde egal, l adresse tranche. Un ordre qui bouge ferait bouger le reste
   *    d arrondi d un bloc a l autre, donc le merkle root, sans qu aucune donnee n ait change. */
  dehors.sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : (a[0] < b[0] ? -1 : 1)));
  const baseExclue = dedans.reduce((s, [, v]) => s + v, 0n);
  const base = dehors.reduce((s, [, v]) => s + v, 0n);

  const commun = {
    exclus: dedans.map(([adr, v]) => ({ adr, montant: v, pourquoi: exclus[adr] })),
    baseExclue,
    base,
    /* ⛔ LA BORNE VOYAGE AVEC LE RESULTAT : un appelant qui n afficherait que `parts` laisserait croire
     *    que la supply entiere est entre ces mains-la. */
    borne: 'Shares are pro rata of the supply held OUTSIDE the market pool and our own contracts. '
      + 'At launch the pool holds 99.9% of a block by design, so it is excluded on purpose.',
  };
  if (!dehors.length) return { etat: 'AUCUN_DETENTEUR', parts: [], ...commun };
  if (pot === 0n) return { etat: 'RIEN_A_PARTAGER', parts: [], ...commun };

  const parts = dehors.map(([adr, solde]) => ({ adr, solde, montant: (pot * solde) / base }));
  /* le reste d arrondi va au plus gros detenteur, de facon deterministe */
  const distribue = parts.reduce((s, p) => s + p.montant, 0n);
  parts[0].montant += pot - distribue;
  const total = parts.reduce((s, p) => s + p.montant, 0n);
  if (total !== pot) throw new Error('repartition incoherente : ' + total + ' != ' + pot);
  return { etat: 'PAYABLE', parts, ...commun };
}
