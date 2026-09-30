/* UN SYMBOLE QUI SE LIT COMME UNE DEVISE N EN EST PAS UNE — ET L ECRAN DOIT LE DIRE.
 *
 * ⛔⛔ LE CAS MESURE (2026-09-30, production, trouve par Phil sur l ecran d un autre agent) :
 *   le selecteur du Brain proposait DEUX entrees « · USDC · …9901 » et « · USDC · …2701 ».
 *   Lecture on-chain des deux :
 *     0xb2…9901  code 0xef (vrai B20)  symbol() « USDC »  name() « UpSideDownCat »
 *     0xb2…2701  code 0xef (vrai B20)  symbol() « USDC »  name() « FatCatBatRatWifHat »
 *   Le VRAI USDC est `0x833589fC…`, 1852 octets de code — ce n est meme pas un B20.
 *
 * ⛔ CE NE SONT PAS DES FAUX. Ce sont de vrais blocks au ticker piegeux : « UpSideDownCat »
 *   donne U-S-D-C, c est un jeu de mots. On ne les accuse de rien, et on ne les cache pas.
 *   ⇒ On rapporte une STRUCTURE (ce symbole se lit comme une devise), jamais une intention.
 *
 * ⛔⛔⛔ LE DEFAUT EST CHEZ NOUS, PAS CHEZ EUX : le selecteur n affiche QUE le symbole. Deux
 *   blocks differents s y lisent « USDC », et aucun n est le stablecoin. Le NOM, qui les
 *   distingue d un coup d oeil, n etait jamais montre. Quelqu un qui choisit « USDC » dans une
 *   liste croit regarder un stablecoin.
 */

/** Le marqueur ajoute au symbole. Court : il vit dans une `<option>` deja dense. */
export const MARQUEUR = '⚠';

export const VERDICTS = Object.freeze(['TROMPEUR', 'LIBRE', 'NON_VERIFIABLE']);

/**
 * Ce symbole se lit-il comme une devise connue, sans etre cette devise ?
 *
 * ⛔ LA LISTE EST OBLIGATOIRE. Sans elle on rend NON_VERIFIABLE : une garde posee sur une liste
 *   absente serait toujours fausse, et celle-ci ne protegerait exactement rien.
 * ⛔ ET L ADRESSE COMPTE : la VRAIE devise porte le meme symbole et ne doit PAS etre marquee.
 *   C est tout le sujet — on distingue l original de son homonyme, pas on marque le mot.
 */
export function symboleTrompeur(symbole, adresse, devises, estANous = null) {
  const s = String(symbole || '').trim();
  if (!s) return { verdict: 'NON_VERIFIABLE', pourquoi: 'SYMBOLE_VIDE', devise: null };
  if (!Array.isArray(devises) || !devises.length) {
    return { verdict: 'NON_VERIFIABLE', pourquoi: 'LISTE_DEVISES_ABSENTE', devise: null };
  }
  const a = String(adresse || '').trim().toLowerCase();
  /* ⛔⛔ ON NE MARQUE PAS LES SIENS (Phil, 2026-09-30 : « marque que ceux des autres »).
   *   Mesure qui a declenche la regle : la garde avait marque « TBLOCK ⚠ · …5949 » — le block
   *   que Phil etait en train de creer, visible sur sa propre capture. Avertir quelqu un contre
   *   lui-meme use l avertissement : au bout de deux fois, on ne le lit plus, et le jour ou il
   *   designe un vrai homonyme il ne sert plus a rien.
   * ⛔ LE TEST PASSE AVANT LA LISTE DES DEVISES, mais APRES les refus : un symbole vide reste
   *   NON_VERIFIABLE meme s il est a nous — on ne transforme pas une ignorance en accord.
   * ⛔ ET SEUL UN `true` FRANC COMPTE : un lecteur qui leve, qui rend `undefined` ou autre chose
   *   ne doit PAS faire taire la garde. Le doute profite au lecteur, pas au block. */
  if (a && typeof estANous === 'function') {
    let mien = false;
    try { mien = estANous(a) === true; } catch (_) { mien = false; }
    if (mien) return { verdict: 'LIBRE', pourquoi: 'EST_LE_NOTRE', devise: null };
  }
  for (const d of devises) {
    if (!d || !d.symbole) continue;
    if (String(d.symbole).trim().toLowerCase() !== s.toLowerCase()) continue;
    /* ⛔ C EST LA VRAIE : on ne marque pas l original. */
    if (a && String(d.adr || '').trim().toLowerCase() === a) {
      return { verdict: 'LIBRE', pourquoi: 'EST_LA_VRAIE', devise: d.symbole };
    }
    return { verdict: 'TROMPEUR', pourquoi: 'MEME_SYMBOLE_AUTRE_ADRESSE', devise: d.symbole };
  }
  return { verdict: 'LIBRE', pourquoi: null, devise: null };
}

/**
 * Le symbole tel qu il doit s afficher dans une liste.
 * ⛔ ON N EFFACE PAS LE SYMBOLE : le cacher priverait le lecteur de ce que le block dit de
 *   lui-meme. On AJOUTE un marqueur, et la phrase d explication vit a cote.
 */
export function symbolePourListe(symbole, adresse, devises, estANous = null) {
  const s = String(symbole || '').trim() || '?';
  const v = symboleTrompeur(s, adresse, devises, estANous);
  return v.verdict === 'TROMPEUR' ? s + ' ' + MARQUEUR : s;
}

/**
 * La phrase qui explique le marqueur. ⛔ Elle nomme la devise usurpee — sans elle, le « ⚠ »
 *   serait un signe sans cause, et un avertissement qu on ne comprend pas ne protege personne.
 * ⛔ Rend '' quand il n y a rien a dire : ici le silence EST le succes.
 */
export function phraseTrompeur(v) {
  if (!v || !VERDICTS.includes(v.verdict)) return '';
  if (v.verdict !== 'TROMPEUR') return '';
  return MARQUEUR + ' This block\'s ticker reads like ' + v.devise
    + ', but it is a block — not ' + v.devise + ' itself.';
}
