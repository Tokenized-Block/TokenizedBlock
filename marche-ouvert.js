// marche-ouvert.js — « V8-open » : un SECOND marche, ouvert et annonce, pour un token ne ailleurs.
// ================================================================================================
// ⛔ CE QUI EST IMPOSSIBLE, DIT D ABORD : le hook d une pool v4 est FIGE a son initialisation. Les pools
//    LaunchBlitz/o1, Clanker, Zora, bankr GARDERONT leurs frais pour toujours. TB ne « recupere » rien la-bas.
// ⛔ CE QUI EST POSSIBLE : ouvrir A COTE une pool ETH/<token> dont le hook (contracts/foreign-open,
//    TBlockOpenMarketHook) preleve UN frais annonce en ETH -> a6cf. Preuve wei-exacte sur fork (bloc 52 074 194,
//    BRIAN) : 9/9 verts. NON DEPLOYE : `HOOK_MARCHE_OUVERT` est null, donc ce module ne route RIEN.
// ⛔ REGLE DE ROUTAGE (le GO de Phil, 2026-10-02) : « Buy here » ne prend la pool qui paie a6cf QUE si
//    l acheteur recoit AU MOINS autant (frais compris, tout compris). Sinon on garde la meilleure pool et on
//    DIT l ecart. Jamais de frais cache, jamais de prix degrade en silence.

/** Adresse du hook une fois deploye (null = non deploye -> aucun routage). */
export const HOOK_MARCHE_OUVERT = null;
export const MARCHE_OUVERT_ACTIF = false;
/** frais du hook, en pips de 1e6 (2000 = 0,20 %) — le constructeur refuse > 1 %. */
export const FRAIS_MARCHE_OUVERT_PIPS = 2000;

export function estHookMarcheOuvert(h, hook = HOOK_MARCHE_OUVERT) {
  return !!hook && String(h || '').toLowerCase() === String(hook).toLowerCase();
}

/**
 * Choisit entre la meilleure pool etrangere et la pool qui paie a6cf, sur des DEVIS LUS (quoter), pas estimes.
 * @param {{ devisEtranger: bigint|null, devisA6cf: bigint|null, actif?: boolean }} o — sorties nettes pour l acheteur
 * @returns {{ choix: 'A6CF'|'ETRANGER'|'AUCUN', pourquoi: string, ecart: bigint|null }}
 *   ⛔ `ecart` = devisA6cf - devisEtranger (negatif = la pool TB donnerait MOINS ; c est ce qu on affiche).
 */
export function choisirMarche({ devisEtranger, devisA6cf, actif = MARCHE_OUVERT_ACTIF }) {
  const lu = (x) => typeof x === 'bigint' && x > 0n;
  if (!lu(devisEtranger) && !lu(devisA6cf)) return { choix: 'AUCUN', pourquoi: 'no quote read', ecart: null };
  if (!actif || !lu(devisA6cf)) return { choix: 'ETRANGER', pourquoi: actif ? 'TB market not quoted' : 'flag off', ecart: null };
  if (!lu(devisEtranger)) return { choix: 'A6CF', pourquoi: 'only market quoted', ecart: null };
  const ecart = devisA6cf - devisEtranger;
  if (ecart >= 0n) return { choix: 'A6CF', pourquoi: 'same or better price for the buyer', ecart };
  return { choix: 'ETRANGER', pourquoi: 'TB market would give less — kept the better price', ecart };
}

/** La phrase a l ecran. Le frais de la pool TB est TOUJOURS nomme quand on la choisit. */
export function phraseChoix(r, symbole = 'tokens') {
  if (r.choix === 'A6CF') {
    return 'Routed through the TokenizedBlock market: you receive at least as many ' + symbole
      + ' as on the other market. It charges ' + (FRAIS_MARCHE_OUVERT_PIPS / 10000) + ' % in ETH to TokenizedBlock.';
  }
  if (r.choix === 'ETRANGER' && typeof r.ecart === 'bigint' && r.ecart < 0n) {
    return 'The TokenizedBlock market would give you less on this trade, so we kept the better price.';
  }
  return '';
}
